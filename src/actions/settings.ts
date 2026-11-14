"use server";

import db from "@/db/knex";
import { Settings, UpdateSettingsInput, Result } from "@/types/globals";
import { generateId } from "@/utils/generator";
import { revalidatePath } from "next/cache";
import { getCurrentUser, getUser } from "./_actions";
export interface EODUser {
  id: string;
  eod_report_enabled: boolean;
  eod_business_closing_time: string;
  eod_channels: string | null;
  eod_admin_email: string | null;
  eod_admin_phone: string | null;
}
/**
 * Ensure audio alert columns exist in the settings table
 */
async function ensureSettingsColumns() {
  try {
    const hasTable = await db.schema.hasTable("settings");
    if (!hasTable) return;
  } catch (err) {
    console.warn("Error ensuring settings columns:", err);
  }
}

/** * Get all users who have EOD sales reports enabled. */
export async function getUsersWithEODEnabled(): Promise<EODUser[]> {
  const rows = await db("users as u")
    .innerJoin("settings as s", "s.user_id", "u.id")
    .select(
      "u.id",
      "u.role",
      "s.eod_report_enabled",
      "s.eod_business_closing_time",
      "s.eod_channels",
      "s.eod_admin_email",
      "s.eod_admin_phone",
    )
    .where({ "s.eod_report_enabled": 1, "u.role": "admin" });

  return rows.map((row) => ({
    id: row.id,
    eod_report_enabled: Boolean(row.eod_report_enabled),
    eod_business_closing_time: row.eod_business_closing_time || "18:00",
    eod_channels: row.eod_channels ?? null,
    eod_admin_email: row.eod_admin_email ?? null,
    eod_admin_phone: row.eod_admin_phone ?? null,
  }));
}

/**
 * Get settings for the current user
 */
export async function getSettingsById(
  userId: string,
): Promise<Result<Settings>> {
  try {
    const currentUser = await getUser(userId);
    if (!currentUser.success) {
      return Result.fail("Unauthorized");
    }
    const id = currentUser.data;

    // Get or create settings
    let settings = await db("settings").where("user_id", id).first();

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

    await ensureSettingsColumns();

    // Get or create settings
    let settings = await db("settings")
      .where("user_id", currentUser.id)
      .first();

    if (!settings) {
      // Create default settings
      // accent_color: "#196b94",
      const [newSettings] = await db("settings").insert({
        id: generateId(),
        user_id: currentUser.id,
        logo: "data:image/png;base64,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",
        business_name: "Inventory Pro",
        business_address: "AK-459-6364,Kumasi",
        business_phone: "+233543772591",
        business_email: "inventorypro@frebbytech.com",
        currency: "GHS",
        tax_rate: 1,
        language: "en",
        theme: "system",
        accent_color: "#196b94",
        notification_email: 0,
        notification_push: 0,
        notification_sms: 0,
        print_after_sale: 1,
        printer_device_name: "POS58 Printer(2)",
        paper_size: "thermal_58mm",
        stock_audio_alert: 1,
        stock_audio_volume: 0.96,
        stock_audio_tone: "chime",
        stock_alert_threshold: 5,
        eod_admin_phone: "",
        eod_report_enabled: 0,
        eod_business_closing_time: "18:00",
        eod_channels: "in_app",
        eod_admin_email: "",
      });

      settings = await db("settings").where("id", newSettings).first();
    }

    return Result.ok(settings);
  } catch (error: any) {
    console.error("Failed to fetch settings:", error);
    return Result.fail(error?.message || "Failed to fetch settings");
  }
}

/**
 * Update settings for the current user
 */
export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<Result<Settings>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }
    // console.log(input);
    const businessName = input?.old_business_name || input?.business_name || "";

    delete input.old_business_name;
    await db("settings")
      .where({ business_name: businessName })
      .update({
        ...input,
        updated_at: db.fn.now(),
      });
    // console.log(updated);
    // if (updated === 0) {
    //   return Result.fail("Failed to update settings");
    // }
    const UpdatedSetting = await db("settings")
      .where("user_id", currentUser?.id)
      .first();

    revalidatePath("/admin/settings");
    return Result.ok(UpdatedSetting);
  } catch (error: any) {
    console.error("Failed to update settings:", error?.message);
    console.error("Failed to update settings:", error);
    return Result.fail(error?.message || "Failed to update settings");
  }
}
