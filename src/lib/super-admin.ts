import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import db from "@/db/knex";
import { hashPassword, verifyPassword, ensureAuthSchema } from "@/lib/auth";
import { ensureSecuritySchema } from "@/lib/security";
import { ensureMultiTenantSchema } from "@/lib/tenant";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "inventorypro_default_jwt_secret_key_2026_change_in_prod",
);

export const SUPER_ADMIN_COOKIE_NAME = "super_admin_session";
const ROOT_SUPER_ADMIN_ID = "super-admin-root";

export interface SuperAdminSession {
  id: string;
  username: string;
  email: string;
  fullname: string;
  last_login_at?: string | null;
}

const globalForSuperAdmin = globalThis as typeof globalThis & {
  __inventoryProSuperAdminSchemaPromise?: Promise<void> | null;
};

async function ensurePlatformSettingsTable(): Promise<void> {
  const hasPlatformSettings = await db.schema.hasTable("platform_settings");
  if (!hasPlatformSettings) {
    await db.schema.createTable("platform_settings", (table) => {
      table.string("key", 100).primary();
      table.text("value").nullable();
      table.string("updated_by_super_admin_id", 64).nullable();
      table.timestamp("updated_at").nullable();
    });
  }
}

async function initSuperAdminSchema(): Promise<void> {
  await ensureAuthSchema();
  await ensureMultiTenantSchema();
  if (await db.schema.hasTable("users")) {
    await ensureSecuritySchema();
  }

  const hasTable = await db.schema.hasTable("super_admins");
  if (!hasTable) {
    await db.schema.createTable("super_admins", (table) => {
      table.string("id", 64).primary();
      table.string("username", 100).notNullable().unique();
      table.string("email", 255).notNullable().unique();
      table.string("password_hash", 255).notNullable();
      table.string("fullname", 150).notNullable().defaultTo("Platform Super Admin");
      table.timestamp("last_login_at").nullable();
      table.timestamps(true, true);
    });
  }

  await ensurePlatformSettingsTable();

  const envMobileUrl = process.env.MOBILE_API_BASE_URL?.trim();
  if (envMobileUrl) {
    const existingPlatformUrl = await db("platform_settings")
      .where("key", "mobile_server_url")
      .first("key");
    if (!existingPlatformUrl) {
      try {
        const normalizedEnvUrl = normalizePlatformServerUrl(envMobileUrl);
        if (normalizedEnvUrl) {
          await db("platform_settings").insert({
            key: "mobile_server_url",
            value: normalizedEnvUrl,
            updated_by_super_admin_id: ROOT_SUPER_ADMIN_ID,
            updated_at: new Date().toISOString(),
          });
        }
      } catch {
        // ignore invalid env fallback during schema bootstrap
      }
    }
  }

  const configuredEmail = (
    process.env.SUPER_ADMIN_EMAIL?.trim() || "superadmin@inventorypro.app"
  ).toLowerCase();
  const configuredUsername =
    process.env.SUPER_ADMIN_USERNAME?.trim() || "superadmin";
  const configuredPassword =
    process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin123!";
  const hasExplicitPasswordEnv = Boolean(process.env.SUPER_ADMIN_PASSWORD);

  const existing = await db("super_admins")
    .where("id", ROOT_SUPER_ADMIN_ID)
    .orWhereRaw("LOWER(email) = ?", [configuredEmail])
    .orWhereRaw("LOWER(username) = ?", [configuredUsername.toLowerCase()])
    .first();

  if (!existing) {
    const anySuperAdmin = await db("super_admins").first("id");
    if (!anySuperAdmin) {
      const passwordHash = await hashPassword(configuredPassword);
      await db("super_admins").insert({
        id: ROOT_SUPER_ADMIN_ID,
        username: configuredUsername,
        email: configuredEmail,
        password_hash: passwordHash,
        fullname: "Platform Super Admin",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return;
  }

  // Keep seeded root super admin aligned if env overrides were updated
  if (existing.id === ROOT_SUPER_ADMIN_ID) {
    const updates: Record<string, any> = {};
    if (process.env.SUPER_ADMIN_EMAIL?.trim() && existing.email !== configuredEmail) {
      updates.email = configuredEmail;
    }
    if (
      process.env.SUPER_ADMIN_USERNAME?.trim() &&
      existing.username !== configuredUsername
    ) {
      updates.username = configuredUsername;
    }
    if (hasExplicitPasswordEnv) {
      const matches = await verifyPassword(
        configuredPassword,
        String(existing.password_hash || ""),
      ).catch(() => false);
      if (!matches) {
        updates.password_hash = await hashPassword(configuredPassword);
      }
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await db("super_admins").where("id", existing.id).update(updates);
    }
  }
}

export async function ensureSuperAdminSchema(): Promise<void> {
  if (globalForSuperAdmin.__inventoryProSuperAdminSchemaPromise) {
    return globalForSuperAdmin.__inventoryProSuperAdminSchemaPromise;
  }
  globalForSuperAdmin.__inventoryProSuperAdminSchemaPromise =
    initSuperAdminSchema().catch((err) => {
      globalForSuperAdmin.__inventoryProSuperAdminSchemaPromise = null;
      console.error("Failed to initialize super_admins schema:", err);
      throw err;
    });
  return globalForSuperAdmin.__inventoryProSuperAdminSchemaPromise;
}

const MOBILE_SERVER_URL_KEY = "mobile_server_url";

export function normalizePlatformServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      "Enter a valid server URL starting with http:// or https://.",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Server URL must start with http:// or https://.");
  }
  const cleanPath =
    parsed.pathname && parsed.pathname !== "/"
      ? parsed.pathname.replace(/\/+$/, "")
      : "";
  return `${parsed.origin}${cleanPath}`;
}

export async function getPlatformMobileConfig(): Promise<{
  serverUrl: string;
  configuredBySuperAdmin: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}> {
  let row: any = null;
  try {
    row = await db("platform_settings as ps")
      .leftJoin("super_admins as sa", "ps.updated_by_super_admin_id", "sa.id")
      .select("ps.value", "ps.updated_at", "sa.username as updated_by_username")
      .where("ps.key", MOBILE_SERVER_URL_KEY)
      .first();
  } catch {
    await ensurePlatformSettingsTable().catch(() => {});
    row = await db("platform_settings")
      .select("value", "updated_at")
      .where("key", MOBILE_SERVER_URL_KEY)
      .first()
      .catch(() => null);
  }

  const savedValue = typeof row?.value === "string" ? row.value.trim() : "";
  if (savedValue) {
    return {
      serverUrl: savedValue.replace(/\/+$/, ""),
      configuredBySuperAdmin: true,
      updatedAt: row?.updated_at ? String(row.updated_at) : null,
      updatedBy: row?.updated_by_username
        ? String(row.updated_by_username)
        : null,
    };
  }

  const envFallback =
    process.env.MOBILE_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";

  return {
    serverUrl: envFallback.replace(/\/+$/, ""),
    configuredBySuperAdmin: false,
    updatedAt: null,
    updatedBy: null,
  };
}

export async function setPlatformMobileServerUrl(
  rawUrl: string,
  superAdminId: string,
): Promise<{
  serverUrl: string;
  configuredBySuperAdmin: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}> {
  await ensureSuperAdminSchema();
  const normalized = normalizePlatformServerUrl(rawUrl);
  const nowIso = new Date().toISOString();

  const existing = await db("platform_settings")
    .where("key", MOBILE_SERVER_URL_KEY)
    .first("key");

  if (!normalized) {
    if (existing) {
      await db("platform_settings")
        .where("key", MOBILE_SERVER_URL_KEY)
        .del();
    }
    return getPlatformMobileConfig();
  }

  if (existing) {
    await db("platform_settings")
      .where("key", MOBILE_SERVER_URL_KEY)
      .update({
        value: normalized,
        updated_by_super_admin_id: superAdminId,
        updated_at: nowIso,
      });
  } else {
    await db("platform_settings").insert({
      key: MOBILE_SERVER_URL_KEY,
      value: normalized,
      updated_by_super_admin_id: superAdminId,
      updated_at: nowIso,
    });
  }

  return getPlatformMobileConfig();
}

export async function createSuperAdminJWT(payload: {
  superAdminId: string;
  username: string;
  email: string;
}): Promise<string> {
  return new SignJWT({
    ...payload,
    scope: "super_admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifySuperAdminJWT(token: string): Promise<{
  superAdminId: string;
  username: string;
  email: string;
  scope: "super_admin";
  exp?: number;
} | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload?.scope !== "super_admin" || typeof payload?.superAdminId !== "string") {
      return null;
    }
    return payload as unknown as {
      superAdminId: string;
      username: string;
      email: string;
      scope: "super_admin";
      exp?: number;
    };
  } catch {
    return null;
  }
}

export async function setSuperAdminCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SUPER_ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function removeSuperAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SUPER_ADMIN_COOKIE_NAME);
}

export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  await ensureSuperAdminSchema();

  const cookieStore = await cookies();
  const token = cookieStore.get(SUPER_ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;

  const decoded = await verifySuperAdminJWT(token);
  if (!decoded?.superAdminId) return null;

  const row = await db("super_admins")
    .select("id", "username", "email", "fullname", "last_login_at")
    .where("id", decoded.superAdminId)
    .first();

  if (!row) return null;

  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    fullname: String(row.fullname || "Platform Super Admin"),
    last_login_at: row.last_login_at ? String(row.last_login_at) : null,
  };
}
