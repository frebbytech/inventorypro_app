import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent, runWithIdempotency } from "@/lib/sync-bus";
import { extractClientMutationId, withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId, clientMutationId }) => {
    const body = await req.json().catch(() => ({}));
    const mutationId = extractClientMutationId(req, body) || clientMutationId;

    const result = await runWithIdempotency({
      tenantId,
      clientMutationId: mutationId,
      endpoint: "POST:/api/mobile/v1/notifications/read-all",
      handler: async () => {
        const nowIso = new Date().toISOString();
        const updatedCount = await db("notifications")
          .where({ tenant_id: tenantId, user_id: session.id, is_read: 0 })
          .update({ is_read: 1, read_at: nowIso, updated_at: nowIso });

        await emitSyncEvent({
          tenantId,
          entityType: "notification",
          entityId: "all",
          action: "refresh",
          payload: {
            userId: session.id,
            user_id: session.id,
            allRead: true,
            all_read: true,
          },
          actorUserId: session.id,
        });

        return {
          statusCode: 200,
          body: { updatedCount },
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
