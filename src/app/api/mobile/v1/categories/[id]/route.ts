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
        endpoint: `PATCH:/api/mobile/v1/categories/${id}`,
        handler: async () => {
          const existing = await db("product_categories")
            .where({ id, tenant_id: tenantId })
            .first();
          if (!existing) {
            throw new HttpStatusError("Category not found.", 404);
          }

          const updates: Record<string, any> = {
            updated_at: new Date().toISOString(),
          };
          if (body.name !== undefined) {
            const cleanName = String(body.name).trim();
            if (!cleanName) {
              throw new HttpStatusError("Category name cannot be empty.", 400);
            }
            const dup = await db("product_categories")
              .where("tenant_id", tenantId)
              .whereRaw("LOWER(name) = ?", [cleanName.toLowerCase()])
              .whereNot("id", id)
              .first("id");
            if (dup) {
              throw new HttpStatusError("Category name already exists.", 409);
            }
            updates.name = cleanName;
          }
          if (body.description !== undefined) {
            updates.description = String(body.description || "").trim();
          }
          if (body.isActive !== undefined) {
            updates.is_active = body.isActive ? 1 : 0;
          }

          const eventsToPublish: SyncEventRecord[] = [];
          const trx = await db.transaction();
          try {
            await trx("product_categories")
              .where({ id, tenant_id: tenantId })
              .update(updates);

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

          const refreshed = await db("product_categories as pc")
            .leftJoin("products as p", function () {
              this.on("pc.id", "=", "p.category_id").andOn(
                "p.tenant_id",
                "=",
                "pc.tenant_id",
              );
            })
            .where({ "pc.id": id, "pc.tenant_id": tenantId })
            .groupBy("pc.id", "pc.name", "pc.description", "pc.is_active", "pc.updated_at", "pc.created_at")
            .select(
              "pc.id",
              "pc.name",
              "pc.description",
              "pc.is_active",
              "pc.updated_at",
              db.raw("COUNT(p.id) as product_count"),
              db.raw("COALESCE(SUM(p.stock_quantity), 0) as total_units"),
            )
            .first();

          return {
            statusCode: 200,
            body: {
              id: String(refreshed.id),
              name: String(refreshed.name),
              description: String(refreshed.description || ""),
              isActive: Boolean(Number(refreshed.is_active ?? 1)),
              productCount: Number(refreshed.product_count ?? 0),
              totalUnits: Number(refreshed.total_units ?? 0),
              updatedAt: String(refreshed.updated_at || updates.updated_at),
            },
          };
        },
      });

      return NextResponse.json(result.body, { status: result.statusCode });
    },
    { requireAdmin: true },
  );
}
