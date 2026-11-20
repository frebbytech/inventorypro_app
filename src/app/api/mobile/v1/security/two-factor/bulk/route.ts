import { NextResponse } from "next/server";
import db from "@/db/knex";
import { createActivityLog } from "@/actions/activity-logs";
import { createAuditLog } from "@/actions/audit-logs";
import { emitSyncEvent } from "@/lib/sync-bus";
import { ensureSecuritySchema, normalizeTwoFactorMethod } from "@/lib/security";
import { HttpStatusError, withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withMobileAuth(
    req,
    async ({ session, tenantId }) => {
      await ensureSecuritySchema();

      const body = await req.json().catch(() => ({}));
      const rawUserIds = Array.isArray(body.userIds) ? body.userIds : [];
      const userIds: string[] = rawUserIds
        .map((id: unknown) => String(id || "").trim())
        .filter(Boolean);
      const enabled = Boolean(body.enabled);

      if (userIds.length === 0) {
        throw new HttpStatusError("No staff accounts selected.", 400);
      }

      const targets = await db("users")
        .select(
          "id",
          "username",
          "email",
          "phonenumber",
          "two_factor_enabled",
          "two_factor_method",
        )
        .where("tenant_id", tenantId)
        .whereIn("id", userIds);

      const eligibleIds: string[] = [];
      const skippedUsernames: string[] = [];

      for (const user of targets) {
        if (String(user.id) === session.id) {
          continue;
        }
        const method = normalizeTwoFactorMethod(user.two_factor_method);
        if (enabled) {
          const hasTarget =
            method === "sms"
              ? Boolean(String(user.phonenumber || "").trim())
              : Boolean(String(user.email || "").trim());
          if (!hasTarget) {
            skippedUsernames.push(String(user.username || user.id));
            continue;
          }
        }
        eligibleIds.push(String(user.id));
      }

      const nowIso = new Date().toISOString();

      if (eligibleIds.length > 0) {
        await db("users")
          .where("tenant_id", tenantId)
          .whereIn("id", eligibleIds)
          .update({
            two_factor_enabled: enabled,
            two_factor_updated_at: nowIso,
          });

        if (!enabled) {
          await db("two_factor_codes")
            .where("tenant_id", tenantId)
            .whereIn("user_id", eligibleIds)
            .whereNull("consumed_at")
            .update({ consumed_at: nowIso })
            .catch(() => {});
        }

        await createAuditLog({
          entity_type: "user",
          entity_id: eligibleIds.join(","),
          action: "update",
          new_values: {
            two_factor_enabled: enabled,
            affected_count: eligibleIds.length,
          },
        }).catch(() => {});

        await createActivityLog({
          activity_type: "bulk_two_factor_updated",
          title: `${enabled ? "Enabled" : "Disabled"} 2FA for ${eligibleIds.length} staff account${eligibleIds.length === 1 ? "" : "s"}`,
          description: "Bulk 2FA update applied from mobile",
          metadata: {
            user_ids: eligibleIds,
            two_factor_enabled: enabled,
            skipped_usernames: skippedUsernames,
          },
        }).catch(() => {});

        await emitSyncEvent({
          tenantId,
          entityType: "employee",
          entityId: eligibleIds.join(","),
          action: "refresh",
          actorUserId: session.id,
        });
      }

      return NextResponse.json({
        updatedCount: eligibleIds.length,
        skippedUsernames,
      });
    },
    { requireAdmin: true },
  );
}
