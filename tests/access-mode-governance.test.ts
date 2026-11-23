import { beforeAll, describe, expect, it } from "vitest";
import { loginUser } from "@/actions/_actions";
import {
  createTenantBySuperAdmin,
  getSuperAdminOverviewAndTenants,
  updateTenantBySuperAdmin,
} from "@/actions/super-admin";
import { POST as mobileLoginPost } from "@/app/api/mobile/v1/auth/login/route";
import db from "@/db/knex";
import {
  COOKIE_NAME,
  ensureAuthSchema,
  getAuthSession,
  getBearerAuthSession,
  getWebSessionRejectionReason,
  registerWorkspaceAccount,
} from "@/lib/auth";
import { ensureSecuritySchema } from "@/lib/security";
import {
  createSuperAdminJWT,
  ensureSuperAdminSchema,
  SUPER_ADMIN_COOKIE_NAME,
} from "@/lib/super-admin";
import { generateId } from "@/utils/generator";
import { clearTestCookieJar, getTestCookieJar } from "./setup";

async function authenticateAsRootSuperAdmin() {
  const admin = await db("super_admins").first("id", "username", "email");
  expect(admin).toBeTruthy();
  const token = await createSuperAdminJWT({
    superAdminId: String(admin.id),
    username: String(admin.username),
    email: String(admin.email),
  });
  getTestCookieJar().set(SUPER_ADMIN_COOKIE_NAME, token);
}

describe("Platform Access Mode Governance & Session Revocation", () => {
  beforeAll(async () => {
    await ensureAuthSchema();
    await ensureSecuritySchema();
    await ensureSuperAdminSchema();
  });

  it("blocks Mobile Only workspace from web login after password check, while permitting mobile login", async () => {
    const uniq = generateId("mobonly").slice(-8);
    const { tenant, user } = await registerWorkspaceAccount({
      storeName: `Mobile Store ${uniq}`,
      slug: `mobile-store-${uniq}`,
      username: `mobowner_${uniq}`,
      email: `mobowner_${uniq}@example.com`,
      password: "Password123!",
      accessMode: "mobile_only",
    });

    // Wrong password should NOT leak access mode restriction
    const wrongPwdRes = await loginUser({
      usernameOrEmail: user.email,
      password: "WrongPassword!",
    });
    expect(wrongPwdRes.success).toBe(false);
    expect(wrongPwdRes.message).toContain("Invalid username or password");

    // Valid password on web must be blocked cleanly
    const webRes = await loginUser({
      usernameOrEmail: user.email,
      password: "Password123!",
    });
    expect(webRes.success).toBe(false);
    expect(webRes.message).toContain("Mobile App access only");
    expect(getTestCookieJar().has(COOKIE_NAME)).toBe(false);

    // Mobile login must succeed with HTTP 200 and Bearer token
    const mobReq = new Request("http://localhost/api/mobile/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: user.email,
        password: "Password123!",
        workspaceSlug: tenant.slug,
      }),
    });
    const mobRes = await mobileLoginPost(mobReq);
    expect(mobRes.status).toBe(200);
    const mobJson = (await mobRes.json()) as {
      token?: string;
      user?: { tenantId?: string };
    };
    expect(mobJson.token).toBeTruthy();
    expect(mobJson.user?.tenantId).toBe(tenant.id);

    const sessionRow = await db("user_sessions")
      .where({ user_id: user.id, tenant_id: tenant.id, is_active: 1 })
      .first("device_type");
    expect(sessionRow?.device_type).toBe("mobile");
  });

  it("blocks Web Only workspace on mobile login with HTTP 403 while permitting web login", async () => {
    const uniq = generateId("webonly").slice(-8);
    const { tenant, user } = await registerWorkspaceAccount({
      storeName: `Web Store ${uniq}`,
      slug: `web-store-${uniq}`,
      username: `webowner_${uniq}`,
      email: `webowner_${uniq}@example.com`,
      password: "Password123!",
      accessMode: "web_only",
    });

    // Mobile login must return HTTP 403
    const mobReq = new Request("http://localhost/api/mobile/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: user.email,
        password: "Password123!",
        workspaceSlug: tenant.slug,
      }),
    });
    const mobRes = await mobileLoginPost(mobReq);
    expect(mobRes.status).toBe(403);
    const mobJson = (await mobRes.json()) as { error?: string };
    expect(mobJson.error).toContain("Web Only access");

    // Web login must succeed
    const webRes = await loginUser({
      usernameOrEmail: user.email,
      password: "Password123!",
    });
    expect(webRes.success).toBe(true);
    expect(getTestCookieJar().has(COOKIE_NAME)).toBe(true);
    const activeWebSession = await getAuthSession();
    expect(activeWebSession?.tenant_id).toBe(tenant.id);
  });

  it("immediately revokes active browser sessions when Super Admin switches a dual-access tenant to mobile_only", async () => {
    const uniq = generateId("revokeweb").slice(-8);
    await authenticateAsRootSuperAdmin();

    const created = await createTenantBySuperAdmin({
      businessName: `Dual Access ${uniq}`,
      slug: `dual-access-${uniq}`,
      ownerUsername: `dual_${uniq}`,
      ownerEmail: `dual_${uniq}@example.com`,
      ownerPassword: "Password123!",
      accessMode: "both",
    });
    expect(created.success).toBe(true);
    const tenantId = created.data!.tenantId;

    // Invalid access mode must fail server-side allowlist validation
    const invalidRes = await updateTenantBySuperAdmin({
      tenantId,
      accessMode: "desktop_only" as unknown as "both",
    });
    expect(invalidRes.success).toBe(false);

    // Sign in on BOTH web and mobile
    const webLogin = await loginUser({
      usernameOrEmail: `dual_${uniq}@example.com`,
      password: "Password123!",
    });
    expect(webLogin.success).toBe(true);
    const webToken = getTestCookieJar().get(COOKIE_NAME)!;
    expect(webToken).toBeTruthy();

    const mobRes = await mobileLoginPost(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: `dual_${uniq}@example.com`,
          password: "Password123!",
        }),
      }),
    );
    expect(mobRes.status).toBe(200);
    const { token: mobileToken } = (await mobRes.json()) as { token: string };

    // Confirm both sessions work initially
    expect((await getAuthSession())?.tenant_id).toBe(tenantId);
    const bearerBefore = await getBearerAuthSession(
      new Request("http://localhost/api/mobile/v1/products", {
        headers: { Authorization: `Bearer ${mobileToken}` },
      }),
    );
    expect(bearerBefore?.session.tenant_id).toBe(tenantId);

    // Super Admin switches tenant to mobile_only
    await authenticateAsRootSuperAdmin();
    const switchRes = await updateTenantBySuperAdmin({
      tenantId,
      accessMode: "mobile_only",
    });
    expect(switchRes.success).toBe(true);

    // Web session row is deactivated while mobile remains active
    const webRow = await db("user_sessions")
      .where({ tenant_id: tenantId, token: webToken })
      .first("is_active");
    const mobRow = await db("user_sessions")
      .where({ tenant_id: tenantId, token: mobileToken })
      .first("is_active");
    expect(Number(webRow?.is_active)).toBe(0);
    expect(Number(mobRow?.is_active)).toBe(1);

    // Web session guard immediately rejects & reports mobile_only reason; mobile stays authenticated
    expect(await getAuthSession()).toBeNull();
    expect(await getWebSessionRejectionReason()).toBe("mobile_only");

    const bearerAfter = await getBearerAuthSession(
      new Request("http://localhost/api/mobile/v1/products", {
        headers: { Authorization: `Bearer ${mobileToken}` },
      }),
    );
    expect(bearerAfter?.session.tenant_id).toBe(tenantId);

    // Super Admin overview metrics reflect breakdown accurately
    const overview = await getSuperAdminOverviewAndTenants();
    expect(overview.success).toBe(true);
    expect(overview.data!.metrics.mobileOnlyTenants).toBeGreaterThanOrEqual(1);
    const summary = overview.data!.tenants.find((t) => t.id === tenantId);
    expect(summary?.accessMode).toBe("mobile_only");
  });

  it("immediately revokes active mobile sessions when Super Admin switches a tenant to web_only", async () => {
    const uniq = generateId("revokemob").slice(-8);
    await authenticateAsRootSuperAdmin();

    const created = await createTenantBySuperAdmin({
      businessName: `Switch Web ${uniq}`,
      slug: `switch-web-${uniq}`,
      ownerUsername: `swweb_${uniq}`,
      ownerEmail: `swweb_${uniq}@example.com`,
      ownerPassword: "Password123!",
      accessMode: "both",
    });
    expect(created.success).toBe(true);
    const tenantId = created.data!.tenantId;

    // Sign in on mobile and web
    const mobRes = await mobileLoginPost(
      new Request("http://localhost/api/mobile/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: `swweb_${uniq}@example.com`,
          password: "Password123!",
        }),
      }),
    );
    const { token: mobileToken } = (await mobRes.json()) as { token: string };

    clearTestCookieJar();
    const webLogin = await loginUser({
      usernameOrEmail: `swweb_${uniq}@example.com`,
      password: "Password123!",
    });
    expect(webLogin.success).toBe(true);

    // Switch to web_only
    await authenticateAsRootSuperAdmin();
    const switchRes = await updateTenantBySuperAdmin({
      tenantId,
      accessMode: "web_only",
    });
    expect(switchRes.success).toBe(true);

    const mobRow = await db("user_sessions")
      .where({ tenant_id: tenantId, token: mobileToken })
      .first("is_active");
    expect(Number(mobRow?.is_active)).toBe(0);

    // Mobile Bearer token is now rejected, while web session remains valid
    const bearerAfter = await getBearerAuthSession(
      new Request("http://localhost/api/mobile/v1/products", {
        headers: { Authorization: `Bearer ${mobileToken}` },
      }),
    );
    expect(bearerAfter).toBeNull();
    expect((await getAuthSession())?.tenant_id).toBe(tenantId);
  });
});
