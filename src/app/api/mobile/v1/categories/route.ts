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
    const rows = await db("product_categories")
      .where({ tenant_id: tenantId, is_active: 1 })
      .orderBy("name", "asc")
      .select("name");

    return NextResponse.json(rows.map((r: any) => String(r.name)));
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
        endpoint: "POST:/api/mobile/v1/categories",
        handler: async () => {
          const name = String(body.name ?? "").trim();
          if (!name) {
            throw new HttpStatusError("Category name is required.", 400);
          }

          const existing = await db("product_categories")
            .where("tenant_id", tenantId)
            .whereRaw("LOWER(name) = ?", [name.toLowerCase()])
            .first("id");
          if (existing) {
            throw new HttpStatusError("Category already exists.", 409);
          }

          const id = generateId();
          const nowIso = new Date().toISOString();
          const isActive = body.isActive !== false ? 1 : 0;
          const description = body.description ? String(body.description).trim() : "";
          const eventsToPublish: SyncEventRecord[] = [];

          const trx = await db.transaction();
          try {
            await trx("product_categories").insert({
              id,
              tenant_id: tenantId,
              user_id: session.id,
              name,
              description,
              is_active: isActive,
              created_at: nowIso,
              updated_at: nowIso,
            });

            eventsToPublish.push(
              await insertSyncEvent(trx, {
                tenantId,
                entityType: "category",
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
              description,
              isActive: Boolean(isActive),
              productCount: 0,
              totalUnits: 0,
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
