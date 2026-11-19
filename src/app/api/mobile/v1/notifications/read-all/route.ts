import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent } from "@/lib/sync-bus";
import { withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const nowIso = new Date().toISOString();
    const updatedCount = await db("notifications")
      .where({ tenant_id: tenantId, user_id: session.id, is_read: 0 })
      .update({ is_read: 1, read_at: nowIso, updated_at: nowIso });

    await emitSyncEvent({
      tenantId,
      entityType: "notification",
      entityId: "all",
      action: "refresh",
      payload: { user_id: session.id },
      actorUserId: session.id,
    });

    return NextResponse.json({ updatedCount });
  });
}
