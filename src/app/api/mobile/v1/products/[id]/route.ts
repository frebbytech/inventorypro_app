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

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withMobileAuth(req, async ({ tenantId }) => {
    const product = await db("v_product_catalog")
      .where({ product_id: id, tenant_id: tenantId })
      .first();
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const salesRows = await db("sale_items as si")
      .innerJoin("sales as s", "si.sales_id", "s.id")
      .leftJoin("customers as c", "s.customer_id", "c.id")
      .where({ "si.product_id": id, "s.tenant_id": tenantId })
      .orderBy("s.date", "desc")
      .limit(25)
      .select(
        "si.id",
        "s.id as sale_id",
        "s.receipt_number",
        "c.name as customer_name",
        "si.quantity",
        "si.unit_price",
        "s.date as sale_date",
        "s.payment_mode",
      );

    return NextResponse.json({
      product: mapProductRow(product),
      recentSales: salesRows.map((r: any) => {
        const qty = Number(r.quantity ?? 0);
        const up = Number(r.unit_price ?? 0);
        return {
          id: String(r.id),
          saleId: String(r.sale_id),
          receiptNo: String(
            r.receipt_number || `INVP-${String(r.sale_id).slice(0, 8)}`,
          ),
          customerName: String(r.customer_name || "Walk-in Customer"),
          quantity: qty,
          unitPrice: up,
          subtotal: qty * up,
          saleDate: String(r.sale_date || new Date().toISOString()),
          paymentMode: r.payment_mode || "cash",
        };
      }),
    });
  });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withMobileAuth(
    req,
    async ({ session, tenantId, clientMutationId }) => {
      const body = await req.json().catch(() => ({}));
      const mutationId = extractClientMutationId(req, body) || clientMutationId;

      const result = await runWithIdempotency({
        tenantId,
        clientMutationId: mutationId,
        endpoint: `PATCH:/api/mobile/v1/products/${id}`,
        handler: async () => {
          const existing = await db("products")
            .where({ id, tenant_id: tenantId })
            .first();
          if (!existing) {
            throw new HttpStatusError("Product not found.", 404);
          }

          const nowIso = new Date().toISOString();
          const updates: Record<string, any> = {
            updated_at: nowIso,
            version: db.raw("COALESCE(version, 1) + 1"),
          };
          const eventsToPublish: SyncEventRecord[] = [];

          const trx = await db.transaction();
          try {
            if (body.name !== undefined) {
              const name = String(body.name).trim();
              if (!name) throw new HttpStatusError("Product name is required.", 400);
              updates.name = name;
            }
            if (body.categoryName !== undefined) {
              const cat = await ensureCategoryIdForTenant(
                trx as any,
                tenantId,
                session.id,
                body.categoryName,
              );
              updates.category_id = cat.id;
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
            }
            if (body.barcode !== undefined) {
              updates.barcode = String(body.barcode ?? "").trim();
            }
            if (body.description !== undefined) {
              updates.description = String(body.description ?? "").trim();
            }
            if (body.costPrice !== undefined) {
              updates.cost_price = Math.max(0, Number(body.costPrice));
            }
            if (body.unitPrice !== undefined) {
              updates.unit_price = Math.max(0, Number(body.unitPrice));
            }
            if (body.lowStockThreshold !== undefined) {
              updates.low_stock_threshold = Math.max(
                1,
                Math.trunc(Number(body.lowStockThreshold)),
              );
            }
            if (body.active !== undefined) {
              updates.is_active = body.active ? 1 : 0;
            }

            await trx("products")
              .where({ id, tenant_id: tenantId })
              .update(updates);

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

          const refreshed = await db("v_product_catalog")
            .where({ product_id: id, tenant_id: tenantId })
            .first();

          return {
            statusCode: 200,
            body: mapProductRow(refreshed),
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
