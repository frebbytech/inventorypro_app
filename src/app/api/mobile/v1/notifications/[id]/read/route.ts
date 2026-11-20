import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent, runWithIdempotency } from "@/lib/sync-bus";
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
  return withMobileAuth(req, async ({ session, tenantId, clientMutationId }) => {
    const body = await req.json().catch(() => ({}));
    const mutationId = extractClientMutationId(req, body) || clientMutationId;

    const result = await runWithIdempotency({
      tenantId,
      clientMutationId: mutationId,
      endpoint: `PATCH:/api/mobile/v1/notifications/${id}/read`,
      handler: async () => {
        const row = await db("notifications")
          .where({ id, tenant_id: tenantId, user_id: session.id })
          .first();
        if (!row) {
          throw new HttpStatusError("Notification not found.", 404);
        }

        const nowIso = new Date().toISOString();
        await db("notifications")
          .where({ id, tenant_id: tenantId, user_id: session.id })
          .update({ is_read: 1, read_at: nowIso, updated_at: nowIso });

        await emitSyncEvent({
          tenantId,
          entityType: "notification",
          entityId: id,
          action: "upsert",
          payload: { is_read: true, user_id: session.id },
          actorUserId: session.id,
        });

        return {
          statusCode: 200,
          body: {
            id: String(row.id),
            userId: String(row.user_id),
            type:
              row.reference_type === "product_low_stock"
                ? "low_stock"
                : String(row.type || "system"),
            title: String(row.title),
            message: row.message ?? null,
            isRead: true,
            referenceType: row.reference_type ?? null,
            referenceId: row.reference_id ?? null,
            createdAt: String(row.created_at || nowIso),
            updatedAt: nowIso,
          },
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
