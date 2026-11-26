import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import db from "@/db/knex";
import { GET as getAppHealth } from "@/app/api/health/route";
import { GET as getMobileHealth } from "@/app/api/mobile/v1/health/route";
import {
  getProductionOpsSnapshot,
  isPrivateOrLoopbackHost,
  revokeBoundPushDevice,
  sanitizeDatabaseTargetLabel,
} from "@/lib/ops";
import { ensureAuthSchema } from "@/lib/auth";
import { registerMobilePushToken } from "@/lib/pushNotifications";
import { DEFAULT_TENANT_ID, ensureMultiTenantSchema } from "@/lib/tenant";

describe("Production Ops & Cloud Account Binding", () => {
  beforeAll(async () => {
    await ensureAuthSchema();
    await ensureMultiTenantSchema();
  });

  it("returns database-aware readiness from /api/health and /api/mobile/v1/health", async () => {
    const appRes = await getAppHealth();
    expect(appRes.status).toBe(200);
    const appJson = await appRes.json();
    expect(appJson.ok).toBe(true);
    expect(appJson.status).toBe("healthy");
    expect(appJson.db?.connected).toBe(true);
    expect(typeof appJson.db?.latencyMs).toBe("number");

    const mobileRes = await getMobileHealth();
    expect(mobileRes.status).toBe(200);
    const mobileJson = await mobileRes.json();
    expect(mobileJson.ok).toBe(true);
    expect(mobileJson.dbOk).toBe(true);
  });

  it("collects ops snapshot with masked push tokens, secret audit metadata, and revokes bound devices", async () => {
    const adminUser = await db("users")
      .where({ tenant_id: DEFAULT_TENANT_ID })
      .first("id");
    expect(adminUser?.id).toBeTruthy();

    const registered = await registerMobilePushToken({
      tenantId: DEFAULT_TENANT_ID,
      userId: String(adminUser.id),
      token: "ExponentPushToken[ops_test_device_token_987654]",
      platform: "android",
      deviceName: "Ops Counter Tablet",
    });

    const snapshot = await getProductionOpsSnapshot();
    expect(snapshot.database.connected).toBe(true);
    expect(snapshot.mobileCloud.androidPackage).toBe("com.frebbytech.inventorypro");
    expect(snapshot.envAudit.some((e) => e.key === "JWT_SECRET")).toBe(true);
    expect(snapshot.envAudit.some((e) => e.key === "CRON_SECRET")).toBe(true);

    // Ensure sensitive tokens are masked in snapshot output
    const found = snapshot.deviceStats.devices.find(
      (d) => d.id === registered.id,
    );
    expect(found).toBeDefined();
    expect(found?.isActive).toBe(true);
    expect(found?.maskedToken).toContain("••••987654");
    expect(found?.maskedToken).not.toContain("ops_test_device_token");

    // Verify Super Admin revocation deactivates the bound push token
    const revoked = await revokeBoundPushDevice(registered.id);
    expect(revoked).toBe(true);

    const afterRevoke = await getProductionOpsSnapshot();
    const updated = afterRevoke.deviceStats.devices.find(
      (d) => d.id === registered.id,
    );
    expect(updated?.isActive).toBe(false);
  });

  it("sanitizes database target labels and blocks SSRF loopback/private hosts", () => {
    const prevUrl = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL =
        "libsql://inventory-prod.turso.io?authToken=super-secret-token";
      const sanitized = sanitizeDatabaseTargetLabel();
      expect(sanitized.driver).toBe("turso_remote");
      expect(sanitized.targetLabel).toBe("libsql://inventory-prod.turso.io");
      expect(sanitized.targetLabel).not.toContain("super-secret-token");
    } finally {
      if (prevUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevUrl;
    }

    expect(isPrivateOrLoopbackHost("127.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackHost("localhost")).toBe(true);
    expect(isPrivateOrLoopbackHost("169.254.169.254")).toBe(true);
    expect(isPrivateOrLoopbackHost("10.0.0.5")).toBe(true);
    expect(isPrivateOrLoopbackHost("192.168.1.25")).toBe(true);
    expect(isPrivateOrLoopbackHost("api.inventorypro.example.com")).toBe(false);
  });

  it("enforces least-privilege GitHub workflow lockdown and verifies EAS environment config", () => {
    const root = process.cwd();
    const ciYml = fs.readFileSync(
      path.join(root, ".github/workflows/ci.yml"),
      "utf8",
    );
    const cronYml = fs.readFileSync(
      path.join(root, ".github/workflows/eod-report-cron.yml"),
      "utf8",
    );
    const releaseYml = fs.readFileSync(
      path.join(root, ".github/workflows/mobile-release.yml"),
      "utf8",
    );

    expect(ciYml).toContain("permissions:\n  contents: read");
    expect(cronYml).toContain("permissions: {}");
    expect(releaseYml).toContain("permissions:\n  contents: read");
    expect(releaseYml).toContain("environment: ${{ inputs.profile }}");
    expect(releaseYml).toContain("refs/heads/main");
    // Ensure workflow_dispatch inputs are never raw-interpolated inside shell run blocks
    expect(releaseYml).not.toMatch(/run:.*\$\{\{\s*inputs\./);

    const verifyOutput = execFileSync(
      "node",
      [path.join(root, "scripts/verify-eas-secrets.mjs")],
      { encoding: "utf8" },
    );
    expect(verifyOutput).toContain("Verification complete (0 errors).");
  });
});

