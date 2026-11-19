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
  mapProductRow,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withMobileAuth(req, async ({ session, tenantId, clientMutationId }) => {
    const body = await req.json().catch(() => ({}));
    const mutationId = extractClientMutationId(req, body) || clientMutationId;

    const result = await runWithIdempotency({
      tenantId,
      clientMutationId: mutationId,
      endpoint: `PATCH:/api/mobile/v1/products/${id}/stock`,
      handler: async () => {
        const nowIso = new Date().toISOString();
        const eventsToPublish: SyncEventRecord[] = [];
        let actualDelta = 0;

        const trx = await db.transaction();
        try {
          if (typeof body.delta === "number" && Number.isFinite(body.delta)) {
            const delta = Math.trunc(body.delta);
            actualDelta = delta;

            let q = trx("products").where({ id, tenant_id: tenantId });
            if (delta < 0) {
              q = q.andWhere("stock_quantity", ">=", Math.abs(delta));
            }
            const affected = await q.update({
              stock_quantity: db.raw("stock_quantity + ?", [delta]),
              version: db.raw("COALESCE(version, 1) + 1"),
              updated_at: nowIso,
            });

            if (affected !== 1) {
              const prod = await trx("products")
                .where({ id, tenant_id: tenantId })
                .first("name", "stock_quantity");
              if (!prod) {
                throw new HttpStatusError("Product not found.", 404);
              }
              throw new HttpStatusError(
                `Insufficient stock for ${prod.name}. Available: ${prod.stock_quantity}.`,
                409,
              );
            }
          } else if (
            typeof body.setQuantity === "number" &&
            Number.isFinite(body.setQuantity)
          ) {
            const nextQty = Math.max(0, Math.trunc(body.setQuantity));
            const existing = await trx("products")
              .where({ id, tenant_id: tenantId })
              .first("id", "stock_quantity");
            if (!existing) {
              throw new HttpStatusError("Product not found.", 404);
            }
            actualDelta = nextQty - Number(existing.stock_quantity ?? 0);

            await trx("products")
              .where({ id, tenant_id: tenantId })
              .update({
                stock_quantity: nextQty,
                version: db.raw("COALESCE(version, 1) + 1"),
                updated_at: nowIso,
              });
          } else {
            throw new HttpStatusError(
              "Provide either 'delta' or 'setQuantity' to adjust stock.",
              400,
            );
          }

          const refreshed = await trx("products")
            .where({ id, tenant_id: tenantId })
            .first("stock_quantity", "version");

          eventsToPublish.push(
            await insertSyncEvent(trx, {
              tenantId,
              entityType: "product",
              entityId: id,
              action: "stock_delta",
              payload: {
                delta: actualDelta,
                stock_quantity: Number(refreshed?.stock_quantity ?? 0),
                version: Number(refreshed?.version ?? 1),
                reason: body.reason ? String(body.reason) : undefined,
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

        const catalogRow = await db("v_product_catalog")
          .where({ product_id: id, tenant_id: tenantId })
          .first();

        return {
          statusCode: 200,
          body: mapProductRow(catalogRow),
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
