import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import db from "@/db/knex";
import { generateId } from "@/utils/generator";
import { getAuthContextSession } from "@/lib/request-context";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
  ensureMultiTenantSchema,
  normalizeSlug,
  normalizeTenantAccessMode,
} from "@/lib/tenant";
import { ensureBaseTables } from "@/lib/base-schema";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "inventorypro_default_jwt_secret_key_2026_change_in_prod",
);

export const COOKIE_NAME = process.env.COOKIE_NAME || "auth_session";

export type SessionUser = {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  tenant_slug?: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  role: "admin" | "member";
  phonenumber?: string;
  last_login_at?: string | null;
};

export const DEFAULT_LOGO_DATA_URL = `data:image/png;base64,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`;

export function buildDefaultSettingsRow(opts: {
  userId: string;
  tenantId: string;
  businessName?: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
}) {
  return {
    id: generateId(),
    tenant_id: opts.tenantId,
    user_id: opts.userId,
    logo: DEFAULT_LOGO_DATA_URL,
    business_name: opts.businessName || "Inventory Pro",
    business_address: opts.businessAddress || "",
    business_phone: opts.businessPhone || "",
    business_email: opts.businessEmail || "",
    business_opening_time: "08:00",
    business_closing_time: "18:00",
    business_hours_schedule: JSON.stringify([
      { day: "monday", label: "Monday", closed: false, openTime: "08:00", closeTime: "18:00" },
      { day: "tuesday", label: "Tuesday", closed: false, openTime: "08:00", closeTime: "18:00" },
      { day: "wednesday", label: "Wednesday", closed: false, openTime: "08:00", closeTime: "18:00" },
      { day: "thursday", label: "Thursday", closed: false, openTime: "08:00", closeTime: "18:00" },
      { day: "friday", label: "Friday", closed: false, openTime: "08:00", closeTime: "18:00" },
      { day: "saturday", label: "Saturday", closed: false, openTime: "09:00", closeTime: "16:00" },
      { day: "sunday", label: "Sunday", closed: true, openTime: "09:00", closeTime: "16:00" },
    ]),
    business_hours_notes: "",
    business_24_7: false,
    eod_report_enabled: false,
    eod_business_closing_time: "18:00",
    eod_channels: '["in_app"]',
    eod_admin_email: opts.businessEmail || null,
    eod_admin_phone: opts.businessPhone || null,
    currency: "GHS",
    tax_rate: 1.0,
    language: "en",
    theme: "light",
    accent_color: "#003194",
    notification_email: 0,
    notification_push: 0,
    notification_sms: 0,
    stock_audio_alert: true,
    stock_audio_volume: 0.5,
    stock_audio_tone: "chime",
    stock_alert_threshold: 5,
    printer_device_name: "",
    print_after_sale: 1,
    paper_size: "thermal_80mm",
  };
}

const globalForAuthSchema = globalThis as typeof globalThis & {
  __inventoryProAuthInitialized?: boolean;
  __inventoryProAuthInitPromise?: Promise<void> | null;
};

export async function ensureAuthSchema() {
  if (!globalForAuthSchema.__inventoryProAuthInitialized) {
    if (!globalForAuthSchema.__inventoryProAuthInitPromise) {
      globalForAuthSchema.__inventoryProAuthInitPromise = (async () => {
        await ensureBaseTables(db);
        const hasUsersTable = await db.schema.hasTable("users");
        if (!hasUsersTable) {
          return;
        }

        const existingAdmin = await db("users")
          .where("role", "admin")
          .first("id");

        if (!existingAdmin) {
          const defaultHash = await hashPassword(
            process.env.INITIAL_ADMIN_PASSWORD || "Admin123!",
          );

          await db.transaction(async (trx) => {
            const adminUser = await trx("users").where("role", "admin").first("id");
            if (adminUser) return;

            const adminId = generateId();
            const hasTenants = await trx.schema.hasTable("tenants");
            if (hasTenants) {
              await trx("tenants")
                .insert({
                  id: DEFAULT_TENANT_ID,
                  name: DEFAULT_TENANT_NAME,
                  slug: DEFAULT_TENANT_SLUG,
                  owner_user_id: adminId,
                  status: "active",
                })
                .onConflict("id")
                .ignore();
            }

            const hasTenantCol = await trx.schema.hasColumn("users", "tenant_id");
            await trx("users").insert({
              id: adminId,
              ...(hasTenantCol ? { tenant_id: DEFAULT_TENANT_ID } : {}),
              username: "frebbytech",
              email: "inventorypro@frebbytech.com",
              firstname: "System",
              lastname: "Admin",
              role: "admin",
              password_hash: defaultHash,
            });

            const hasSettings = await trx.schema.hasTable("settings");
            if (hasSettings) {
              const hasSettingsTenant = await trx.schema.hasColumn(
                "settings",
                "tenant_id",
              );
              const defaults = buildDefaultSettingsRow({
                userId: adminId,
                tenantId: DEFAULT_TENANT_ID,
                businessName: "Inventory Pro",
                businessEmail: "inventorypro@frebbytech.com",
                businessPhone: "+233543772591",
                businessAddress: "AK-459-6364,Kumasi",
              });
              if (!hasSettingsTenant) {
                delete (defaults as any).tenant_id;
              }
              await trx("settings").insert(defaults);
            }
          });
        }

        globalForAuthSchema.__inventoryProAuthInitialized = true;
      })().catch((err) => {
        globalForAuthSchema.__inventoryProAuthInitPromise = null;
        console.error("Critical failure initializing auth schema:", err);
        throw err;
      });
    }

    await globalForAuthSchema.__inventoryProAuthInitPromise;
  }

  await ensureMultiTenantSchema();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createJWT(payload: {
  userId: string;
  tenantId: string;
  tenantSlug?: string;
  username: string;
  role: "admin" | "member";
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(generateId("jti"))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyJWT(token: string): Promise<{
  userId: string;
  tenantId?: string;
  tenantSlug?: string;
  username: string;
  role: "admin" | "member";
  exp?: number;
} | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as {
      userId: string;
      tenantId?: string;
      tenantSlug?: string;
      username: string;
      role: "admin" | "member";
      exp?: number;
    };
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function removeAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

async function isSessionTokenActiveInDb(
  userId: string,
  token: string,
): Promise<boolean> {
  const sessionRow = await db("user_sessions")
    .where({ user_id: userId, token })
    .first("id", "is_active", "expires_at")
    .catch(() => null);

  if (!sessionRow) {
    return true;
  }
  if (Number(sessionRow.is_active) === 0) {
    return false;
  }
  if (
    sessionRow.expires_at &&
    new Date(sessionRow.expires_at).getTime() < Date.now()
  ) {
    return false;
  }
  void db("user_sessions")
    .where("id", sessionRow.id)
    .update({ last_activity_at: new Date().toISOString() })
    .catch(() => {});
  return true;
}

async function loadSessionUserById(
  userId: string,
  channel: "web" | "mobile" = "web",
): Promise<SessionUser | null> {
  const user = await db("users as u")
    .leftJoin("tenants as t", "u.tenant_id", "t.id")
    .select(
      "u.id",
      "u.tenant_id",
      "t.name as tenant_name",
      "t.slug as tenant_slug",
      "t.status as tenant_status",
      "t.access_mode as tenant_access_mode",
      "u.username",
      "u.email",
      "u.firstname",
      "u.lastname",
      "u.phonenumber",
      "u.role",
      "u.last_login_at",
    )
    .where("u.id", userId)
    .first();

  if (!user) return null;
  if (user.tenant_status === "suspended") return null;

  const accessMode = normalizeTenantAccessMode(user.tenant_access_mode);
  if (channel === "web" && accessMode === "mobile_only") return null;
  if (channel === "mobile" && accessMode === "web_only") return null;

  return {
    id: user.id,
    tenant_id: user.tenant_id || DEFAULT_TENANT_ID,
    tenant_name: user.tenant_name || DEFAULT_TENANT_NAME,
    tenant_slug: user.tenant_slug || DEFAULT_TENANT_SLUG,
    username: user.username || "",
    email: user.email || "",
    firstname: user.firstname || "",
    lastname: user.lastname || "",
    phonenumber: user.phonenumber || "",
    role: user.role === "admin" ? "admin" : "member",
    last_login_at: user.last_login_at || null,
  };
}

export async function getWebSessionRejectionReason(): Promise<
  "mobile_only" | "suspended" | null
> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const decoded = await verifyJWT(token);
    if (!decoded?.userId) return null;

    await ensureAuthSchema();
    const user = await db("users as u")
      .leftJoin("tenants as t", "u.tenant_id", "t.id")
      .select("t.status as tenant_status", "t.access_mode as tenant_access_mode")
      .where("u.id", decoded.userId)
      .first();
    if (!user) return null;
    if (user.tenant_status === "suspended") return "suspended";
    if (normalizeTenantAccessMode(user.tenant_access_mode) === "mobile_only") {
      return "mobile_only";
    }
    return null;
  } catch {
    return null;
  }
}

export async function getAuthSessionInfo(): Promise<{
  session: SessionUser;
  expiresAt: number | null;
} | null> {
  const ctxSession = getAuthContextSession();
  if (ctxSession) {
    return {
      session: ctxSession,
      expiresAt: null,
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const decoded = await verifyJWT(token);
  if (!decoded?.userId) return null;

  await ensureAuthSchema();

  const isActive = await isSessionTokenActiveInDb(decoded.userId, token);
  if (!isActive) return null;

  const session = await loadSessionUserById(decoded.userId, "web");
  if (!session) return null;
  if (decoded.tenantId && session.tenant_id !== decoded.tenantId) {
    return null;
  }

  const expiresAt = decoded.exp ? decoded.exp * 1000 : null;

  return {
    session,
    expiresAt,
  };
}

export async function getAuthSession(): Promise<SessionUser | null> {
  const ctxSession = getAuthContextSession();
  if (ctxSession) {
    return ctxSession;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const decoded = await verifyJWT(token);
  if (!decoded?.userId) return null;

  await ensureAuthSchema();

  const isActive = await isSessionTokenActiveInDb(decoded.userId, token);
  if (!isActive) return null;

  const session = await loadSessionUserById(decoded.userId, "web");
  if (!session) return null;
  if (decoded.tenantId && session.tenant_id !== decoded.tenantId) {
    return null;
  }

  return session;
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  try {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get("token");
    if (queryToken?.trim()) return queryToken.trim();
  } catch {
    // ignore malformed URL
  }
  return null;
}

export async function getBearerAuthSession(
  req: Request,
): Promise<{ session: SessionUser; token: string } | null> {
  await ensureAuthSchema();

  const token = extractTokenFromRequest(req);
  if (!token) return null;

  const decoded = await verifyJWT(token);
  if (!decoded?.userId) return null;

  const isActive = await isSessionTokenActiveInDb(decoded.userId, token);
  if (!isActive) return null;

  const session = await loadSessionUserById(decoded.userId, "mobile");
  if (!session) return null;
  if (decoded.tenantId && session.tenant_id !== decoded.tenantId) {
    return null;
  }

  return { session, token };
}

/**
 * Resolve an isolated new cloud tenant + owner admin user + default store settings atomically.
 */
export async function registerWorkspaceAccount(input: {
  storeName: string;
  slug?: string;
  username: string;
  email: string;
  password: string;
  firstname?: string;
  lastname?: string;
  phonenumber?: string;
  businessAddress?: string;
  currency?: string;
  accessMode?: "both" | "mobile_only" | "web_only";
}): Promise<{
  tenant: { id: string; name: string; slug: string };
  user: SessionUser;
}> {
  await ensureAuthSchema();

  const storeName = input.storeName.trim();
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const accessMode = normalizeTenantAccessMode(input.accessMode);

  if (!storeName || !username || !email || !password) {
    throw new Error("Store name, username, email, and password are required.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  const existingEmail = await db("users")
    .whereRaw("LOWER(email) = ?", [email])
    .first("id");
  if (existingEmail) {
    throw new Error("An account with this email already exists.");
  }

  let candidateSlug = input.slug?.trim()
    ? normalizeSlug(input.slug.trim())
    : normalizeSlug(storeName);

  if (input.slug?.trim()) {
    const existingExplicit = await db("tenants")
      .where("slug", candidateSlug)
      .first("id");
    if (existingExplicit) {
      throw new Error(`Workspace code "${candidateSlug}" is already in use.`);
    }
  } else {
    const baseSlug = candidateSlug;
    for (let attempt = 0; attempt < 5; attempt++) {
      const existingSlug = await db("tenants")
        .where("slug", candidateSlug)
        .first("id");
      if (!existingSlug) break;
      candidateSlug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
  }

  const tenantId = generateId("tnt");
  const adminId = generateId();
  const passwordHash = await hashPassword(password);
  const nowIso = new Date().toISOString();

  const trx = await db.transaction();
  try {
    await trx("tenants").insert({
      id: tenantId,
      name: storeName,
      slug: candidateSlug,
      owner_user_id: adminId,
      status: "active",
      access_mode: accessMode,
      created_at: nowIso,
      updated_at: nowIso,
    });

    await trx("users").insert({
      id: adminId,
      tenant_id: tenantId,
      username,
      email,
      firstname: input.firstname?.trim() || "Store",
      lastname: input.lastname?.trim() || "Owner",
      phonenumber: input.phonenumber?.trim() || null,
      role: "admin",
      password_hash: passwordHash,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const settingsRow = buildDefaultSettingsRow({
      userId: adminId,
      tenantId,
      businessName: storeName,
      businessEmail: email,
      businessPhone: input.phonenumber?.trim() || "",
      businessAddress: input.businessAddress?.trim() || "",
    });
    if (input.currency) {
      settingsRow.currency = input.currency;
    }

    await trx("settings").insert(settingsRow);

    await trx.commit();

    return {
      tenant: { id: tenantId, name: storeName, slug: candidateSlug },
      user: {
        id: adminId,
        tenant_id: tenantId,
        tenant_name: storeName,
        tenant_slug: candidateSlug,
        username,
        email,
        firstname: input.firstname?.trim() || "Store",
        lastname: input.lastname?.trim() || "Owner",
        phonenumber: input.phonenumber?.trim() || "",
        role: "admin",
        last_login_at: new Date().toISOString(),
      },
    };
  } catch (err) {
    await trx.rollback();
    throw err;
  }
}
