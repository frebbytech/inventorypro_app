import { NextResponse } from "next/server";
import db from "@/db/knex";
import { hashPassword } from "@/lib/auth";
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
  return withMobileAuth(
    req,
    async ({ tenantId }) => {
      const user = await db("users")
        .where({ id, tenant_id: tenantId })
        .first();
      if (!user) {
        return NextResponse.json(
          { error: "Employee not found." },
          { status: 404 },
        );
      }

      const salesRows = await db("sales as s")
        .leftJoin("customers as c", "s.customer_id", "c.id")
        .where({ "s.user_id": id, "s.tenant_id": tenantId })
        .orderBy("s.date", "desc")
        .select("s.*", "c.name as customer_name", "c.phonenumber as customer_phone");

      let completed = 0;
      let refunded = 0;
      let totalRevenue = 0;
      const modeMap = new Map<string, { count: number; amount: number }>();

      for (const s of salesRows) {
        const details = parseSaleDetails(s.details);
        const isRefunded = s.status === "failed" || Boolean(details.refunded);
        if (isRefunded) {
          refunded += 1;
          continue;
        }
        if (s.status === "completed") {
          const amt = Number(s.total_amount ?? 0);
          completed += 1;
          totalRevenue += amt;
          const mode = String(s.payment_mode || "cash");
          const entry = modeMap.get(mode) || { count: 0, amount: 0 };
          entry.count += 1;
          entry.amount += amt;
          modeMap.set(mode, entry);
        }
      }

      const saleIds = salesRows.slice(0, 30).map((s: any) => s.id);
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

      const fullName =
        `${user.firstname || ""} ${user.lastname || ""}`.trim() ||
        String(user.username);
      const modes: Array<"cash" | "momo" | "bank" | "cheque"> = [
        "cash",
        "momo",
        "bank",
        "cheque",
      ];

      return NextResponse.json({
        employee: {
          id: String(user.id),
          username: String(user.username),
          email: String(user.email || ""),
          firstname: String(user.firstname || ""),
          lastname: String(user.lastname || ""),
          fullName,
          phonenumber: user.phonenumber || undefined,
          role: user.role === "admin" ? "admin" : "member",
          isLocked: Boolean(
            user.locked_until && new Date(user.locked_until) > new Date(),
          ),
          lastLoginAt: user.last_login_at ? String(user.last_login_at) : null,
          completedSalesCount: completed,
          refundedSalesCount: refunded,
          totalRevenue,
          averageTicket: completed > 0 ? totalRevenue / completed : 0,
          createdAt: String(user.created_at || new Date().toISOString()),
        },
        paymentBreakdown: modes.map((mode) => {
          const e = modeMap.get(mode) || { count: 0, amount: 0 };
          return {
            paymentMode: mode,
            count: e.count,
            amount: e.amount,
            sharePercent: totalRevenue > 0 ? (e.amount / totalRevenue) * 100 : 0,
          };
        }),
        recentSales: salesRows.slice(0, 30).map((s: any) => {
          const details = parseSaleDetails(s.details);
          const isRefunded = s.status === "failed" || Boolean(details.refunded);
          const amt = Number(s.total_amount ?? 0);
          return {
            id: String(s.id),
            receiptNo: String(s.receipt_number || `INVP-${String(s.id).slice(0, 8)}`),
            customerName: String(s.customer_name || "Walk-in Customer"),
            customerPhone: s.customer_phone || undefined,
            cashierName: fullName,
            saleDate: String(s.date || s.created_at || new Date().toISOString()),
            totalAmount: amt,
            amountPaid: Number(details.amountPaid ?? amt),
            discount: Number(details.discountAmount ?? 0),
            tax: Number(details.taxAmount ?? 0),
            paymentMode: s.payment_mode || "cash",
            status: isRefunded ? "refunded" : s.status || "completed",
            itemCount: itemCounts.get(String(s.id)) ?? 0,
          };
        }),
      });
    },
    { requireAdmin: true },
  );
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
        endpoint: `PATCH:/api/mobile/v1/employees/${id}`,
        handler: async () => {
          const existing = await db("users")
            .where({ id, tenant_id: tenantId })
            .first();
          if (!existing) {
            throw new HttpStatusError("Employee not found.", 404);
          }

          const updates: Record<string, any> = {
            updated_at: new Date().toISOString(),
          };
          if (body.firstname !== undefined) {
            updates.firstname = String(body.firstname).trim();
          }
          if (body.lastname !== undefined) {
            updates.lastname = String(body.lastname).trim();
          }
          if (body.email !== undefined) {
            const nextEmail = String(body.email).trim().toLowerCase();
            const dup = await db("users")
              .whereRaw("LOWER(email) = ?", [nextEmail])
              .whereNot("id", id)
              .first("id");
            if (dup) throw new HttpStatusError("Email already exists.", 409);
            updates.email = nextEmail;
          }
          if (body.phonenumber !== undefined) {
            updates.phonenumber = body.phonenumber
              ? String(body.phonenumber).trim()
              : null;
          }
          if (body.role === "admin" || body.role === "member") {
            updates.role = body.role;
          }
          if (body.password && String(body.password).trim().length >= 6) {
            updates.password_hash = await hashPassword(String(body.password));
          }

          const eventsToPublish: SyncEventRecord[] = [];
          const trx = await db.transaction();
          try {
            await trx("users")
              .where({ id, tenant_id: tenantId })
              .update(updates);
            eventsToPublish.push(
              await insertSyncEvent(trx, {
                tenantId,
                entityType: "employee",
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

          const [updated, salesRows] = await Promise.all([
            db("users").where({ id, tenant_id: tenantId }).first(),
            db("sales")
              .where({ user_id: id, tenant_id: tenantId })
              .select("total_amount", "status", "details"),
          ]);

          let completed = 0;
          let refunded = 0;
          let totalRevenue = 0;
          for (const s of salesRows) {
            const details = parseSaleDetails(s.details);
            const isRefunded = s.status === "failed" || Boolean(details.refunded);
            if (isRefunded) refunded += 1;
            else if (s.status === "completed") {
              completed += 1;
              totalRevenue += Number(s.total_amount ?? 0);
            }
          }

          return {
            statusCode: 200,
            body: {
              id: String(updated.id),
              username: String(updated.username),
              email: String(updated.email || ""),
              firstname: String(updated.firstname || ""),
              lastname: String(updated.lastname || ""),
              fullName:
                `${updated.firstname || ""} ${updated.lastname || ""}`.trim() ||
                String(updated.username),
              phonenumber: updated.phonenumber || undefined,
              role: updated.role === "admin" ? "admin" : "member",
              isLocked: Boolean(
                updated.locked_until &&
                  new Date(updated.locked_until) > new Date(),
              ),
              lastLoginAt: updated.last_login_at
                ? String(updated.last_login_at)
                : null,
              completedSalesCount: completed,
              refundedSalesCount: refunded,
              totalRevenue,
              averageTicket: completed > 0 ? totalRevenue / completed : 0,
              createdAt: String(updated.created_at || new Date().toISOString()),
            },
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
