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

export async function POST(req: Request) {
  return withMobileAuth(
    req,
    async ({ session, tenantId, clientMutationId }) => {
      const body = await req.json().catch(() => ({}));
      const mutationId = extractClientMutationId(req, body) || clientMutationId;

      const result = await runWithIdempotency({
        tenantId,
        clientMutationId: mutationId,
        endpoint: "POST:/api/mobile/v1/products/bulk",
        handler: async () => {
          const itemsInput: any[] = Array.isArray(body.items) ? body.items : [];
          if (itemsInput.length === 0) {
            throw new HttpStatusError("No products provided.", 400);
          }

          const nowIso = new Date().toISOString();
          const createdIds: string[] = [];
          let newCategoriesCount = 0;
          const eventsToPublish: SyncEventRecord[] = [];

          const trx = await db.transaction();
          try {
            for (const item of itemsInput) {
              const name = String(item.name ?? "").trim();
              if (!name) continue;

              const cat = await ensureCategoryIdForTenant(
                trx as any,
                tenantId,
                session.id,
                item.categoryName,
              );
              if (cat.created) newCategoriesCount += 1;

              const id = generateId();
              await trx("products").insert({
                id,
                tenant_id: tenantId,
                user_id: session.id,
                category_id: cat.id,
                name,
                description: String(item.description ?? "").trim(),
                barcode: String(item.barcode ?? "").trim(),
                cost_price: Math.max(0, Number(item.costPrice ?? 0)),
                unit_price: Math.max(0, Number(item.unitPrice ?? 0)),
                stock_quantity: Math.max(
                  0,
                  Math.trunc(Number(item.stockQuantity ?? 0)),
                ),
                low_stock_threshold: Math.max(
                  1,
                  Math.trunc(Number(item.lowStockThreshold ?? 5)),
                ),
                version: 1,
                is_active: item.active !== false ? 1 : 0,
                created_at: nowIso,
                updated_at: nowIso,
              });
              createdIds.push(id);
            }

            if (newCategoriesCount > 0) {
              eventsToPublish.push(
                await insertSyncEvent(trx, {
                  tenantId,
                  entityType: "category",
                  entityId: "bulk",
                  action: "refresh",
                  actorUserId: session.id,
                }),
              );
            }

            eventsToPublish.push(
              await insertSyncEvent(trx, {
                tenantId,
                entityType: "product",
                entityId: "bulk",
                action: "refresh",
                payload: { count: createdIds.length },
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

          const rows =
            createdIds.length > 0
              ? await db("v_product_catalog")
                  .where("tenant_id", tenantId)
                  .whereIn("product_id", createdIds)
                  .select("*")
              : [];

          return {
            statusCode: 201,
            body: {
              createdCount: createdIds.length,
              newCategoriesCount,
              products: rows.map(mapProductRow),
            },
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
