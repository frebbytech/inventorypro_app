import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent } from "@/lib/sync-bus";
import { withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const row = await db("notifications")
      .where({ id, tenant_id: tenantId, user_id: session.id })
      .first();
    if (!row) {
      return NextResponse.json(
        { error: "Notification not found." },
        { status: 404 },
      );
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

    return NextResponse.json({
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
    });
  });
}
