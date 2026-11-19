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
      const storeName = String(body.storeName ?? "").trim();
      if (!storeName) {
        throw new HttpStatusError("Store name is required.", 400);
      }

      const taxRate = Math.max(0, Number(body.taxRate ?? 0));
      const nowIso = new Date().toISOString();

      await getTenantStoreProfile(tenantId, session);
      await db("settings")
        .where("tenant_id", tenantId)
        .update({
          business_name: storeName,
          business_address: String(body.storeAddress ?? "").trim(),
          business_phone: String(body.storePhone ?? "").trim(),
          business_email: String(body.storeEmail ?? "").trim(),
          ...(body.currency ? { currency: String(body.currency).trim() } : {}),
          tax_rate: taxRate,
          updated_at: nowIso,
        });

      await db("tenants")
        .where("id", tenantId)
        .update({ name: storeName, updated_at: nowIso })
        .catch(() => {});

      await emitSyncEvent({
        tenantId,
        entityType: "settings",
        entityId: tenantId,
        action: "upsert",
        actorUserId: session.id,
      });

      const store = await getTenantStoreProfile(tenantId, session);
      return NextResponse.json(store);
    },
    { requireAdmin: true },
  );
}
