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
  getSaleReceiptDetailDto,
  HttpStatusError,
  parseSaleDetails,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function POST(
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
      endpoint: `POST:/api/mobile/v1/sales/${id}/refund`,
      handler: async () => {
        const restockItems = body.restockItems !== false;
        const reason = body.reason ? String(body.reason).trim() : "Customer refund";
        const nowIso = new Date().toISOString();
        const eventsToPublish: SyncEventRecord[] = [];

        const trx = await db.transaction();
        try {
          const sale = await trx("sales")
            .where({ id, tenant_id: tenantId })
            .first();
          if (!sale) {
            throw new HttpStatusError("Sale not found.", 404);
          }

          const details = parseSaleDetails(sale.details);
          if (sale.status === "failed" || details.refunded) {
            throw new HttpStatusError("Sale has already been refunded.", 409);
          }

          const nextDetails = {
            ...details,
            refunded: true,
            refundReason: reason,
            refundedAt: nowIso,
            refundedBy: session.username,
          };

          await trx("sales")
            .where({ id, tenant_id: tenantId })
            .update({
              status: "failed",
              details: JSON.stringify(nextDetails),
              updated_at: nowIso,
            });

          if (restockItems) {
            const items = await trx("sale_items")
              .where({ sales_id: id, tenant_id: tenantId })
              .select("product_id", "quantity");

            for (const item of items) {
              const qty = Math.trunc(Number(item.quantity ?? 0));
              if (qty <= 0) continue;

              const updated = await trx("products")
                .where({ id: item.product_id, tenant_id: tenantId })
                .update({
                  stock_quantity: db.raw("stock_quantity + ?", [qty]),
                  version: db.raw("COALESCE(version, 1) + 1"),
                  updated_at: nowIso,
                });

              if (updated === 1) {
                const refreshed = await trx("products")
                  .where({ id: item.product_id, tenant_id: tenantId })
                  .first("stock_quantity", "version");

                eventsToPublish.push(
                  await insertSyncEvent(trx, {
                    tenantId,
                    entityType: "product",
                    entityId: String(item.product_id),
                    action: "stock_delta",
                    payload: {
                      delta: qty,
                      stock_quantity: Number(refreshed?.stock_quantity ?? 0),
                      version: Number(refreshed?.version ?? 1),
                    },
                    actorUserId: session.id,
                  }),
                );
              }
            }
          }

          eventsToPublish.push(
            await insertSyncEvent(trx, {
              tenantId,
              entityType: "sale",
              entityId: id,
              action: "upsert",
              payload: { refunded: true },
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

        const receipt = await getSaleReceiptDetailDto(tenantId, id, session);
        return {
          statusCode: 200,
          body: receipt,
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
