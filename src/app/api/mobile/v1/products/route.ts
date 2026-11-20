import { NextResponse } from "next/server";
import db from "@/db/knex";
import {
  insertSyncEvent,
  publishSyncEvent,
  runWithIdempotency,
  type SyncEventRecord,
} from "@/lib/sync-bus";
import {
  ensureCategoryIdForTenant,
  extractClientMutationId,
  HttpStatusError,
  mapProductRow,
  withMobileAuth,
} from "@/lib/mobile-api";
import { generateId } from "@/utils/generator";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ tenantId }) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const category = url.searchParams.get("category")?.trim() || "";
    const stock = url.searchParams.get("stock")?.trim() || "all";
    const thresholdParam = Number(url.searchParams.get("threshold") || 0);

    const rows = await db("v_product_catalog")
      .where("tenant_id", tenantId)
      .select("*")
      .orderBy("updated_at", "desc");

    let items = rows.map(mapProductRow);

    if (q) {
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q),
      );
    }

    if (category && category !== "All") {
      items = items.filter(
        (p) => p.categoryName.toLowerCase() === category.toLowerCase(),
      );
    }

    if (stock === "out_of_stock") {
      items = items.filter((p) => p.stockQuantity <= 0);
    } else if (stock === "low_stock") {
      items = items.filter((p) => {
        const limit =
          thresholdParam >= 1 ? thresholdParam : p.lowStockThreshold || 5;
        return p.stockQuantity > 0 && p.stockQuantity <= limit;
      });
    } else if (stock === "in_stock") {
      items = items.filter((p) => p.stockQuantity > 0);
    }

    return NextResponse.json(items);
  });
}

export async function POST(req: Request) {
  return withMobileAuth(
    req,
    async ({ session, tenantId, clientMutationId }) => {
      const body = await req.json().catch(() => ({}));
      const mutationId = extractClientMutationId(req, body) || clientMutationId;

      const result = await runWithIdempotency({
        tenantId,
        clientMutationId: mutationId,
        endpoint: "POST:/api/mobile/v1/products",
        handler: async () => {
          const name = String(body.name ?? "").trim();
          if (!name) {
            throw new HttpStatusError("Product name is required.", 400);
          }

          const costPrice = Math.max(0, Number(body.costPrice ?? 0));
          const unitPrice = Math.max(0, Number(body.unitPrice ?? 0));
          const stockQuantity = Math.max(
            0,
            Math.trunc(Number(body.stockQuantity ?? 0)),
          );
          const lowStockThreshold = Math.max(
            1,
            Math.trunc(Number(body.lowStockThreshold ?? 5)),
          );
          const barcode = String(body.barcode ?? "").trim();
          const photoUrl = body.photoUrl ? String(body.photoUrl).trim() : null;
          const description = String(body.description ?? "").trim();
          const isActive = body.active !== false ? 1 : 0;
          const nowIso = new Date().toISOString();
          const id = generateId();
          const eventsToPublish: SyncEventRecord[] = [];

          const trx = await db.transaction();
          try {
            const cat = await ensureCategoryIdForTenant(
              trx as any,
              tenantId,
              session.id,
              body.categoryName,
            );

            await trx("products").insert({
              id,
              tenant_id: tenantId,
              user_id: session.id,
              category_id: cat.id,
              name,
              description,
              barcode,
              photo_url: photoUrl,
              cost_price: costPrice,
              unit_price: unitPrice,
              stock_quantity: stockQuantity,
              low_stock_threshold: lowStockThreshold,
              version: 1,
              is_active: isActive,
              created_at: nowIso,
              updated_at: nowIso,
            });

            if (cat.created) {
              eventsToPublish.push(
                await insertSyncEvent(trx, {
                  tenantId,
                  entityType: "category",
                  entityId: cat.id,
                  action: "upsert",
                  actorUserId: session.id,
                }),
              );
            }

            eventsToPublish.push(
              await insertSyncEvent(trx, {
                tenantId,
                entityType: "product",
                entityId: id,
                action: "upsert",
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

          const created = await db("v_product_catalog")
            .where({ product_id: id, tenant_id: tenantId })
            .first();

          return {
            statusCode: 201,
            body: mapProductRow(created),
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
