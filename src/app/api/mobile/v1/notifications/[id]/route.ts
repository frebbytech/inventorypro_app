import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent, runWithIdempotency } from "@/lib/sync-bus";
import {
  extractClientMutationId,
  HttpStatusError,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function DELETE(
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
      endpoint: `DELETE:/api/mobile/v1/notifications/${id}`,
      handler: async () => {
        const deleted = await db("notifications")
          .where({ id, tenant_id: tenantId, user_id: session.id })
          .del();

        if (!deleted) {
          throw new HttpStatusError("Notification not found.", 404);
        }

        await emitSyncEvent({
          tenantId,
          entityType: "notification",
          entityId: id,
          action: "delete",
          payload: { user_id: session.id },
          actorUserId: session.id,
        });

        return {
          statusCode: 200,
          body: { ok: true },
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
