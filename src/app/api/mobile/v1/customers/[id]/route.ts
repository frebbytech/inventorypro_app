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
  parseSaleDetails,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withMobileAuth(req, async ({ tenantId }) => {
    const cust = await db("customers")
      .where({ id, tenant_id: tenantId })
      .first();
    if (!cust) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const salesRows = await db("sales as s")
      .leftJoin("users as u", "s.user_id", "u.id")
      .where({ "s.customer_id": id, "s.tenant_id": tenantId })
      .orderBy("s.date", "desc")
      .limit(50)
      .select("s.*", "u.username as cashier_name");

    const completedSales = salesRows.filter((s: any) => s.status === "completed");
    const totalSpent = completedSales.reduce(
      (sum: number, s: any) => sum + Number(s.total_amount ?? 0),
      0,
    );

    const saleIds = salesRows.map((s: any) => s.id);
    const itemCounts = new Map<string, number>();
    if (saleIds.length > 0) {
      const counts = await db("sale_items")
        .where("tenant_id", tenantId)
        .whereIn("sales_id", saleIds)
        .groupBy("sales_id")
        .select("sales_id", db.raw("COALESCE(SUM(quantity), 0) as cnt"));
      for (const r of counts) {
        itemCounts.set(String(r.sales_id), Number(r.cnt ?? 0));
      }
    }

    return NextResponse.json({
      customer: {
        id: String(cust.id),
        name: String(cust.name),
        email: cust.email || undefined,
        phonenumber: cust.phonenumber || undefined,
        address: cust.address || undefined,
        orderCount: completedSales.length,
        totalSpent,
        lastOrderAt: completedSales[0]?.date || null,
        createdAt: String(cust.created_at || new Date().toISOString()),
        updatedAt: String(cust.updated_at || cust.created_at || new Date().toISOString()),
      },
      recentSales: salesRows.map((s: any) => {
        const details = parseSaleDetails(s.details);
        const isRefunded = s.status === "failed" || Boolean(details.refunded);
        const totalAmount = Number(s.total_amount ?? 0);
        return {
          id: String(s.id),
          receiptNo: String(s.receipt_number || `INVP-${String(s.id).slice(0, 8)}`),
          customerName: String(cust.name),
          customerPhone: cust.phonenumber || undefined,
          cashierName: String(s.cashier_name || "Staff"),
          saleDate: String(s.date || s.created_at || new Date().toISOString()),
          totalAmount,
          amountPaid: Number(details.amountPaid ?? totalAmount),
          discount: Number(details.discountAmount ?? 0),
          tax: Number(details.taxAmount ?? 0),
          paymentMode: s.payment_mode || "cash",
          status: isRefunded ? "refunded" : s.status || "completed",
          itemCount: itemCounts.get(String(s.id)) ?? 0,
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
  return withMobileAuth(req, async ({ session, tenantId, clientMutationId }) => {
    const body = await req.json().catch(() => ({}));
    const mutationId = extractClientMutationId(req, body) || clientMutationId;

    const result = await runWithIdempotency({
      tenantId,
      clientMutationId: mutationId,
      endpoint: `PATCH:/api/mobile/v1/customers/${id}`,
      handler: async () => {
        const existing = await db("customers")
          .where({ id, tenant_id: tenantId })
          .first();
        if (!existing) {
          throw new HttpStatusError("Customer not found.", 404);
        }

        const updates: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (body.name !== undefined) {
          const name = String(body.name).trim();
          if (!name) throw new HttpStatusError("Customer name is required.", 400);
          updates.name = name;
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

        const eventsToPublish: SyncEventRecord[] = [];
        const trx = await db.transaction();
        try {
          await trx("customers")
            .where({ id, tenant_id: tenantId })
            .update(updates);
          eventsToPublish.push(
            await insertSyncEvent(trx, {
              tenantId,
              entityType: "customer",
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

        const [updated, stats] = await Promise.all([
          db("customers").where({ id, tenant_id: tenantId }).first(),
          db("sales")
            .where({ customer_id: id, tenant_id: tenantId, status: "completed" })
            .select(
              db.raw("COUNT(*) as order_count"),
              db.raw("COALESCE(SUM(total_amount), 0) as total_spent"),
              db.raw("MAX(date) as last_order_at"),
            )
            .first(),
        ]);

        return {
          statusCode: 200,
          body: {
            id: String(updated.id),
            name: String(updated.name),
            email: updated.email || undefined,
            phonenumber: updated.phonenumber || undefined,
            address: updated.address || undefined,
            orderCount: Number(stats?.order_count ?? 0),
            totalSpent: Number(stats?.total_spent ?? 0),
            lastOrderAt: stats?.last_order_at ? String(stats.last_order_at) : null,
            createdAt: String(updated.created_at || new Date().toISOString()),
            updatedAt: String(updated.updated_at || updates.updated_at),
          },
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
