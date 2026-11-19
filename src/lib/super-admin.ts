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

let superAdminSchemaPromise: Promise<void> | null = null;

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
  if (superAdminSchemaPromise) {
    return superAdminSchemaPromise;
  }
  superAdminSchemaPromise = initSuperAdminSchema().catch((err) => {
    superAdminSchemaPromise = null;
    console.error("Failed to initialize super_admins schema:", err);
    throw err;
  });
  return superAdminSchemaPromise;
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
