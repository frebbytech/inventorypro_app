import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent, runWithIdempotency } from "@/lib/sync-bus";
import { extractClientMutationId, withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") || 100)),
    );

    let query = db("notifications")
      .where({ tenant_id: tenantId, user_id: session.id })
      .orderBy("created_at", "desc")
      .limit(limit);

    if (unreadOnly) {
      query = query.where("is_read", 0);
    }

    const rows = await query;
    return NextResponse.json(
      rows.map((n: any) => ({
        id: String(n.id),
        userId: String(n.user_id),
        type:
          n.reference_type === "product_low_stock"
            ? "low_stock"
            : String(n.type || "system"),
        title: String(n.title),
        message: n.message ?? null,
        isRead: Boolean(Number(n.is_read ?? 0)),
        referenceType: n.reference_type ?? null,
        referenceId: n.reference_id ?? null,
        createdAt: String(n.created_at || new Date().toISOString()),
        updatedAt: String(n.updated_at || n.created_at || new Date().toISOString()),
      })),
    );
  });
}

export async function DELETE(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId, clientMutationId }) => {
    const body = await req.json().catch(() => ({}));
    const mutationId = extractClientMutationId(req, body) || clientMutationId;

    const result = await runWithIdempotency({
      tenantId,
      clientMutationId: mutationId,
      endpoint: "DELETE:/api/mobile/v1/notifications",
      handler: async () => {
        const deletedCount = await db("notifications")
          .where({ tenant_id: tenantId, user_id: session.id })
          .del();

        await emitSyncEvent({
          tenantId,
          entityType: "notification",
          entityId: "all",
          action: "delete",
          payload: { user_id: session.id },
          actorUserId: session.id,
        });

        return {
          statusCode: 200,
          body: { deletedCount },
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
