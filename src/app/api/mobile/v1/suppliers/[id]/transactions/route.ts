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
import { generateId } from "@/utils/generator";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: supplierId } = await context.params;
  return withMobileAuth(
    req,
    async ({ session, tenantId, clientMutationId }) => {
      const body = await req.json().catch(() => ({}));
      const mutationId = extractClientMutationId(req, body) || clientMutationId;

      const result = await runWithIdempotency({
        tenantId,
        clientMutationId: mutationId,
        endpoint: `POST:/api/mobile/v1/suppliers/${supplierId}/transactions`,
        handler: async () => {
          const supplier = await db("suppliers")
            .where({ id: supplierId, tenant_id: tenantId })
            .first("id");
          if (!supplier) {
            throw new HttpStatusError("Supplier not found.", 404);
          }

          const totalAmount = Math.max(0, Number(body.totalAmount ?? 0));
          if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            throw new HttpStatusError(
              "Transaction total amount must be greater than zero.",
              400,
            );
          }

          const amountPaid = Math.min(
            totalAmount,
            Math.max(
              0,
              body.amountPaid !== undefined
                ? Number(body.amountPaid)
                : totalAmount,
            ),
          );
          const balance = Math.max(0, totalAmount - amountPaid);
          const status = balance <= 0 ? "completed" : "pending";
          const paymentMode = ["cash", "momo", "bank", "cheque"].includes(
            body.paymentMode,
          )
            ? String(body.paymentMode)
            : "cash";
          const nowIso = new Date().toISOString();
          const transactionDate = body.transactionDate
            ? String(body.transactionDate)
            : nowIso;
          const id = generateId("stx");
          const transactionNo = `SUP-TXN-${Date.now().toString().slice(-6)}`;
          const deliveredBy = body.deliveredBy ? String(body.deliveredBy).trim() : null;
          const notes = body.notes ? String(body.notes).trim() : null;
          const eventsToPublish: SyncEventRecord[] = [];

          const trx = await db.transaction();
          try {
            await trx("supplier_transactions").insert({
              id,
              tenant_id: tenantId,
              transaction_no: transactionNo,
              supplier_id: supplierId,
              delivered_by: deliveredBy,
              transaction_date: transactionDate,
              total_amount: totalAmount,
              amount_paid: amountPaid,
              balance,
              payment_mode: paymentMode,
              status,
              notes,
              user_id: session.id,
              created_at: nowIso,
              updated_at: nowIso,
            });
            eventsToPublish.push(
              await insertSyncEvent(trx, {
                tenantId,
                entityType: "supplier_transaction",
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

          return {
            statusCode: 201,
            body: {
              id,
              transactionNo,
              supplierId,
              deliveredBy: deliveredBy || undefined,
              transactionDate,
              totalAmount,
              amountPaid,
              balance,
              paymentMode,
              status,
              notes: notes || undefined,
            },
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
