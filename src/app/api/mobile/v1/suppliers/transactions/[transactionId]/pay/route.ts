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
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ transactionId: string }> },
) {
  const { transactionId } = await context.params;
  return withMobileAuth(
    req,
    async ({ session, tenantId, clientMutationId }) => {
      const body = await req.json().catch(() => ({}));
      const mutationId = extractClientMutationId(req, body) || clientMutationId;

      const result = await runWithIdempotency({
        tenantId,
        clientMutationId: mutationId,
        endpoint: `POST:/api/mobile/v1/suppliers/transactions/${transactionId}/pay`,
        handler: async () => {
          const paymentAmount = Math.max(0, Number(body.paymentAmount ?? 0));
          if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
            throw new HttpStatusError(
              "Payment amount must be greater than zero.",
              400,
            );
          }

          const nowIso = new Date().toISOString();
          const eventsToPublish: SyncEventRecord[] = [];
          let updatedRow: any = null;

          const trx = await db.transaction();
          try {
            const tx = await trx("supplier_transactions")
              .where({ id: transactionId, tenant_id: tenantId })
              .first();
            if (!tx) {
              throw new HttpStatusError("Supplier transaction not found.", 404);
            }

            const total = Number(tx.total_amount ?? 0);
            const currentPaid = Number(tx.amount_paid ?? 0);
            const currentBalance = Math.max(0, total - currentPaid);
            if (currentBalance <= 0) {
              throw new HttpStatusError("Transaction balance is already settled.", 409);
            }

            const applied = Math.min(currentBalance, paymentAmount);
            const nextPaid = currentPaid + applied;
            const nextBalance = Math.max(0, total - nextPaid);
            const nextStatus = nextBalance <= 0 ? "completed" : "pending";
            const notesAppend = body.notes
              ? `${tx.notes ? `${tx.notes}\n` : ""}Payment: ${String(body.notes).trim()}`
              : tx.notes;

            await trx("supplier_transactions")
              .where({ id: transactionId, tenant_id: tenantId })
              .update({
                amount_paid: nextPaid,
                balance: nextBalance,
                status: nextStatus,
                payment_mode: body.paymentMode || tx.payment_mode,
                notes: notesAppend,
                updated_at: nowIso,
              });

            eventsToPublish.push(
              await insertSyncEvent(trx, {
                tenantId,
                entityType: "supplier_transaction",
                entityId: transactionId,
                action: "upsert",
                actorUserId: session.id,
              }),
            );

            updatedRow = await trx("supplier_transactions")
              .where({ id: transactionId, tenant_id: tenantId })
              .first();
            await trx.commit();
          } catch (err) {
            await trx.rollback();
            throw err;
          }

          for (const evt of eventsToPublish) {
            publishSyncEvent(evt);
          }

          return {
            statusCode: 200,
            body: {
              id: String(updatedRow.id),
              transactionNo: String(
                updatedRow.transaction_no ||
                  `SUP-${String(updatedRow.id).slice(0, 8)}`,
              ),
              supplierId: String(updatedRow.supplier_id),
              deliveredBy: updatedRow.delivered_by || undefined,
              transactionDate: String(
                updatedRow.transaction_date ||
                  updatedRow.created_at ||
                  nowIso,
              ),
              totalAmount: Number(updatedRow.total_amount ?? 0),
              amountPaid: Number(updatedRow.amount_paid ?? 0),
              balance: Math.max(0, Number(updatedRow.balance ?? 0)),
              paymentMode: updatedRow.payment_mode || "cash",
              status: updatedRow.status || "completed",
              notes: updatedRow.notes || undefined,
            },
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
