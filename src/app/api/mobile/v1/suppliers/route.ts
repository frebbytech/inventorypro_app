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

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ tenantId }) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

    const [suppliers, txAgg] = await Promise.all([
      db("suppliers")
        .where("tenant_id", tenantId)
        .select("*")
        .orderBy("name", "asc"),
      db("supplier_transactions")
        .where("tenant_id", tenantId)
        .groupBy("supplier_id")
        .select(
          "supplier_id",
          db.raw("COUNT(*) as order_count"),
          db.raw("COALESCE(SUM(total_amount), 0) as total_purchases"),
          db.raw("COALESCE(SUM(balance), 0) as outstanding_balance"),
          db.raw("MAX(transaction_date) as last_order_at"),
        ),
    ]);

    const aggMap = new Map<
      string,
      {
        orderCount: number;
        totalPurchases: number;
        outstandingBalance: number;
        lastOrderAt: string | null;
      }
    >();

    for (const row of txAgg) {
      aggMap.set(String(row.supplier_id), {
        orderCount: Number(row.order_count ?? 0),
        totalPurchases: Number(row.total_purchases ?? 0),
        outstandingBalance: Math.max(0, Number(row.outstanding_balance ?? 0)),
        lastOrderAt: row.last_order_at ? String(row.last_order_at) : null,
      });
    }

    const mapped = suppliers
      .map((s: any) => {
        const stats = aggMap.get(String(s.id)) || {
          orderCount: 0,
          totalPurchases: 0,
          outstandingBalance: 0,
          lastOrderAt: null,
        };
        return {
          id: String(s.id),
          name: String(s.name),
          companyName: String(s.company_name || s.name || ""),
          email: s.email || undefined,
          phonenumber: s.phonenumber || undefined,
          address: s.address || undefined,
          isActive: Boolean(Number(s.is_active ?? 1)),
          orderCount: stats.orderCount,
          totalPurchases: stats.totalPurchases,
          outstandingBalance: stats.outstandingBalance,
          lastOrderAt: stats.lastOrderAt,
          createdAt: String(s.created_at || new Date().toISOString()),
          updatedAt: String(s.updated_at || s.created_at || new Date().toISOString()),
        };
      })
      .filter((s) =>
        q
          ? s.name.toLowerCase().includes(q) ||
            s.companyName.toLowerCase().includes(q) ||
            (s.phonenumber || "").toLowerCase().includes(q)
          : true,
      );

    return NextResponse.json(mapped);
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
        endpoint: "POST:/api/mobile/v1/suppliers",
        handler: async () => {
          const name = String(body.name ?? "").trim();
          const companyName = String(body.companyName ?? name).trim();
          if (!name) {
            throw new HttpStatusError("Supplier name is required.", 400);
          }

          const id = generateId();
          const nowIso = new Date().toISOString();
          const email = body.email ? String(body.email).trim() : null;
          const phonenumber = body.phonenumber ? String(body.phonenumber).trim() : null;
          const address = body.address ? String(body.address).trim() : null;
          const isActive = body.isActive !== false ? 1 : 0;
          const eventsToPublish: SyncEventRecord[] = [];

          const trx = await db.transaction();
          try {
            await trx("suppliers").insert({
              id,
              tenant_id: tenantId,
              user_id: session.id,
              name,
              company_name: companyName,
              email,
              phonenumber,
              address,
              is_active: isActive,
              created_at: nowIso,
              updated_at: nowIso,
            });
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

          return {
            statusCode: 201,
            body: {
              id,
              name,
              companyName,
              email: email || undefined,
              phonenumber: phonenumber || undefined,
              address: address || undefined,
              isActive: Boolean(isActive),
              orderCount: 0,
              totalPurchases: 0,
              outstandingBalance: 0,
              lastOrderAt: null,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
