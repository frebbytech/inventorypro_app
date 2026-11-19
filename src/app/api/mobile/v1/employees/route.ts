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
import { generateId } from "@/utils/generator";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(
    req,
    async ({ tenantId }) => {
      const url = new URL(req.url);
      const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

      const [users, sales] = await Promise.all([
        db("users")
          .where("tenant_id", tenantId)
          .select("*")
          .orderBy("created_at", "desc"),
        db("sales")
          .where("tenant_id", tenantId)
          .select("user_id", "total_amount", "status", "details"),
      ]);

      const statsMap = new Map<
        string,
        { completed: number; refunded: number; revenue: number }
      >();

      for (const s of sales) {
        const uid = String(s.user_id || "");
        const entry = statsMap.get(uid) || {
          completed: 0,
          refunded: 0,
          revenue: 0,
        };
        const details = parseSaleDetails(s.details);
        const isRefunded = s.status === "failed" || Boolean(details.refunded);
        if (isRefunded) {
          entry.refunded += 1;
        } else if (s.status === "completed") {
          entry.completed += 1;
          entry.revenue += Number(s.total_amount ?? 0);
        }
        statsMap.set(uid, entry);
      }

      const now = new Date();
      const mapped = users
        .map((u: any) => {
          const stats = statsMap.get(String(u.id)) || {
            completed: 0,
            refunded: 0,
            revenue: 0,
          };
          const fullName =
            `${u.firstname || ""} ${u.lastname || ""}`.trim() ||
            String(u.username);
          const isLocked = Boolean(
            u.locked_until && new Date(u.locked_until) > now,
          );

          return {
            id: String(u.id),
            username: String(u.username),
            email: String(u.email || ""),
            firstname: String(u.firstname || ""),
            lastname: String(u.lastname || ""),
            fullName,
            phonenumber: u.phonenumber || undefined,
            role: u.role === "admin" ? ("admin" as const) : ("member" as const),
            isLocked,
            lastLoginAt: u.last_login_at ? String(u.last_login_at) : null,
            completedSalesCount: stats.completed,
            refundedSalesCount: stats.refunded,
            totalRevenue: stats.revenue,
            averageTicket:
              stats.completed > 0 ? stats.revenue / stats.completed : 0,
            createdAt: String(u.created_at || new Date().toISOString()),
          };
        })
        .filter((e) =>
          q
            ? e.fullName.toLowerCase().includes(q) ||
              e.username.toLowerCase().includes(q) ||
              e.email.toLowerCase().includes(q)
            : true,
        );

      return NextResponse.json(mapped);
    },
    { requireAdmin: true },
  );
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
        endpoint: "POST:/api/mobile/v1/employees",
        handler: async () => {
          const username = String(body.username ?? "").trim();
          const email = String(body.email ?? "").trim().toLowerCase();
          const firstname = String(body.firstname ?? "").trim();
          const lastname = String(body.lastname ?? "").trim();
          const password = String(body.password ?? "");
          const role = body.role === "admin" ? "admin" : "member";
          const phonenumber = body.phonenumber
            ? String(body.phonenumber).trim()
            : null;

          if (!username || !email || !firstname || !lastname || !password) {
            throw new HttpStatusError(
              "Username, email, first name, last name, and password are required.",
              400,
            );
          }

          const existing = await db("users")
            .where((qb) => {
              qb.where((inner) => {
                inner
                  .where("tenant_id", tenantId)
                  .whereRaw("LOWER(username) = ?", [username.toLowerCase()]);
              }).orWhereRaw("LOWER(email) = ?", [email]);
            })
            .first("id", "email");

          if (existing) {
            throw new HttpStatusError(
              String(existing.email || "").toLowerCase() === email
                ? "Email address already exists."
                : "Username already exists in this workspace.",
              409,
            );
          }

          const id = generateId();
          const nowIso = new Date().toISOString();
          const passwordHash = await hashPassword(password);
          const eventsToPublish: SyncEventRecord[] = [];

          const trx = await db.transaction();
          try {
            await trx("users").insert({
              id,
              tenant_id: tenantId,
              username,
              email,
              firstname,
              lastname,
              phonenumber,
              role,
              password_hash: passwordHash,
              created_at: nowIso,
              updated_at: nowIso,
            });
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

          return {
            statusCode: 201,
            body: {
              id,
              username,
              email,
              firstname,
              lastname,
              fullName: `${firstname} ${lastname}`.trim() || username,
              phonenumber: phonenumber || undefined,
              role,
              isLocked: false,
              lastLoginAt: null,
              completedSalesCount: 0,
              refundedSalesCount: 0,
              totalRevenue: 0,
              averageTicket: 0,
              createdAt: nowIso,
            },
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
