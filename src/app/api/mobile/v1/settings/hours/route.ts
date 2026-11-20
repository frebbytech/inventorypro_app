import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent } from "@/lib/sync-bus";
import {
  DEFAULT_MOBILE_WEEKLY_SCHEDULE,
  getTenantStoreProfile,
  HttpStatusError,
  type MobileDaySchedule,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function PATCH(req: Request) {
  return withMobileAuth(
    req,
    async ({ session, tenantId }) => {
      const body = await req.json().catch(() => ({}));
      const current = await getTenantStoreProfile(tenantId, session);

      const business247 =
        body.business247 !== undefined
          ? Boolean(body.business247)
          : current.business247;
      const businessOpeningTime =
        body.businessOpeningTime !== undefined
          ? String(body.businessOpeningTime).trim()
          : current.businessOpeningTime;
      const businessClosingTime =
        body.businessClosingTime !== undefined
          ? String(body.businessClosingTime).trim()
          : current.businessClosingTime;

      if (
        !HH_MM_PATTERN.test(businessOpeningTime) ||
        !HH_MM_PATTERN.test(businessClosingTime)
      ) {
        throw new HttpStatusError(
          "Opening and closing times must use HH:MM format.",
          400,
        );
      }

      let schedule: MobileDaySchedule[] = current.businessHoursSchedule;
      if (body.businessHoursSchedule !== undefined) {
        if (!Array.isArray(body.businessHoursSchedule) || body.businessHoursSchedule.length !== 7) {
          throw new HttpStatusError(
            "Weekly business hours must contain all 7 days.",
            400,
          );
        }
        schedule = body.businessHoursSchedule.map((item: any, idx: number) => {
          const openTime = String(item?.openTime || "08:00").trim();
          const closeTime = String(item?.closeTime || "18:00").trim();
          if (!HH_MM_PATTERN.test(openTime) || !HH_MM_PATTERN.test(closeTime)) {
            throw new HttpStatusError(
              `Invalid time format on ${String(item?.label || DEFAULT_MOBILE_WEEKLY_SCHEDULE[idx].label)}.`,
              400,
            );
          }
          return {
            day: String(item?.day || DEFAULT_MOBILE_WEEKLY_SCHEDULE[idx].day),
            label: String(item?.label || DEFAULT_MOBILE_WEEKLY_SCHEDULE[idx].label),
            closed: Boolean(item?.closed),
            openTime,
            closeTime,
            ...(item?.is24Hours !== undefined
              ? { is24Hours: Boolean(item.is24Hours) }
              : {}),
          };
        });
      }

      const businessHoursNotes =
        body.businessHoursNotes !== undefined
          ? String(body.businessHoursNotes || "").trim()
          : current.businessHoursNotes;

      await db("settings")
        .where("tenant_id", tenantId)
        .update({
          business_24_7: business247,
          business_opening_time: businessOpeningTime,
          business_closing_time: businessClosingTime,
          business_hours_schedule: JSON.stringify(schedule),
          business_hours_notes: businessHoursNotes,
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
