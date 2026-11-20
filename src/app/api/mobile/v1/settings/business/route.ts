import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent } from "@/lib/sync-bus";
import {
  getTenantStoreProfile,
  HttpStatusError,
  normalizePaperSize,
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

      const taxRateDecimal = Number(body.taxRate ?? 0);
      if (!Number.isFinite(taxRateDecimal) || taxRateDecimal < 0 || taxRateDecimal > 1) {
        throw new HttpStatusError("Tax rate must be between 0% and 100%.", 400);
      }
      const taxRatePercent = Number((taxRateDecimal * 100).toFixed(2));
      const nowIso = new Date().toISOString();

      await getTenantStoreProfile(tenantId, session);

      const updates: Record<string, any> = {
        business_name: storeName,
        business_address: String(body.storeAddress ?? "").trim(),
        business_phone: String(body.storePhone ?? "").trim(),
        business_email: String(body.storeEmail ?? "").trim(),
        tax_rate: taxRatePercent,
        updated_at: nowIso,
      };

      if (body.currency) {
        updates.currency = String(body.currency).trim();
      }
      if (body.stockAlertThreshold !== undefined) {
        const threshold = Math.trunc(Number(body.stockAlertThreshold));
        if (!Number.isFinite(threshold) || threshold < 1) {
          throw new HttpStatusError("Low-stock alert threshold must be at least 1.", 400);
        }
        updates.stock_alert_threshold = threshold;
      }
      if (body.language !== undefined) {
        updates.language = String(body.language || "en").trim() || "en";
      }
      if (body.printAfterSale !== undefined) {
        updates.print_after_sale = body.printAfterSale ? 1 : 0;
      }
      if (body.paperSize !== undefined) {
        updates.paper_size = normalizePaperSize(body.paperSize);
      }

      await db("settings").where("tenant_id", tenantId).update(updates);

      await db("tenants")
        .where("id", tenantId)
        .update({ name: storeName, updated_at: nowIso })
        .catch(() => {});

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
