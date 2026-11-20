/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { revalidatePath } from "next/cache";
import { Result, ApiSettings, UpdateApiSettingsInput } from "@/types/globals";
import { encrypt, decrypt, maskSecret } from "@/lib/encryption";
import { getCurrentUser } from "./_actions";
import { generateId } from "@/utils/generator";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

async function findOrCreateTenantApiSettingsRow(userId: string, tenantId: string) {
  let row = await db("api_settings")
    .where("tenant_id", tenantId)
    .orderByRaw("CASE WHEN user_id = ? THEN 0 ELSE 1 END", [userId])
    .first();

  if (!row) {
    const newId = generateId();
    await db("api_settings").insert({
      id: newId,
      tenant_id: tenantId,
      user_id: userId,
      arkessel_base_url: "https://sms.arkesel.com/api/v2/sms/send",
      smtp_host: "smtp.gmail.com",
      smtp_port: 587,
      smtp_secure: false,
    });
    row = await db("api_settings").where("id", newId).first();
  }

  return row;
}

/**
 * Get API settings for the current workspace with sensitive fields masked.
 */
export async function getApiSettings(): Promise<Result<ApiSettings>> {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return Result.fail("Unauthorized");

    const tenantId = user.tenant_id || DEFAULT_TENANT_ID;
    const row = await findOrCreateTenantApiSettingsRow(user.id, tenantId);

    const decryptedArkKey = row.arkessel_api_key
      ? decrypt(row.arkessel_api_key)
      : "";
    const decryptedSmtpPass = row.smtp_password
      ? decrypt(row.smtp_password)
      : "";

    const safe: ApiSettings = {
      id: row.id,
      user_id: row.user_id,

      arkessel_api_key: decryptedArkKey ? maskSecret(decryptedArkKey) : "",
      arkessel_sender_id: row.arkessel_sender_id || "",
      arkessel_base_url:
        row.arkessel_base_url || "https://sms.arkesel.com/api/v2/sms/send",
      has_arkessel_api_key: Boolean(decryptedArkKey),

      smtp_host: row.smtp_host || "smtp.gmail.com",
      smtp_port: row.smtp_port || 587,
      smtp_secure: row.smtp_secure || false,
      smtp_user: row.smtp_user || "",
      smtp_password: decryptedSmtpPass ? maskSecret(decryptedSmtpPass) : "",
      smtp_from_name: row.smtp_from_name || "",
      smtp_from_email: row.smtp_from_email || "",
      has_smtp_password: Boolean(decryptedSmtpPass),

      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    return Result.ok(safe);
  } catch (error: any) {
    console.error("Failed to fetch API settings:", error);
    return Result.fail(error?.message || "Failed to fetch API settings");
  }
}

/**
 * Update API settings for the current workspace.
 */
export async function updateApiSettings(
  input: UpdateApiSettingsInput,
): Promise<Result<{ success: true }>> {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return Result.fail("Unauthorized");

    const tenantId = user.tenant_id || DEFAULT_TENANT_ID;
    const row = await findOrCreateTenantApiSettingsRow(user.id, tenantId);

    const update: any = { updated_at: new Date().toISOString() };

    if (input.arkessel_sender_id !== undefined)
      update.arkessel_sender_id = input.arkessel_sender_id;
    if (input.arkessel_base_url !== undefined)
      update.arkessel_base_url = input.arkessel_base_url;

    if (input.smtp_host !== undefined) update.smtp_host = input.smtp_host;
    if (input.smtp_port !== undefined) update.smtp_port = input.smtp_port;
    if (input.smtp_secure !== undefined) update.smtp_secure = input.smtp_secure;
    if (input.smtp_user !== undefined) update.smtp_user = input.smtp_user;
    if (input.smtp_from_name !== undefined)
      update.smtp_from_name = input.smtp_from_name;
    if (input.smtp_from_email !== undefined)
      update.smtp_from_email = input.smtp_from_email;

    if (input.arkessel_api_key !== undefined) {
      const val = input.arkessel_api_key;
      if (val === "") {
        update.arkessel_api_key = null;
      } else if (!val.startsWith("••••")) {
        update.arkessel_api_key = encrypt(val);
      }
    }

    if (input.smtp_password !== undefined) {
      const val = input.smtp_password;
      if (val === "") {
        update.smtp_password = null;
      } else if (!val.startsWith("••••")) {
        update.smtp_password = encrypt(val);
      }
    }

    await db("api_settings")
      .where({ id: row.id, tenant_id: tenantId })
      .update(update);

    revalidatePath("/admin/settings");
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to update API settings:", error);
    return Result.fail(error?.message || "Failed to update API settings");
  }
}

export async function testSmsConnection(
  toPhone: string,
): Promise<Result<{ success: true }>> {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return Result.fail("Unauthorized");

    const tenantId = user.tenant_id || DEFAULT_TENANT_ID;
    const row = await db("api_settings").where("tenant_id", tenantId).first();
    if (!row?.arkessel_api_key)
      return Result.fail("Arkessel API key not configured");

    const apiKey = decrypt(row.arkessel_api_key);
    if (!apiKey) {
      return Result.fail(
        "Arkessel API key needs to be re-entered and saved before testing.",
      );
    }
    const sender = row.arkessel_sender_id || "InvPro";
    const baseUrl =
      row.arkessel_base_url || "https://sms.arkesel.com/api/v2/sms/send";

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender,
        message: "This is a test SMS from your inventory app.",
        recipients: [toPhone],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return Result.fail(`SMS provider error: ${response.status} ${text}`);
    }

    const data = await response.json();
    if (data?.status && data.status !== "success") {
      return Result.fail(data?.message || "Failed to send test SMS");
    }

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("SMS test error:", error);
    return Result.fail(error?.message || "Failed to test SMS connection");
  }
}

export async function testEmailConnection(): Promise<
  Result<{ success: true }>
> {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return Result.fail("Unauthorized");

    const tenantId = user.tenant_id || DEFAULT_TENANT_ID;
    const row = await db("api_settings").where("tenant_id", tenantId).first();
    if (!row?.smtp_user || !row?.smtp_password)
      return Result.fail("SMTP credentials not configured");

    const smtpPass = decrypt(row.smtp_password);
    if (!smtpPass) {
      return Result.fail(
        "SMTP password needs to be re-entered and saved before testing.",
      );
    }

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: row.smtp_host || "smtp.gmail.com",
      port: row.smtp_port || 587,
      secure: !!row.smtp_secure,
      auth: {
        user: row.smtp_user,
        pass: smtpPass,
      },
    });

    await transporter.verify();
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("SMTP test error:", error);
    return Result.fail(error?.message || "Failed to verify SMTP connection");
  }
}

/**
 * Internal helper: get decrypted workspace API credentials.
 */
export async function getDecryptedApiCredentials(tenantIdOverride?: string) {
  let tenantId = tenantIdOverride;
  if (!tenantId) {
    const user = await getCurrentUser();
    if (!user?.id) return null;
    tenantId = user.tenant_id || DEFAULT_TENANT_ID;
  }

  const row = await db("api_settings").where("tenant_id", tenantId).first();
  if (!row) return null;

  return {
    arkessel: {
      apiKey: row.arkessel_api_key ? decrypt(row.arkessel_api_key) : "",
      senderId: row.arkessel_sender_id || "",
      baseUrl: row.arkessel_base_url,
    },
    smtp: {
      host: row.smtp_host,
      port: row.smtp_port,
      secure: row.smtp_secure,
      user: row.smtp_user,
      pass: row.smtp_password ? decrypt(row.smtp_password) : "",
      fromName: row.smtp_from_name,
      fromEmail: row.smtp_from_email,
    },
  };
}
