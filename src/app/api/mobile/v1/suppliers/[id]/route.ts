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

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withMobileAuth(req, async ({ tenantId }) => {
    const supplier = await db("suppliers")
      .where({ id, tenant_id: tenantId })
      .first();
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
    }

    const txRows = await db("supplier_transactions")
      .where({ supplier_id: id, tenant_id: tenantId })
      .orderBy("transaction_date", "desc")
      .limit(100);

    const totalPurchases = txRows.reduce(
      (sum: number, t: any) => sum + Number(t.total_amount ?? 0),
      0,
    );
    const outstandingBalance = txRows.reduce(
      (sum: number, t: any) => sum + Math.max(0, Number(t.balance ?? 0)),
      0,
    );

    return NextResponse.json({
      supplier: {
        id: String(supplier.id),
        name: String(supplier.name),
        companyName: String(supplier.company_name || supplier.name || ""),
        email: supplier.email || undefined,
        phonenumber: supplier.phonenumber || undefined,
        address: supplier.address || undefined,
        isActive: Boolean(Number(supplier.is_active ?? 1)),
        orderCount: txRows.length,
        totalPurchases,
        outstandingBalance,
        lastOrderAt: txRows[0]?.transaction_date || null,
        createdAt: String(supplier.created_at || new Date().toISOString()),
        updatedAt: String(supplier.updated_at || supplier.created_at || new Date().toISOString()),
      },
      transactions: txRows.map((t: any) => ({
        id: String(t.id),
        transactionNo: String(t.transaction_no || `SUP-${String(t.id).slice(0, 8)}`),
        supplierId: String(t.supplier_id),
        deliveredBy: t.delivered_by || undefined,
        transactionDate: String(t.transaction_date || t.created_at || new Date().toISOString()),
        totalAmount: Number(t.total_amount ?? 0),
        amountPaid: Number(t.amount_paid ?? 0),
        balance: Math.max(0, Number(t.balance ?? 0)),
        paymentMode: t.payment_mode || "cash",
        status: t.status || "completed",
        notes: t.notes || undefined,
      })),
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
        endpoint: `PATCH:/api/mobile/v1/suppliers/${id}`,
        handler: async () => {
          const existing = await db("suppliers")
            .where({ id, tenant_id: tenantId })
            .first();
          if (!existing) {
            throw new HttpStatusError("Supplier not found.", 404);
          }

          const updates: Record<string, any> = {
            updated_at: new Date().toISOString(),
          };
          if (body.name !== undefined) {
            const name = String(body.name).trim();
            if (!name) throw new HttpStatusError("Supplier name is required.", 400);
            updates.name = name;
          }
          if (body.companyName !== undefined) {
            updates.company_name = String(body.companyName).trim();
          }
          if (body.email !== undefined) {
            updates.email = body.email ? String(body.email).trim() : null;
          }
          if (body.phonenumber !== undefined) {
            updates.phonenumber = body.phonenumber ? String(body.phonenumber).trim() : null;
          }
          if (body.address !== undefined) {
            updates.address = body.address ? String(body.address).trim() : null;
          }
          if (body.isActive !== undefined) {
            updates.is_active = body.isActive ? 1 : 0;
          }

          const eventsToPublish: SyncEventRecord[] = [];
          const trx = await db.transaction();
          try {
            await trx("suppliers")
              .where({ id, tenant_id: tenantId })
              .update(updates);
            eventsToPublish.push(
              await insertSyncEvent(trx, {
                tenantId,
                entityType: "supplier",
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

          const [updated, txStats] = await Promise.all([
            db("suppliers").where({ id, tenant_id: tenantId }).first(),
            db("supplier_transactions")
              .where({ supplier_id: id, tenant_id: tenantId })
              .select(
                db.raw("COUNT(*) as order_count"),
                db.raw("COALESCE(SUM(total_amount), 0) as total_purchases"),
                db.raw("COALESCE(SUM(balance), 0) as outstanding_balance"),
                db.raw("MAX(transaction_date) as last_order_at"),
              )
              .first(),
          ]);

          return {
            statusCode: 200,
            body: {
              id: String(updated.id),
              name: String(updated.name),
              companyName: String(updated.company_name || updated.name || ""),
              email: updated.email || undefined,
              phonenumber: updated.phonenumber || undefined,
              address: updated.address || undefined,
              isActive: Boolean(Number(updated.is_active ?? 1)),
              orderCount: Number(txStats?.order_count ?? 0),
              totalPurchases: Number(txStats?.total_purchases ?? 0),
              outstandingBalance: Math.max(
                0,
                Number(txStats?.outstanding_balance ?? 0),
              ),
              lastOrderAt: txStats?.last_order_at
                ? String(txStats.last_order_at)
                : null,
              createdAt: String(updated.created_at || new Date().toISOString()),
              updatedAt: String(updated.updated_at || updates.updated_at),
            },
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
