import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent } from "@/lib/sync-bus";
import {
  getTenantStoreProfile,
  HttpStatusError,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  return withMobileAuth(
    req,
    async ({ session, tenantId }) => {
      const body = await req.json().catch(() => ({}));
      const threshold = Math.trunc(Number(body.threshold ?? 0));
      if (!Number.isFinite(threshold) || threshold < 1) {
        throw new HttpStatusError("Threshold must be at least 1.", 400);
      }

      await getTenantStoreProfile(tenantId, session);
      await db("settings")
        .where("tenant_id", tenantId)
        .update({
          stock_alert_threshold: threshold,
          updated_at: new Date().toISOString(),
        });

      const store = await getTenantStoreProfile(tenantId, session);

      await emitSyncEvent({
        tenantId,
        entityType: "settings",
        entityId: tenantId,
        action: "upsert",
        payload: store as unknown as Record<string, unknown>,
        actorUserId: session.id,
      });

      return NextResponse.json(store);
    },
    { requireAdmin: true },
  );
}
