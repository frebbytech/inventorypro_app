/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { Settings, UpdateSettingsInput, Result } from "@/types/globals";
import { revalidatePath } from "next/cache";
import { getCurrentUser, getUser } from "./_actions";
import { buildDefaultSettingsRow } from "@/lib/auth";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { emitSyncEvent } from "@/lib/sync-bus";

export interface EODUser {
  id: string;
  tenant_id: string;
  eod_report_enabled: boolean;
  eod_business_closing_time: string;
  eod_channels: string | null;
  eod_admin_email: string | null;
  eod_admin_phone: string | null;
}

/**
 * Get one primary admin per tenant that has EOD sales reports enabled.
 */
export async function getUsersWithEODEnabled(): Promise<EODUser[]> {
  const rows = await db("users as u")
    .innerJoin("settings as s", "s.tenant_id", "u.tenant_id")
    .select(
      "u.id",
      "u.tenant_id",
      "u.role",
      "s.eod_report_enabled",
      "s.eod_business_closing_time",
      "s.eod_channels",
      "s.eod_admin_email",
      "s.eod_admin_phone",
    )
    .where({ "s.eod_report_enabled": 1, "u.role": "admin" })
    .orderBy("u.created_at", "asc");

  const seenTenants = new Set<string>();
  const deduped: EODUser[] = [];

  for (const row of rows) {
    const tenantId = String(row.tenant_id || DEFAULT_TENANT_ID);
    if (seenTenants.has(tenantId)) continue;
    seenTenants.add(tenantId);

    deduped.push({
      id: row.id,
      tenant_id: tenantId,
      eod_report_enabled: Boolean(row.eod_report_enabled),
      eod_business_closing_time: row.eod_business_closing_time || "18:00",
      eod_channels: row.eod_channels ?? null,
      eod_admin_email: row.eod_admin_email ?? null,
      eod_admin_phone: row.eod_admin_phone ?? null,
    });
  }

  return deduped;
}

/**
 * Get settings for a user's workspace by userId.
 */
export async function getSettingsById(
  userId: string,
): Promise<Result<Settings>> {
  try {
    const userRes = await getUser(userId);
    if (!userRes.success || !userRes.data) {
      return Result.fail("Unauthorized");
    }

    const tenantId = userRes.data.tenant_id || DEFAULT_TENANT_ID;
    const settings = await db("settings")
      .where("tenant_id", tenantId)
      .orderByRaw("CASE WHEN user_id = ? THEN 0 ELSE 1 END", [userId])
      .first();

    return Result.ok(settings);
  } catch (error: any) {
    console.error("Failed to fetch settings:", error);
    return Result.fail(error?.message || "Failed to fetch settings");
  }
}

export async function getSettings(): Promise<Result<Settings>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }

    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    let settings = await db("settings")
      .where("tenant_id", tenantId)
      .orderByRaw("CASE WHEN user_id = ? THEN 0 ELSE 1 END", [currentUser.id])
      .first();

    if (!settings) {
      const defaults = buildDefaultSettingsRow({
        userId: currentUser.id,
        tenantId,
        businessName: currentUser.tenant_name || "Inventory Pro",
        businessEmail: currentUser.email || "",
        businessPhone: currentUser.phonenumber || "",
      });

      await db("settings").insert(defaults);
      settings = await db("settings").where("id", defaults.id).first();
    }

    return Result.ok(settings);
  } catch (error: any) {
    console.error("Failed to fetch settings:", error);
    return Result.fail(error?.message || "Failed to fetch settings");
  }
}

/**
 * Update settings strictly for the current user's workspace (tenant).
 */
export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<Result<Settings>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.tenant_id) {
      return Result.fail("Unauthorized");
    }

    const tenantId = currentUser.tenant_id;
    const payload = { ...input };
    delete payload.old_business_name;

    let existing = await db("settings").where("tenant_id", tenantId).first();
    if (!existing) {
      const defaults = buildDefaultSettingsRow({
        userId: currentUser.id,
        tenantId,
        businessName: payload.business_name || currentUser.tenant_name || "Inventory Pro",
      });
      await db("settings").insert(defaults);
      existing = defaults;
    }

    await db("settings")
      .where("tenant_id", tenantId)
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      });

    if (payload.business_name && String(payload.business_name).trim()) {
      await db("tenants")
        .where("id", tenantId)
        .update({
          name: String(payload.business_name).trim(),
          updated_at: new Date().toISOString(),
        })
        .catch(() => {});
    }

    const updatedSetting = await db("settings")
      .where("tenant_id", tenantId)
      .first();

    revalidatePath("/admin/settings");
    await emitSyncEvent({
      tenantId,
      entityType: "settings",
      entityId: updatedSetting?.id || existing.id,
      action: "upsert",
      actorUserId: currentUser.id,
    });

    return Result.ok(updatedSetting);
  } catch (error: any) {
    console.error("Failed to update settings:", error?.message || error);
    return Result.fail(error?.message || "Failed to update settings");
  }
}
