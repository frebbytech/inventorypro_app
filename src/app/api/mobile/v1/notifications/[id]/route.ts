import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent } from "@/lib/sync-bus";
import { withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const deleted = await db("notifications")
      .where({ id, tenant_id: tenantId, user_id: session.id })
      .del();

    if (!deleted) {
      return NextResponse.json(
        { error: "Notification not found." },
        { status: 404 },
      );
    }

    await emitSyncEvent({
      tenantId,
      entityType: "notification",
      entityId: id,
      action: "delete",
      payload: { user_id: session.id },
      actorUserId: session.id,
    });

    return NextResponse.json({ ok: true });
  });
}
