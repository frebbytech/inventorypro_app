/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import db from "@/db/knex";
import {
  buildDefaultSettingsRow,
  hashPassword,
  registerWorkspaceAccount,
  verifyPassword,
} from "@/lib/auth";
import { emitSyncEvent } from "@/lib/sync-bus";
import { DEFAULT_TENANT_ID, normalizeSlug } from "@/lib/tenant";
import {
  createSuperAdminJWT,
  ensureSuperAdminSchema,
  getPlatformMobileConfig,
  getSuperAdminSession,
  removeSuperAdminCookie,
  setPlatformMobileServerUrl,
  setSuperAdminCookie,
  type SuperAdminSession,
} from "@/lib/super-admin";
import { Result } from "@/types/globals";
import type {
  PlatformMobileServerConfig,
  SuperAdminOverviewMetrics,
  TenantDetailData,
  TenantGrowthPoint,
  TenantMemberItem,
  TenantSummaryItem,
} from "@/types/super-admin";
import { generateId } from "@/utils/generator";

async function requireSuperAdmin(): Promise<SuperAdminSession> {
  const session = await getSuperAdminSession();
  if (!session) {
    throw new Error("Super Admin authentication required.");
  }
  return session;
}

export async function loginSuperAdmin(input: {
  identifier: string;
  password: string;
}): Promise<
  Result<{
    id: string;
    username: string;
    email: string;
    fullname: string;
  }>
> {
  try {
    await ensureSuperAdminSchema();

    const identifier = input.identifier.trim().toLowerCase();
    const password = input.password;

    if (!identifier || !password) {
      return Result.fail("Username or email and password are required.");
    }

    const admin = await db("super_admins")
      .whereRaw("LOWER(username) = ?", [identifier])
      .orWhereRaw("LOWER(email) = ?", [identifier])
      .first();

    if (!admin?.password_hash) {
      return Result.fail("Invalid Super Admin credentials.");
    }

    const valid = await verifyPassword(password, String(admin.password_hash));
    if (!valid) {
      return Result.fail("Invalid Super Admin credentials.");
    }

    const nowIso = new Date().toISOString();
    await db("super_admins")
      .where("id", admin.id)
      .update({ last_login_at: nowIso, updated_at: nowIso });

    const token = await createSuperAdminJWT({
      superAdminId: String(admin.id),
      username: String(admin.username),
      email: String(admin.email),
    });

    await setSuperAdminCookie(token);

    return Result.ok({
      id: String(admin.id),
      username: String(admin.username),
      email: String(admin.email),
      fullname: String(admin.fullname || "Platform Super Admin"),
    });
  } catch (error: any) {
    console.error("Super Admin login failed:", error);
    return Result.fail(error?.message || "Super Admin authentication failed.");
  }
}

export async function logoutSuperAdmin(): Promise<Result<{ success: true }>> {
  try {
    await removeSuperAdminCookie();
    return Result.ok({ success: true });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to sign out.");
  }
}

export async function getCurrentSuperAdmin(): Promise<SuperAdminSession | null> {
  try {
    return await getSuperAdminSession();
  } catch {
    return null;
  }
}

export async function getPlatformMobileServerConfig(): Promise<
  Result<PlatformMobileServerConfig>
> {
  try {
    await requireSuperAdmin();
    const config = await getPlatformMobileConfig();
    return Result.ok(config);
  } catch (error: any) {
    return Result.fail(
      error?.message || "Failed to load mobile server URL configuration.",
    );
  }
}

export async function updatePlatformMobileServerUrl(
  serverUrl: string,
): Promise<Result<PlatformMobileServerConfig>> {
  try {
    const session = await requireSuperAdmin();
    const updated = await setPlatformMobileServerUrl(serverUrl, session.id);
    revalidatePath("/super-admin");
    revalidatePath("/super-admin/tenants");
    return Result.ok(updated);
  } catch (error: any) {
    return Result.fail(
      error?.message || "Failed to update mobile server URL configuration.",
    );
  }
}

async function fetchTenantAggregateRows(): Promise<TenantSummaryItem[]> {
  const tenants = await db("tenants as t")
    .leftJoin("users as owner", "t.owner_user_id", "owner.id")
    .select(
      "t.id",
      "t.name",
      "t.slug",
      "t.status",
      "t.owner_user_id",
      "t.created_at",
      "t.updated_at",
      "owner.username as owner_username",
      "owner.email as owner_email",
      "owner.firstname as owner_firstname",
      "owner.lastname as owner_lastname",
    )
    .orderBy("t.created_at", "asc");

  const [userAggRows, productAggRows, salesAggRows, sessionAggRows, settingsRows] =
    await Promise.all([
      db("users")
        .select("tenant_id")
        .count("id as member_count")
        .sum({ admin_count: db.raw("CASE WHEN role = 'admin' THEN 1 ELSE 0 END") })
        .max("last_login_at as max_last_login")
        .groupBy("tenant_id")
        .catch(() => []),
      db("products")
        .select("tenant_id")
        .count("id as product_count")
        .groupBy("tenant_id")
        .catch(() => []),
      db("sales")
        .select("tenant_id")
        .count("id as sales_count")
        .sum({
          sales_revenue: db.raw(
            "CASE WHEN status = 'completed' THEN COALESCE(total_amount, 0) ELSE 0 END",
          ),
        })
        .max("created_at as max_sale_at")
        .groupBy("tenant_id")
        .catch(() => []),
      db("user_sessions")
        .where("is_active", 1)
        .select("tenant_id")
        .count("id as active_session_count")
        .groupBy("tenant_id")
        .catch(() => []),
      db("settings")
        .select("tenant_id", "currency", "business_name")
        .catch(() => []),
    ]);

  const userMap = new Map<
    string,
    { memberCount: number; adminCount: number; maxLogin: string | null }
  >();
  for (const r of userAggRows as any[]) {
    userMap.set(String(r.tenant_id), {
      memberCount: Number(r.member_count ?? 0),
      adminCount: Number(r.admin_count ?? 0),
      maxLogin: r.max_last_login ? String(r.max_last_login) : null,
    });
  }

  const productMap = new Map<string, number>();
  for (const r of productAggRows as any[]) {
    productMap.set(String(r.tenant_id), Number(r.product_count ?? 0));
  }

  const salesMap = new Map<
    string,
    { count: number; revenue: number; maxSaleAt: string | null }
  >();
  for (const r of salesAggRows as any[]) {
    salesMap.set(String(r.tenant_id), {
      count: Number(r.sales_count ?? 0),
      revenue: Number(r.sales_revenue ?? 0),
      maxSaleAt: r.max_sale_at ? String(r.max_sale_at) : null,
    });
  }

  const sessionMap = new Map<string, number>();
  for (const r of sessionAggRows as any[]) {
    sessionMap.set(String(r.tenant_id), Number(r.active_session_count ?? 0));
  }

  const currencyMap = new Map<string, string>();
  for (const s of settingsRows as any[]) {
    const tid = String(s.tenant_id);
    if (!currencyMap.has(tid) && s.currency) {
      currencyMap.set(tid, String(s.currency));
    }
  }

  return tenants.map((t: any) => {
    const id = String(t.id);
    const u = userMap.get(id) ?? {
      memberCount: 0,
      adminCount: 0,
      maxLogin: null,
    };
    const s = salesMap.get(id) ?? { count: 0, revenue: 0, maxSaleAt: null };
    const candidates = [u.maxLogin, s.maxSaleAt, t.updated_at, t.created_at]
      .filter(Boolean)
      .map((d) => new Date(String(d)).getTime())
      .filter((ms) => !Number.isNaN(ms));
    const lastActivityAt =
      candidates.length > 0 ? new Date(Math.max(...candidates)).toISOString() : null;

    const ownerFullname = `${t.owner_firstname || ""} ${t.owner_lastname || ""}`.trim();

    return {
      id,
      name: String(t.name || "Untitled Business"),
      slug: String(t.slug || id),
      status: t.status === "suspended" ? "suspended" : "active",
      currency: currencyMap.get(id) || "GHS",
      ownerUserId: t.owner_user_id ? String(t.owner_user_id) : null,
      ownerUsername: String(t.owner_username || "—"),
      ownerEmail: String(t.owner_email || "—"),
      ownerFullname: ownerFullname || String(t.owner_username || "—"),
      memberCount: u.memberCount,
      adminCount: u.adminCount,
      productCount: productMap.get(id) ?? 0,
      salesCount: s.count,
      salesRevenue: s.revenue,
      activeSessionCount: sessionMap.get(id) ?? 0,
      lastActivityAt,
      createdAt: String(t.created_at || new Date().toISOString()),
      updatedAt: String(t.updated_at || t.created_at || new Date().toISOString()),
      isDefaultTenant: id === DEFAULT_TENANT_ID,
    };
  });
}

function parseTenantCreatedDate(raw: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const normalized =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(trimmed) &&
    !trimmed.includes("T")
      ? `${trimmed.replace(" ", "T")}Z`
      : trimmed;
  const dt = new Date(normalized);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function buildTenantGrowthSeries(
  tenants: TenantSummaryItem[],
  now: Date = new Date(),
): TenantGrowthPoint[] {
  const months: {
    monthKey: string;
    monthLabel: string;
    shortMonth: string;
    endTimeMs: number;
  }[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1, 0, 0, 0, 0),
    );
    const endOfMonth = new Date(
      Date.UTC(
        startOfMonth.getUTCFullYear(),
        startOfMonth.getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );
    const yyyy = startOfMonth.getUTCFullYear();
    const mm = String(startOfMonth.getUTCMonth() + 1).padStart(2, "0");
    months.push({
      monthKey: `${yyyy}-${mm}`,
      monthLabel: startOfMonth.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      shortMonth: startOfMonth.toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      endTimeMs: endOfMonth.getTime(),
    });
  }

  const countsByMonth = new Map<string, number>();
  const parsedDates: number[] = [];

  for (const tenant of tenants) {
    const dt = parseTenantCreatedDate(tenant.createdAt);
    if (!dt) continue;
    parsedDates.push(dt.getTime());
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    countsByMonth.set(key, (countsByMonth.get(key) ?? 0) + 1);
  }

  return months.map((m) => {
    const cumulativeTenants = parsedDates.filter(
      (ms) => ms <= m.endTimeMs,
    ).length;
    return {
      monthKey: m.monthKey,
      monthLabel: m.monthLabel,
      shortMonth: m.shortMonth,
      newTenants: countsByMonth.get(m.monthKey) ?? 0,
      cumulativeTenants,
    };
  });
}

export async function getSuperAdminOverviewAndTenants(): Promise<
  Result<{
    metrics: SuperAdminOverviewMetrics;
    tenants: TenantSummaryItem[];
    growthSeries: TenantGrowthPoint[];
    platformConfig: PlatformMobileServerConfig;
  }>
> {
  try {
    await requireSuperAdmin();
    const [tenants, platformConfig] = await Promise.all([
      fetchTenantAggregateRows(),
      getPlatformMobileConfig(),
    ]);

    const metrics: SuperAdminOverviewMetrics = {
      totalTenants: tenants.length,
      activeTenants: tenants.filter((t) => t.status === "active").length,
      suspendedTenants: tenants.filter((t) => t.status === "suspended").length,
      totalMembers: tenants.reduce((sum, t) => sum + t.memberCount, 0),
      totalProducts: tenants.reduce((sum, t) => sum + t.productCount, 0),
      totalSalesRevenue: tenants.reduce((sum, t) => sum + t.salesRevenue, 0),
    };

    const growthSeries = buildTenantGrowthSeries(tenants);

    return Result.ok({ metrics, tenants, growthSeries, platformConfig });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to load tenant overview.");
  }
}

export async function createTenantBySuperAdmin(input: {
  businessName: string;
  slug?: string;
  currency?: string;
  businessAddress?: string;
  ownerUsername: string;
  ownerEmail: string;
  ownerFirstname?: string;
  ownerLastname?: string;
  ownerPhonenumber?: string;
  ownerPassword: string;
}): Promise<Result<{ tenantId: string; slug: string }>> {
  try {
    await requireSuperAdmin();

    const { tenant } = await registerWorkspaceAccount({
      storeName: input.businessName,
      slug: input.slug,
      username: input.ownerUsername,
      email: input.ownerEmail,
      password: input.ownerPassword,
      firstname: input.ownerFirstname,
      lastname: input.ownerLastname,
      phonenumber: input.ownerPhonenumber,
      businessAddress: input.businessAddress,
      currency: input.currency || "GHS",
    });

    revalidatePath("/super-admin");
    revalidatePath("/super-admin/tenants");

    return Result.ok({ tenantId: tenant.id, slug: tenant.slug });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to create business tenant.");
  }
}

export async function updateTenantBySuperAdmin(input: {
  tenantId: string;
  name?: string;
  slug?: string;
  currency?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  status?: "active" | "suspended";
}): Promise<Result<{ success: true }>> {
  try {
    await requireSuperAdmin();

    const existing = await db("tenants").where("id", input.tenantId).first();
    if (!existing) {
      return Result.fail("Tenant not found.");
    }

    const nowIso = new Date().toISOString();
    const tenantUpdates: Record<string, any> = { updated_at: nowIso };

    if (input.name !== undefined) {
      const cleanName = input.name.trim();
      if (cleanName.length < 2) {
        return Result.fail("Business name must be at least 2 characters.");
      }
      tenantUpdates.name = cleanName;
    }

    if (input.slug !== undefined) {
      const nextSlug = normalizeSlug(input.slug);
      const conflict = await db("tenants")
        .where("slug", nextSlug)
        .whereNot("id", input.tenantId)
        .first("id");
      if (conflict) {
        return Result.fail(`Workspace code "${nextSlug}" is already in use.`);
      }
      tenantUpdates.slug = nextSlug;
    }

    if (input.status !== undefined) {
      if (input.status !== "active" && input.status !== "suspended") {
        return Result.fail("Invalid tenant status.");
      }
      tenantUpdates.status = input.status;
    }

    const trx = await db.transaction();
    try {
      await trx("tenants").where("id", input.tenantId).update(tenantUpdates);

      const settingsUpdates: Record<string, any> = {};
      if (tenantUpdates.name) settingsUpdates.business_name = tenantUpdates.name;
      if (input.currency !== undefined && input.currency.trim()) {
        settingsUpdates.currency = input.currency.trim().toUpperCase();
      }
      if (input.businessAddress !== undefined) {
        settingsUpdates.business_address = input.businessAddress.trim();
      }
      if (input.businessPhone !== undefined) {
        settingsUpdates.business_phone = input.businessPhone.trim();
      }
      if (input.businessEmail !== undefined) {
        settingsUpdates.business_email = input.businessEmail.trim();
      }

      if (Object.keys(settingsUpdates).length > 0) {
        settingsUpdates.updated_at = nowIso;
        await trx("settings")
          .where("tenant_id", input.tenantId)
          .update(settingsUpdates);
      }

      if (input.status === "suspended") {
        await trx("user_sessions")
          .where("tenant_id", input.tenantId)
          .update({ is_active: 0 });
      }

      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    if (tenantUpdates.status !== "suspended") {
      await emitSyncEvent({
        tenantId: input.tenantId,
        entityType: "settings",
        entityId: input.tenantId,
        action: "upsert",
      }).catch(() => {});
    }

    revalidatePath("/super-admin");
    revalidatePath("/super-admin/tenants");
    revalidatePath(`/super-admin/tenants/${input.tenantId}`);

    return Result.ok({ success: true });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to update tenant.");
  }
}

const TENANT_DELETE_ORDER = [
  "sale_items",
  "order_items",
  "supplier_transaction_items",
  "sales",
  "orders",
  "supplier_transactions",
  "inventory",
  "products",
  "product_categories",
  "customers",
  "suppliers",
  "two_factor_codes",
  "user_sessions",
  "notifications",
  "broadcast_messages",
  "audit_logs",
  "activity_logs",
  "daily_sales_reports",
  "eod_dispatch_locks",
  "api_settings",
  "settings",
  "sync_events",
  "idempotency_keys",
  "users",
] as const;

export async function deleteTenantBySuperAdmin(
  tenantId: string,
): Promise<Result<{ success: true }>> {
  try {
    await requireSuperAdmin();

    if (tenantId === DEFAULT_TENANT_ID) {
      return Result.fail("The primary system workspace cannot be deleted.");
    }

    const existing = await db("tenants").where("id", tenantId).first();
    if (!existing) {
      return Result.fail("Tenant not found.");
    }

    const trx = await db.transaction();
    try {
      for (const tableName of TENANT_DELETE_ORDER) {
        const hasTbl = await trx.schema.hasTable(tableName);
        if (!hasTbl) continue;
        const hasTenantCol = await trx.schema.hasColumn(tableName, "tenant_id");
        if (!hasTenantCol) continue;
        await trx(tableName).where("tenant_id", tenantId).del();
      }
      await trx("tenants").where("id", tenantId).del();
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    revalidatePath("/super-admin");
    revalidatePath("/super-admin/tenants");

    return Result.ok({ success: true });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to delete tenant.");
  }
}

export async function getTenantMembersBySuperAdmin(
  tenantId: string,
): Promise<Result<TenantDetailData>> {
  try {
    await requireSuperAdmin();

    const summaries = await fetchTenantAggregateRows();
    const summary = summaries.find((t) => t.id === tenantId);
    if (!summary) {
      return Result.fail("Tenant workspace not found.");
    }

    const settingsRow = await db("settings")
      .where("tenant_id", tenantId)
      .select("business_address", "business_phone", "business_email")
      .first()
      .catch(() => null);

    const userRows = await db("users")
      .select(
        "id",
        "tenant_id",
        "username",
        "email",
        "firstname",
        "lastname",
        "phonenumber",
        "role",
        "two_factor_enabled",
        "two_factor_method",
        "failed_login_attempts",
        "locked_until",
        "last_login_at",
        "created_at",
        "updated_at",
      )
      .where("tenant_id", tenantId)
      .orderByRaw("CASE WHEN role = 'admin' THEN 0 ELSE 1 END")
      .orderBy("created_at", "asc");

    const sessionCounts = await db("user_sessions")
      .where({ tenant_id: tenantId, is_active: 1 })
      .select("user_id")
      .count("id as cnt")
      .groupBy("user_id")
      .catch(() => []);

    const sessionMap = new Map<string, number>();
    for (const s of sessionCounts as any[]) {
      sessionMap.set(String(s.user_id), Number(s.cnt ?? 0));
    }

    const members: TenantMemberItem[] = userRows.map((u: any) => {
      const firstname = String(u.firstname || "").trim();
      const lastname = String(u.lastname || "").trim();
      const fullname =
        `${firstname} ${lastname}`.trim() || String(u.username || "");
      return {
        id: String(u.id),
        tenantId: String(u.tenant_id),
        username: String(u.username || ""),
        email: String(u.email || ""),
        firstname,
        lastname,
        fullname,
        phonenumber: String(u.phonenumber || ""),
        role: u.role === "admin" ? "admin" : "member",
        twoFactorEnabled: Boolean(Number(u.two_factor_enabled ?? 0)),
        twoFactorMethod: u.two_factor_method === "sms" ? "sms" : "email",
        failedLoginAttempts: Number(u.failed_login_attempts ?? 0),
        lockedUntil: u.locked_until ? String(u.locked_until) : null,
        activeSessionsCount: sessionMap.get(String(u.id)) ?? 0,
        lastLoginAt: u.last_login_at ? String(u.last_login_at) : null,
        createdAt: String(u.created_at || new Date().toISOString()),
        updatedAt: String(u.updated_at || u.created_at || new Date().toISOString()),
        isTenantOwner: summary.ownerUserId === String(u.id),
      };
    });

    return Result.ok({
      tenant: {
        ...summary,
        businessAddress: String(settingsRow?.business_address || ""),
        businessPhone: String(settingsRow?.business_phone || ""),
        businessEmail: String(settingsRow?.business_email || ""),
      },
      members,
    });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to load tenant members.");
  }
}

export async function createTenantMemberBySuperAdmin(input: {
  tenantId: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  phonenumber?: string;
  password: string;
  role: "admin" | "member";
  twoFactorEnabled?: boolean;
  twoFactorMethod?: "email" | "sms";
}): Promise<Result<{ id: string }>> {
  try {
    await requireSuperAdmin();

    const tenant = await db("tenants").where("id", input.tenantId).first();
    if (!tenant) {
      return Result.fail("Target tenant does not exist.");
    }

    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();
    const firstname = input.firstname.trim();
    const lastname = input.lastname.trim();
    const phonenumber = input.phonenumber?.trim() || "";
    const password = input.password;

    if (!username || !email || !firstname || !lastname || !password) {
      return Result.fail(
        "Username, email, first name, last name, and password are required.",
      );
    }
    if (password.length < 6) {
      return Result.fail("Password must be at least 6 characters long.");
    }

    const twoFactorEnabled = Boolean(input.twoFactorEnabled);
    const twoFactorMethod = input.twoFactorMethod === "sms" ? "sms" : "email";
    if (twoFactorEnabled && twoFactorMethod === "sms" && !phonenumber) {
      return Result.fail(
        "A phone number is required when enabling SMS two-factor authentication.",
      );
    }

    const existing = await db("users")
      .where((qb) => {
        qb.where((inner) => {
          inner
            .where("tenant_id", input.tenantId)
            .whereRaw("LOWER(username) = ?", [username.toLowerCase()]);
        }).orWhereRaw("LOWER(email) = ?", [email]);
      })
      .first("id", "email");

    if (existing) {
      return Result.fail(
        String(existing.email || "").toLowerCase() === email
          ? "An account with this email already exists."
          : "This username is already taken inside this tenant.",
      );
    }

    const memberId = generateId();
    const passwordHash = await hashPassword(password);
    const nowIso = new Date().toISOString();

    await db("users").insert({
      id: memberId,
      tenant_id: input.tenantId,
      username,
      email,
      firstname,
      lastname,
      phonenumber: phonenumber || null,
      role: input.role,
      password_hash: passwordHash,
      two_factor_enabled: twoFactorEnabled ? 1 : 0,
      two_factor_method: twoFactorMethod,
      two_factor_updated_at: twoFactorEnabled ? nowIso : null,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const hasSettings = await db("settings")
      .where("tenant_id", input.tenantId)
      .first("id");
    if (!hasSettings) {
      await db("settings")
        .insert(
          buildDefaultSettingsRow({
            userId: memberId,
            tenantId: input.tenantId,
            businessName: String(tenant.name || "Inventory Pro"),
          }),
        )
        .catch(() => {});
    }

    await emitSyncEvent({
      tenantId: input.tenantId,
      entityType: "employee",
      entityId: memberId,
      action: "upsert",
    }).catch(() => {});

    revalidatePath("/super-admin");
    revalidatePath("/super-admin/tenants");
    revalidatePath(`/super-admin/tenants/${input.tenantId}`);

    return Result.ok({ id: memberId });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to add tenant member.");
  }
}

export async function updateTenantMemberBySuperAdmin(input: {
  tenantId: string;
  userId: string;
  username?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  phonenumber?: string;
  role?: "admin" | "member";
  twoFactorEnabled?: boolean;
  twoFactorMethod?: "email" | "sms";
  unlockAccount?: boolean;
}): Promise<Result<{ success: true }>> {
  try {
    await requireSuperAdmin();

    const target = await db("users")
      .where({ id: input.userId, tenant_id: input.tenantId })
      .first();
    if (!target) {
      return Result.fail("Member not found in this tenant.");
    }

    const updates: Record<string, any> = {};
    const nowIso = new Date().toISOString();

    if (input.username !== undefined) {
      const nextUsername = input.username.trim();
      if (!nextUsername) {
        return Result.fail("Username cannot be empty.");
      }
      const dup = await db("users")
        .where("tenant_id", input.tenantId)
        .whereRaw("LOWER(username) = ?", [nextUsername.toLowerCase()])
        .whereNot("id", input.userId)
        .first("id");
      if (dup) {
        return Result.fail("Username already exists in this tenant.");
      }
      updates.username = nextUsername;
    }

    if (input.email !== undefined) {
      const nextEmail = input.email.trim().toLowerCase();
      if (!nextEmail) {
        return Result.fail("Email cannot be empty.");
      }
      const dup = await db("users")
        .whereRaw("LOWER(email) = ?", [nextEmail])
        .whereNot("id", input.userId)
        .first("id");
      if (dup) {
        return Result.fail("Email address is already registered.");
      }
      updates.email = nextEmail;
    }

    if (input.firstname !== undefined) updates.firstname = input.firstname.trim();
    if (input.lastname !== undefined) updates.lastname = input.lastname.trim();
    if (input.phonenumber !== undefined) {
      updates.phonenumber = input.phonenumber.trim() || null;
    }

    if (input.role !== undefined && input.role !== target.role) {
      if (target.role === "admin" && input.role === "member") {
        const adminCountRow = await db("users")
          .where({ tenant_id: input.tenantId, role: "admin" })
          .count("id as cnt")
          .first();
        if (Number(adminCountRow?.cnt ?? 0) <= 1) {
          return Result.fail(
            "Cannot demote the only administrator of this business tenant.",
          );
        }
      }
      updates.role = input.role;
    }

    const nextMethod =
      input.twoFactorMethod ??
      (target.two_factor_method === "sms" ? "sms" : "email");
    const nextEmailVal = updates.email ?? target.email;
    const nextPhoneVal =
      updates.phonenumber !== undefined ? updates.phonenumber : target.phonenumber;

    if (input.twoFactorEnabled !== undefined) {
      if (input.twoFactorEnabled) {
        if (nextMethod === "email" && !String(nextEmailVal || "").trim()) {
          return Result.fail("Email address is required for Email 2FA.");
        }
        if (nextMethod === "sms" && !String(nextPhoneVal || "").trim()) {
          return Result.fail("Phone number is required for SMS 2FA.");
        }
      }
      updates.two_factor_enabled = input.twoFactorEnabled ? 1 : 0;
      updates.two_factor_method = nextMethod;
      updates.two_factor_updated_at = nowIso;
    } else if (input.twoFactorMethod !== undefined) {
      if (
        Boolean(target.two_factor_enabled) &&
        nextMethod === "sms" &&
        !String(nextPhoneVal || "").trim()
      ) {
        return Result.fail("Phone number is required for SMS 2FA.");
      }
      updates.two_factor_method = nextMethod;
      updates.two_factor_updated_at = nowIso;
    }

    if (input.unlockAccount) {
      updates.failed_login_attempts = 0;
      updates.locked_until = null;
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = nowIso;
      await db("users")
        .where({ id: input.userId, tenant_id: input.tenantId })
        .update(updates);
    }

    if (input.twoFactorEnabled === false) {
      await db("two_factor_codes")
        .where({ user_id: input.userId, tenant_id: input.tenantId })
        .whereNull("consumed_at")
        .update({ consumed_at: nowIso })
        .catch(() => {});
    }

    await emitSyncEvent({
      tenantId: input.tenantId,
      entityType: "employee",
      entityId: input.userId,
      action: "upsert",
    }).catch(() => {});

    revalidatePath("/super-admin");
    revalidatePath(`/super-admin/tenants/${input.tenantId}`);

    return Result.ok({ success: true });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to update tenant member.");
  }
}

export async function resetTenantMemberPasswordBySuperAdmin(input: {
  tenantId: string;
  userId: string;
  newPassword: string;
}): Promise<Result<{ success: true }>> {
  try {
    await requireSuperAdmin();

    if (!input.newPassword || input.newPassword.length < 6) {
      return Result.fail("New password must be at least 6 characters long.");
    }

    const target = await db("users")
      .where({ id: input.userId, tenant_id: input.tenantId })
      .first("id");
    if (!target) {
      return Result.fail("Member not found in this tenant.");
    }

    const pwdHash = await hashPassword(input.newPassword);
    const nowIso = new Date().toISOString();

    await db("users")
      .where({ id: input.userId, tenant_id: input.tenantId })
      .update({
        password_hash: pwdHash,
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: nowIso,
      });

    await db("user_sessions")
      .where({ user_id: input.userId, tenant_id: input.tenantId })
      .update({ is_active: 0 })
      .catch(() => {});

    revalidatePath(`/super-admin/tenants/${input.tenantId}`);

    return Result.ok({ success: true });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to reset member password.");
  }
}

export async function revokeTenantMemberSessionsBySuperAdmin(input: {
  tenantId: string;
  userId: string;
}): Promise<Result<{ revokedCount: number }>> {
  try {
    await requireSuperAdmin();

    const target = await db("users")
      .where({ id: input.userId, tenant_id: input.tenantId })
      .first("id");
    if (!target) {
      return Result.fail("Member not found in this tenant.");
    }

    const revokedCount = await db("user_sessions")
      .where({ user_id: input.userId, tenant_id: input.tenantId, is_active: 1 })
      .update({ is_active: 0 });

    revalidatePath("/super-admin");
    revalidatePath(`/super-admin/tenants/${input.tenantId}`);

    return Result.ok({ revokedCount: Number(revokedCount ?? 0) });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to revoke member sessions.");
  }
}

const USER_OWNED_TABLES = [
  "products",
  "product_categories",
  "customers",
  "suppliers",
  "sales",
  "orders",
  "inventory",
  "supplier_transactions",
  "settings",
  "notifications",
  "audit_logs",
  "activity_logs",
] as const;

export async function deleteTenantMemberBySuperAdmin(input: {
  tenantId: string;
  userId: string;
}): Promise<Result<{ success: true }>> {
  try {
    await requireSuperAdmin();

    const target = await db("users")
      .where({ id: input.userId, tenant_id: input.tenantId })
      .first();
    if (!target) {
      return Result.fail("Member not found in this tenant.");
    }

    const remainingAdmins = await db("users")
      .where({ tenant_id: input.tenantId, role: "admin" })
      .whereNot("id", input.userId)
      .orderBy("created_at", "asc")
      .select("id");

    if (target.role === "admin" && remainingAdmins.length === 0) {
      return Result.fail(
        "Cannot remove the sole administrator of a tenant. Promote another member to Admin or delete the tenant instead.",
      );
    }

    const fallbackUser =
      remainingAdmins[0] ??
      (await db("users")
        .where({ tenant_id: input.tenantId })
        .whereNot("id", input.userId)
        .orderBy("created_at", "asc")
        .first("id"));

    if (!fallbackUser) {
      return Result.fail(
        "Cannot remove the last remaining user of a tenant. Delete the tenant instead.",
      );
    }

    const trx = await db.transaction();
    try {
      const tenant = await trx("tenants")
        .where("id", input.tenantId)
        .first("owner_user_id");
      if (tenant?.owner_user_id === input.userId) {
        await trx("tenants")
          .where("id", input.tenantId)
          .update({
            owner_user_id: String(fallbackUser.id),
            updated_at: new Date().toISOString(),
          });
      }

      for (const tableName of USER_OWNED_TABLES) {
        const hasTbl = await trx.schema.hasTable(tableName);
        if (!hasTbl) continue;
        const hasUserCol = await trx.schema.hasColumn(tableName, "user_id");
        if (!hasUserCol) continue;
        await trx(tableName)
          .where({ tenant_id: input.tenantId, user_id: input.userId })
          .update({ user_id: String(fallbackUser.id) });
      }

      const hasBroadcasts = await trx.schema.hasTable("broadcast_messages");
      if (hasBroadcasts) {
        await trx("broadcast_messages")
          .where({ tenant_id: input.tenantId, sender_id: input.userId })
          .update({ sender_id: String(fallbackUser.id) })
          .catch(() => {});
      }

      await trx("two_factor_codes")
        .where({ user_id: input.userId, tenant_id: input.tenantId })
        .del()
        .catch(() => {});

      await trx("user_sessions")
        .where({ user_id: input.userId, tenant_id: input.tenantId })
        .del()
        .catch(() => {});

      await trx("users")
        .where({ id: input.userId, tenant_id: input.tenantId })
        .del();

      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    await emitSyncEvent({
      tenantId: input.tenantId,
      entityType: "employee",
      entityId: input.userId,
      action: "delete",
    }).catch(() => {});

    revalidatePath("/super-admin");
    revalidatePath("/super-admin/tenants");
    revalidatePath(`/super-admin/tenants/${input.tenantId}`);

    return Result.ok({ success: true });
  } catch (error: any) {
    return Result.fail(error?.message || "Failed to remove tenant member.");
  }
}
