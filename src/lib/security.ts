import "server-only";
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import nodemailer from "nodemailer";
import db from "@/db/knex";
import { decrypt } from "@/lib/encryption";
import { buildEmailHtml } from "@/lib/email";
import type { TwoFactorMethod } from "@/types/globals";
import { generateId } from "@/utils/generator";
import { ensureBaseTables } from "@/lib/base-schema";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "inventorypro_default_jwt_secret_key_2026_change_in_prod",
);

const OTP_EXPIRY_MINUTES = 10;

const globalForSecuritySchema = globalThis as typeof globalThis & {
  __inventoryProSecuritySchemaPromise?: Promise<void> | null;
};

/**
 * Idempotently ensure 2FA columns exist on `users` and `two_factor_codes` table exists.
 */
export async function ensureSecuritySchema(): Promise<void> {
  if (globalForSecuritySchema.__inventoryProSecuritySchemaPromise) {
    return globalForSecuritySchema.__inventoryProSecuritySchemaPromise;
  }

  globalForSecuritySchema.__inventoryProSecuritySchemaPromise = (async () => {
    let hasUsers = await db.schema.hasTable("users");
    if (!hasUsers) {
      await ensureBaseTables(db);
      hasUsers = await db.schema.hasTable("users");
    }
    if (!hasUsers) {
      throw new Error("Users table is not initialized yet.");
    }

    const [hasEnabled, hasMethod, hasUpdatedAt] = await Promise.all([
      db.schema.hasColumn("users", "two_factor_enabled"),
      db.schema.hasColumn("users", "two_factor_method"),
      db.schema.hasColumn("users", "two_factor_updated_at"),
    ]);

    if (!hasEnabled || !hasMethod || !hasUpdatedAt) {
      await db.schema.alterTable("users", (table) => {
        if (!hasEnabled) {
          table.boolean("two_factor_enabled").notNullable().defaultTo(false);
        }
        if (!hasMethod) {
          table.string("two_factor_method", 20).notNullable().defaultTo("email");
        }
        if (!hasUpdatedAt) {
          table.timestamp("two_factor_updated_at").nullable();
        }
      });
    }

    const hasCodesTable = await db.schema.hasTable("two_factor_codes");
    if (!hasCodesTable) {
      await db.schema.createTable("two_factor_codes", (table) => {
        table.string("id", 64).primary();
        table.string("tenant_id", 64).notNullable().defaultTo("default-tenant").index();
        table.string("user_id", 64).notNullable().index();
        table.string("code_hash", 128).notNullable();
        table.string("method", 20).notNullable().defaultTo("email");
        table.integer("attempts").notNullable().defaultTo(0);
        table.timestamp("expires_at").notNullable();
        table.timestamp("consumed_at").nullable();
        table.timestamp("created_at").defaultTo(db.fn.now());
      });
    } else {
      const hasCodeTenant = await db.schema.hasColumn("two_factor_codes", "tenant_id");
      if (!hasCodeTenant) {
        await db.schema.alterTable("two_factor_codes", (table) => {
          table.string("tenant_id", 64).notNullable().defaultTo("default-tenant").index();
        });
      }
    }
  })().catch((err) => {
    globalForSecuritySchema.__inventoryProSecuritySchemaPromise = null;
    throw err;
  });

  return globalForSecuritySchema.__inventoryProSecuritySchemaPromise;
}

export function normalizeTwoFactorMethod(value: unknown): TwoFactorMethod {
  return value === "sms" ? "sms" : "email";
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtpCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}

export function maskTarget(method: TwoFactorMethod, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (method === "sms") {
    const visible = trimmed.slice(-4);
    const prefix = trimmed.slice(0, Math.min(3, Math.max(0, trimmed.length - 4)));
    return `${prefix}${"•".repeat(Math.max(3, trimmed.length - prefix.length - visible.length))}${visible}`;
  }

  const [local, domain] = trimmed.split("@");
  if (!domain) return "••••";
  const safeLocal =
    local.length <= 2
      ? `${local[0] ?? "•"}••`
      : `${local.slice(0, 2)}${"•".repeat(Math.min(5, local.length - 2))}`;
  return `${safeLocal}@${domain}`;
}

export async function createTwoFactorChallengeToken(payload: {
  userId: string;
  tenantId?: string;
  codeId: string;
  method: TwoFactorMethod;
}): Promise<string> {
  return new SignJWT({
    purpose: "2fa_challenge",
    userId: payload.userId,
    tenantId: payload.tenantId || "default-tenant",
    codeId: payload.codeId,
    method: payload.method,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${OTP_EXPIRY_MINUTES}m`)
    .sign(JWT_SECRET);
}

export async function verifyTwoFactorChallengeToken(token: string): Promise<{
  userId: string;
  tenantId: string;
  codeId: string;
  method: TwoFactorMethod;
} | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (
      payload.purpose !== "2fa_challenge" ||
      typeof payload.userId !== "string" ||
      typeof payload.codeId !== "string"
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      tenantId:
        typeof payload.tenantId === "string"
          ? payload.tenantId
          : "default-tenant",
      codeId: payload.codeId,
      method: normalizeTwoFactorMethod(payload.method),
    };
  } catch {
    return null;
  }
}

async function getSystemCredentialsForDelivery(tenantId: string) {
  const rows = await db("api_settings")
    .leftJoin("users", "api_settings.user_id", "users.id")
    .where("api_settings.tenant_id", tenantId)
    .select("api_settings.*", "users.role as owner_role")
    .orderByRaw("CASE WHEN users.role = 'admin' THEN 0 ELSE 1 END");

  const row = rows[0];
  if (!row) return null;

  return {
    arkessel: {
      apiKey: row.arkessel_api_key ? decrypt(row.arkessel_api_key) : "",
      senderId: row.arkessel_sender_id || "InvPro",
      baseUrl:
        row.arkessel_base_url || "https://sms.arkesel.com/api/v2/sms/send",
    },
    smtp: {
      host: row.smtp_host || "smtp.gmail.com",
      port: Number(row.smtp_port) || 587,
      secure: Boolean(row.smtp_secure),
      user: row.smtp_user || "",
      pass: row.smtp_password ? decrypt(row.smtp_password) : "",
      fromName: row.smtp_from_name || "Inventory Pro",
      fromEmail: row.smtp_from_email || row.smtp_user || "",
    },
  };
}

async function getBusinessProfileForEmail(tenantId: string): Promise<{
  businessName: string;
  logoUrl?: string | null;
}> {
  const settingsRow = await db("settings")
    .where("tenant_id", tenantId)
    .select("business_name", "logo")
    .first()
    .catch(() => null);

  return {
    businessName: settingsRow?.business_name || "Inventory Pro",
    logoUrl: settingsRow?.logo || null,
  };
}

/**
 * Create a fresh 6-digit OTP record for the user and dispatch it over email or SMS.
 */
export async function issueAndSendTwoFactorCode(user: {
  id: string;
  tenant_id?: string | null;
  email?: string | null;
  phonenumber?: string | null;
  firstname?: string | null;
  username: string;
  two_factor_method?: unknown;
}): Promise<{
  success: boolean;
  codeId?: string;
  method: TwoFactorMethod;
  maskedTarget?: string;
  error?: string;
}> {
  await ensureSecuritySchema();

  const tenantId = String(user.tenant_id || "default-tenant");
  const method = normalizeTwoFactorMethod(user.two_factor_method);
  const target =
    method === "sms"
      ? String(user.phonenumber || "").trim()
      : String(user.email || "").trim();

  if (!target) {
    return {
      success: false,
      method,
      error:
        method === "sms"
          ? "Two-factor authentication is enabled for your account, but no phone number is on file. Contact an administrator."
          : "Two-factor authentication is enabled for your account, but no email address is on file. Contact an administrator.",
    };
  }

  const creds = await getSystemCredentialsForDelivery(tenantId);
  if (method === "email" && (!creds?.smtp.user || !creds?.smtp.pass)) {
    return {
      success: false,
      method,
      error:
        "Two-factor authentication is enabled for this account, but SMTP email credentials are not configured yet. Please contact an administrator.",
    };
  }

  if (method === "sms" && !creds?.arkessel.apiKey) {
    return {
      success: false,
      method,
      error:
        "Two-factor authentication is enabled for this account, but SMS API credentials are not configured yet. Please contact an administrator.",
    };
  }

  const code = generateOtpCode();
  const codeId = generateId();
  const expiresAt = new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
  ).toISOString();

  // Invalidate any previous unconsumed challenges for this user
  await db("two_factor_codes")
    .where({ user_id: user.id })
    .whereNull("consumed_at")
    .update({ consumed_at: new Date().toISOString() });

  await db("two_factor_codes").insert({
    id: codeId,
    tenant_id: tenantId,
    user_id: user.id,
    code_hash: hashOtpCode(code),
    method,
    attempts: 0,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  });

  if (method === "email") {
    try {
      const { businessName, logoUrl } = await getBusinessProfileForEmail(tenantId);
      const transporter = nodemailer.createTransport({
        host: creds!.smtp.host,
        port: creds!.smtp.port,
        secure: creds!.smtp.secure,
        auth: { user: creds!.smtp.user, pass: creds!.smtp.pass },
      });

      const from = creds!.smtp.fromName
        ? `"${creds!.smtp.fromName}" <${creds!.smtp.fromEmail}>`
        : creds!.smtp.fromEmail;

      const html = buildEmailHtml({
        businessName,
        logoUrl,
        title: "Your two-factor verification code",
        bodyHtml: `
          <p>Hi ${user.firstname || user.username},</p>
          <p>Use the verification code below to finish signing in to your ${businessName} account:</p>
          <p style="font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;margin:24px 0;">${code}</p>
          <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't attempt to sign in, please notify your administrator immediately.</p>
        `,
      });

      await transporter.sendMail({
        from,
        to: target,
        subject: `${code} is your ${businessName} verification code`,
        text: `Your verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
        html,
      });
    } catch (error: any) {
      await db("two_factor_codes").where({ id: codeId }).del().catch(() => {});
      return {
        success: false,
        method,
        error:
          error?.message ||
          "Failed to send 2FA verification email. Contact your administrator.",
      };
    }
  } else {
    try {
      const response = await fetch(creds!.arkessel.baseUrl, {
        method: "POST",
        headers: {
          "api-key": creds!.arkessel.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: creds!.arkessel.senderId || "InvPro",
          message: `Your verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone.`,
          recipients: [target],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`SMS provider error (${response.status}): ${text}`);
      }
      const data = await response.json().catch(() => null);
      if (data?.status && data.status !== "success") {
        throw new Error(data?.message || "SMS provider rejected the request");
      }
    } catch (error: any) {
      await db("two_factor_codes").where({ id: codeId }).del().catch(() => {});
      return {
        success: false,
        method,
        error:
          error?.message ||
          "Failed to send 2FA verification SMS. Contact your administrator.",
      };
    }
  }

  return {
    success: true,
    codeId,
    method,
    maskedTarget: maskTarget(method, target),
  };
}
