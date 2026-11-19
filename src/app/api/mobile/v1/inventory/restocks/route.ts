import { NextResponse } from "next/server";
import db from "@/db/knex";
import {
  insertSyncEvent,
  publishSyncEvent,
  runWithIdempotency,
  type SyncEventRecord,
} from "@/lib/sync-bus";
import {
  extractClientMutationId,
  HttpStatusError,
  resolveDefaultSupplierIdForTenant,
  withMobileAuth,
} from "@/lib/mobile-api";
import { generateId } from "@/utils/generator";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ tenantId }) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const productId = url.searchParams.get("productId")?.trim() || "";
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));

    let query = db("inventory as i")
      .leftJoin("products as p", "i.product_id", "p.id")
      .leftJoin("product_categories as pc", "i.product_category_id", "pc.id")
      .leftJoin("users as u", "i.user_id", "u.id")
      .where("i.tenant_id", tenantId)
      .select(
        "i.id",
        "i.product_id",
        "p.name as product_name",
        "pc.name as category_name",
        "i.quantity",
        "i.restock_date",
        "u.username as user_name",
        "i.created_at",
      )
      .orderBy("i.created_at", "desc")
      .limit(limit);

    if (productId) {
      query = query.where("i.product_id", productId);
    }

    const rows = await query;
    const filtered = q
      ? rows.filter(
          (r: any) =>
            String(r.product_name || "").toLowerCase().includes(q) ||
            String(r.category_name || "").toLowerCase().includes(q),
        )
      : rows;

    return NextResponse.json(
      filtered.map((r: any) => ({
        id: String(r.id),
        productId: String(r.product_id),
        productName: String(r.product_name || "Product"),
        categoryName: String(r.category_name || "General"),
        quantity: Number(r.quantity ?? 0),
        restockDate: String(r.restock_date || r.created_at || new Date().toISOString()),
        notes: "",
        userName: String(r.user_name || "Staff"),
        createdAt: String(r.created_at || new Date().toISOString()),
      })),
    );
  });
}

export async function POST(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId, clientMutationId }) => {
    const body = await req.json().catch(() => ({}));
    const mutationId = extractClientMutationId(req, body) || clientMutationId;

    const result = await runWithIdempotency({
      tenantId,
      clientMutationId: mutationId,
      endpoint: "POST:/api/mobile/v1/inventory/restocks",
      handler: async () => {
        const productId = String(body.productId ?? "").trim();
        const quantity = Math.trunc(Number(body.quantity ?? 0));
        if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
          throw new HttpStatusError(
            "Valid productId and quantity (> 0) are required.",
            400,
          );
        }

        const nowIso = new Date().toISOString();
        const restockDate = body.restockDate
          ? String(body.restockDate)
          : nowIso.slice(0, 10);
        const notes = body.notes ? String(body.notes).trim() : "";
        const id = generateId();
        const eventsToPublish: SyncEventRecord[] = [];
        let productName = "Product";
        let categoryName = "General";

        const trx = await db.transaction();
        try {
          const product = await trx("products as p")
            .leftJoin("product_categories as pc", "p.category_id", "pc.id")
            .where({ "p.id": productId, "p.tenant_id": tenantId })
            .select("p.id", "p.name", "p.category_id", "pc.name as category_name")
            .first();

          if (!product) {
            throw new HttpStatusError("Product not found.", 404);
          }

          productName = String(product.name);
          categoryName = String(product.category_name || "General");

          const supplierId = await resolveDefaultSupplierIdForTenant(
            trx as any,
            tenantId,
            session.id,
          );

          await trx("inventory").insert({
            id,
            tenant_id: tenantId,
            user_id: session.id,
            supplier_id: supplierId,
            product_category_id: product.category_id,
            product_id: productId,
            quantity,
            restock_date: restockDate,
            created_at: nowIso,
            updated_at: nowIso,
          });

          await trx("products")
            .where({ id: productId, tenant_id: tenantId })
            .update({
              stock_quantity: db.raw("stock_quantity + ?", [quantity]),
              version: db.raw("COALESCE(version, 1) + 1"),
              updated_at: nowIso,
            });

          const refreshed = await trx("products")
            .where({ id: productId, tenant_id: tenantId })
            .first("stock_quantity", "version");

          eventsToPublish.push(
            await insertSyncEvent(trx, {
              tenantId,
              entityType: "inventory",
              entityId: id,
              action: "upsert",
              actorUserId: session.id,
            }),
          );
          eventsToPublish.push(
            await insertSyncEvent(trx, {
              tenantId,
              entityType: "product",
              entityId: productId,
              action: "stock_delta",
              payload: {
                delta: quantity,
                stock_quantity: Number(refreshed?.stock_quantity ?? 0),
                version: Number(refreshed?.version ?? 1),
              },
              actorUserId: session.id,
            }),
          );

          await trx.commit();
        } catch (err) {
          await trx.rollback();
          throw err;
        }

        for (const evt of eventsToPublish) {
          publishSyncEvent(evt);
        }

        return {
          statusCode: 201,
          body: {
            id,
            productId,
            productName,
            categoryName,
            quantity,
            restockDate,
            notes,
            userName: session.username,
            createdAt: nowIso,
          },
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
