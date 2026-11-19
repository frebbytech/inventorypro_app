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

    const [customers, saleAgg] = await Promise.all([
      db("customers")
        .where("tenant_id", tenantId)
        .select("*")
        .orderBy("name", "asc"),
      db("sales")
        .where({ tenant_id: tenantId, status: "completed" })
        .groupBy("customer_id")
        .select(
          "customer_id",
          db.raw("COUNT(*) as order_count"),
          db.raw("COALESCE(SUM(total_amount), 0) as total_spent"),
          db.raw("MAX(date) as last_order_at"),
        ),
    ]);

    const statsMap = new Map<
      string,
      { orderCount: number; totalSpent: number; lastOrderAt: string | null }
    >();
    for (const s of saleAgg) {
      statsMap.set(String(s.customer_id), {
        orderCount: Number(s.order_count ?? 0),
        totalSpent: Number(s.total_spent ?? 0),
        lastOrderAt: s.last_order_at ? String(s.last_order_at) : null,
      });
    }

    const mapped = customers
      .map((c: any) => {
        const stats = statsMap.get(String(c.id)) || {
          orderCount: 0,
          totalSpent: 0,
          lastOrderAt: null,
        };
        return {
          id: String(c.id),
          name: String(c.name),
          email: c.email || undefined,
          phonenumber: c.phonenumber || undefined,
          address: c.address || undefined,
          orderCount: stats.orderCount,
          totalSpent: stats.totalSpent,
          lastOrderAt: stats.lastOrderAt,
          createdAt: String(c.created_at || new Date().toISOString()),
          updatedAt: String(c.updated_at || c.created_at || new Date().toISOString()),
        };
      })
      .filter((c) =>
        q
          ? c.name.toLowerCase().includes(q) ||
            (c.email || "").toLowerCase().includes(q) ||
            (c.phonenumber || "").toLowerCase().includes(q)
          : true,
      );

    return NextResponse.json(mapped);
  });
}

export async function POST(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId, clientMutationId }) => {
    const body = await req.json().catch(() => ({}));
    const mutationId = extractClientMutationId(req, body) || clientMutationId;

    const result = await runWithIdempotency({
      tenantId,
      clientMutationId: mutationId,
      endpoint: "POST:/api/mobile/v1/customers",
      handler: async () => {
        const name = String(body.name ?? "").trim();
        if (!name) {
          throw new HttpStatusError("Customer name is required.", 400);
        }

        const id = generateId();
        const nowIso = new Date().toISOString();
        const email = body.email ? String(body.email).trim() : null;
        const phonenumber = body.phonenumber ? String(body.phonenumber).trim() : null;
        const address = body.address ? String(body.address).trim() : null;
        const eventsToPublish: SyncEventRecord[] = [];

        const trx = await db.transaction();
        try {
          await trx("customers").insert({
            id,
            tenant_id: tenantId,
            user_id: session.id,
            name,
            email,
            phonenumber,
            address,
            created_at: nowIso,
            updated_at: nowIso,
          });
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

        return {
          statusCode: 201,
          body: {
            id,
            name,
            email: email || undefined,
            phonenumber: phonenumber || undefined,
            address: address || undefined,
            orderCount: 0,
            totalSpent: 0,
            lastOrderAt: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
