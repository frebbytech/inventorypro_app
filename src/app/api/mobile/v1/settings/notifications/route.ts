import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent } from "@/lib/sync-bus";
import {
  getTenantStoreProfile,
  HttpStatusError,
  normalizeTone,
  parseMemberSaleAlertChannels,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^[+\d\s()-]+$/.test(value) && digits.length >= 9 && digits.length <= 15;
}

export async function PATCH(req: Request) {
  return withMobileAuth(
    req,
    async ({ session, tenantId }) => {
      const body = await req.json().catch(() => ({}));
      const current = await getTenantStoreProfile(tenantId, session);

      const notificationEmail =
        body.notificationEmail !== undefined
          ? Boolean(body.notificationEmail)
          : current.notificationEmail;
      const notificationPush =
        body.notificationPush !== undefined
          ? Boolean(body.notificationPush)
          : current.notificationPush;
      const notificationSms =
        body.notificationSms !== undefined
          ? Boolean(body.notificationSms)
          : current.notificationSms;

      const stockAlertThreshold =
        body.stockAlertThreshold !== undefined
          ? Math.trunc(Number(body.stockAlertThreshold))
          : current.stockAlertThreshold;
      if (!Number.isFinite(stockAlertThreshold) || stockAlertThreshold < 1) {
        throw new HttpStatusError(
          "Low-stock alert threshold must be at least 1.",
          400,
        );
      }

      const stockAudioAlert =
        body.stockAudioAlert !== undefined
          ? Boolean(body.stockAudioAlert)
          : current.stockAudioAlert;
      const stockAudioTone =
        body.stockAudioTone !== undefined
          ? normalizeTone(body.stockAudioTone)
          : current.stockAudioTone;
      const rawVolume =
        body.stockAudioVolume !== undefined
          ? Number(body.stockAudioVolume)
          : current.stockAudioVolume;
      if (!Number.isFinite(rawVolume) || rawVolume < 0 || rawVolume > 1) {
        throw new HttpStatusError("Audio volume must be between 0 and 1.", 400);
      }
      const stockAudioVolume = Number(rawVolume.toFixed(2));

      const eodReportEnabled =
        body.eodReportEnabled !== undefined
          ? Boolean(body.eodReportEnabled)
          : current.eodReportEnabled;
      const eodBusinessClosingTime =
        body.eodBusinessClosingTime !== undefined
          ? String(body.eodBusinessClosingTime).trim()
          : current.eodBusinessClosingTime;
      if (!HH_MM_PATTERN.test(eodBusinessClosingTime)) {
        throw new HttpStatusError(
          "Closing time must be formatted as HH:MM (24-hour).",
          400,
        );
      }

      const eodAdminEmail =
        body.eodAdminEmail !== undefined
          ? String(body.eodAdminEmail || "").trim()
          : current.eodAdminEmail;
      if (eodAdminEmail && !EMAIL_PATTERN.test(eodAdminEmail)) {
        throw new HttpStatusError("Enter a valid EOD report email address.", 400);
      }

      const eodAdminPhone =
        body.eodAdminPhone !== undefined
          ? String(body.eodAdminPhone || "").trim()
          : current.eodAdminPhone;
      if (eodAdminPhone && !isValidPhone(eodAdminPhone)) {
        throw new HttpStatusError("Enter a valid EOD report phone number.", 400);
      }

      const memberSaleAlertEnabled =
        body.memberSaleAlertEnabled !== undefined
          ? Boolean(body.memberSaleAlertEnabled)
          : current.memberSaleAlertEnabled;
      const memberSaleAlertChannels =
        body.memberSaleAlertChannels !== undefined
          ? parseMemberSaleAlertChannels(body.memberSaleAlertChannels, [])
          : current.memberSaleAlertChannels;
      if (memberSaleAlertEnabled && memberSaleAlertChannels.length === 0) {
        throw new HttpStatusError(
          "Select at least one channel (In-App, Email, or SMS) for member sale alerts.",
          400,
        );
      }

      const eodChannels = ["in_app"];
      if (notificationEmail) eodChannels.push("email");
      if (notificationSms) eodChannels.push("sms");

      await db("settings")
        .where("tenant_id", tenantId)
        .update({
          notification_email: notificationEmail ? 1 : 0,
          notification_push: notificationPush ? 1 : 0,
          notification_sms: notificationSms ? 1 : 0,
          member_sale_alert_enabled: memberSaleAlertEnabled ? 1 : 0,
          member_sale_alert_channels: JSON.stringify(
            memberSaleAlertChannels.length > 0
              ? memberSaleAlertChannels
              : ["in_app"],
          ),
          stock_alert_threshold: stockAlertThreshold,
          stock_audio_alert: stockAudioAlert,
          stock_audio_tone: stockAudioTone,
          stock_audio_volume: stockAudioVolume,
          eod_report_enabled: eodReportEnabled,
          eod_business_closing_time: eodBusinessClosingTime,
          eod_channels: JSON.stringify(eodChannels),
          eod_admin_email: eodAdminEmail || null,
          eod_admin_phone: eodAdminPhone || null,
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
