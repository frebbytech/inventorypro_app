import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import db from "@/db/knex";
import { applyMultiTenantSchema } from "@/lib/tenant-schema";
import {
  getFirebaseStorageConfig,
  type FirebaseStorageConfig,
} from "@/lib/firebase-storage";
import {
  ensureSuperAdminSchema,
  getPlatformMobileConfig,
} from "@/lib/super-admin";
import type { PlatformMobileServerConfig } from "@/types/super-admin";

export interface DatabaseProbeResult {
  connected: boolean;
  latencyMs: number;
  driver: "turso_remote" | "libsql_local" | "sqlite_local";
  targetLabel: string;
  error?: string;
}

export interface OpsEnvAuditItem {
  key: string;
  label: string;
  configured: boolean;
  severity: "critical" | "recommended" | "info";
  detail: string;
}

export interface BoundMobileDeviceItem {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  userId: string;
  username: string;
  platform: string;
  deviceName: string | null;
  maskedToken: string;
  isActive: boolean;
  lastSeenAt: string | null;
}

export interface EodRunItem {
  tenantId: string;
  tenantName: string;
  reportDate: string;
  status: string;
  claimedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
}

export interface ProductionOpsSnapshot {
  checkedAt: string;
  nodeEnv: string;
  database: DatabaseProbeResult;
  storage: {
    uploadsDirWritable: boolean;
    uploadsPath: string;
    error?: string;
    firebaseStorage: FirebaseStorageConfig;
  };
  envAudit: OpsEnvAuditItem[];
  mobileCloud: {
    platformConfig: PlatformMobileServerConfig;
    easProjectId: string | null;
    easOwner: string | null;
    expoAccessTokenConfigured: boolean;
    expoPushDisabled: boolean;
    iosBundleIdentifier: string;
    androidPackage: string;
    appSlug: string;
    otaUpdatesConfigured: boolean;
  };
  deviceStats: {
    activeTotal: number;
    inactiveTotal: number;
    androidActive: number;
    iosActive: number;
    devices: BoundMobileDeviceItem[];
  };
  eodRuns: EodRunItem[];
  platformTotals: {
    tenants: number;
    users: number;
    activeMobileSessions: number;
    activeWebSessions: number;
  };
}

const DEFAULT_DEV_JWT =
  "inventorypro_default_jwt_secret_key_2026_change_in_prod";
const DEFAULT_DEV_SUPER_PWD = "SuperAdmin123!";
const DEFAULT_DEV_ADMIN_PWD = "Admin123!";

export function sanitizeDatabaseTargetLabel(): {
  driver: "turso_remote" | "libsql_local" | "sqlite_local";
  targetLabel: string;
} {
  const raw = (
    process.env.DATABASE_URL ||
    process.env.TURSO_DATABASE_URL ||
    ""
  ).trim();

  if (!raw) {
    return {
      driver: "sqlite_local",
      targetLabel: process.env.VERCEL
        ? "/tmp/inventory_pro.db"
        : "./inventory_pro.db",
    };
  }

  if (/^(libsql|https?|wss?):\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return {
        driver: "turso_remote",
        targetLabel: `${parsed.protocol}//${parsed.host}${parsed.pathname}`,
      };
    } catch {
      return { driver: "turso_remote", targetLabel: "remote-libsql" };
    }
  }

  const stripped = raw.replace(/^file:/i, "");
  return {
    driver: "libsql_local",
    targetLabel: path.basename(stripped) || "local.db",
  };
}

export async function probeDatabaseHealth(): Promise<DatabaseProbeResult> {
  const { driver, targetLabel } = sanitizeDatabaseTargetLabel();
  const startedAt = Date.now();
  try {
    await db.raw("SELECT 1 AS ok");
    return {
      connected: true,
      latencyMs: Math.max(0, Date.now() - startedAt),
      driver,
      targetLabel,
    };
  } catch (err: unknown) {
    return {
      connected: false,
      latencyMs: Math.max(0, Date.now() - startedAt),
      driver,
      targetLabel,
      error: err instanceof Error ? err.message : "Database ping failed",
    };
  }
}

async function probeUploadsWritability(): Promise<{
  uploadsDirWritable: boolean;
  uploadsPath: string;
  error?: string;
}> {
  const uploadsPath = path.join(process.cwd(), "public", "images");
  try {
    await fsp.mkdir(uploadsPath, { recursive: true });
    await fsp.access(uploadsPath, fs.constants.W_OK);
    return {
      uploadsDirWritable: true,
      uploadsPath: "public/images",
    };
  } catch (err: unknown) {
    return {
      uploadsDirWritable: false,
      uploadsPath: "public/images",
      error:
        err instanceof Error
          ? err.message
          : "Upload directory is not writable",
    };
  }
}

function readMobileAppMetadata(): {
  appSlug: string;
  iosBundleIdentifier: string;
  androidPackage: string;
  easProjectId: string | null;
  easOwner: string | null;
  otaUpdatesConfigured: boolean;
} {
  let appJson: Record<string, any> = {};
  try {
    const appJsonPath = path.join(process.cwd(), "mobile", "app.json");
    if (fs.existsSync(appJsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
      appJson = (parsed?.expo as Record<string, any>) || {};
    }
  } catch {
    appJson = {};
  }

  const envProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || "";
  const fileProjectId =
    typeof appJson?.extra?.eas?.projectId === "string"
      ? appJson.extra.eas.projectId.trim()
      : "";
  const easProjectId = fileProjectId || envProjectId || null;

  const envOwner = process.env.EXPO_OWNER?.trim() || "";
  const fileOwner =
    typeof appJson?.owner === "string" ? appJson.owner.trim() : "";
  const easOwner = envOwner || fileOwner || null;

  const hasUpdatesUrl =
    Boolean(appJson?.updates?.url) || Boolean(easProjectId);

  return {
    appSlug: String(appJson?.slug || "inventory-pro"),
    iosBundleIdentifier: String(
      appJson?.ios?.bundleIdentifier || "com.frebbytech.inventorypro",
    ),
    androidPackage: String(
      appJson?.android?.package || "com.frebbytech.inventorypro",
    ),
    easProjectId,
    easOwner,
    otaUpdatesConfigured: hasUpdatesUrl,
  };
}

function maskPushToken(token: unknown): string {
  const str = String(token || "").trim();
  if (!str) return "—";
  const innerMatch = str.match(/^(Expo(?:nent)?PushToken\[)(.+)(\])$/);
  if (innerMatch) {
    const body = innerMatch[2];
    const tail = body.slice(-6);
    return `${innerMatch[1]}••••${tail}${innerMatch[3]}`;
  }
  return `••••${str.slice(-6)}`;
}

export async function getProductionOpsSnapshot(): Promise<ProductionOpsSnapshot> {
  await ensureSuperAdminSchema();
  await applyMultiTenantSchema(db);

  const [database, storageDisk, platformConfig] = await Promise.all([
    probeDatabaseHealth(),
    probeUploadsWritability(),
    getPlatformMobileConfig(),
  ]);

  const firebaseStorage = getFirebaseStorageConfig();
  const storage = {
    ...storageDisk,
    firebaseStorage,
  };
  const mobileMeta = readMobileAppMetadata();

  const jwtVal = process.env.JWT_SECRET?.trim() || "";
  const encryptionVal = process.env.ENCRYPTION_KEY?.trim() || "";
  const cronVal = process.env.CRON_SECRET?.trim() || "";
  const superPwdVal = process.env.SUPER_ADMIN_PASSWORD?.trim() || "";
  const initialAdminVal = process.env.INITIAL_ADMIN_PASSWORD?.trim() || "";
  const expoTokenConfigured = Boolean(process.env.EXPO_ACCESS_TOKEN?.trim());
  const pushDisabled = process.env.DISABLE_EXPO_PUSH === "true";

  const envAudit: OpsEnvAuditItem[] = [
    {
      key: "JWT_SECRET",
      label: "Session & Token Signing Key",
      configured: Boolean(jwtVal && jwtVal !== DEFAULT_DEV_JWT && jwtVal.length >= 24),
      severity: "critical",
      detail: !jwtVal
        ? "Unset — falling back to built-in development key."
        : jwtVal === DEFAULT_DEV_JWT
          ? "Using default placeholder key; rotate before public deployment."
          : jwtVal.length < 24
            ? "Key is shorter than 24 characters; use a stronger random secret."
            : "Dedicated strong signing secret active.",
    },
    {
      key: "ENCRYPTION_KEY",
      label: "API Credentials AES-256-GCM Key",
      configured: Boolean(encryptionVal),
      severity: "recommended",
      detail: encryptionVal
        ? "Explicit server encryption key configured."
        : "Unset — deriving encryption key from JWT_SECRET fallback.",
    },
    {
      key: "CRON_SECRET",
      label: "EOD Cron Endpoint Bearer Secret",
      configured: Boolean(cronVal),
      severity: "critical",
      detail: cronVal
        ? "Automated /api/cron/eod-report requests authenticated."
        : "Unset — scheduled EOD cron dispatches will return HTTP 500.",
    },
    {
      key: "SUPER_ADMIN_PASSWORD",
      label: "Super Admin Operator Credential",
      configured: Boolean(superPwdVal && superPwdVal !== DEFAULT_DEV_SUPER_PWD),
      severity: "critical",
      detail: !superPwdVal
        ? "Using default seed password; configure a private operator password."
        : superPwdVal === DEFAULT_DEV_SUPER_PWD
          ? "Matches default seed credential; change in production."
          : "Custom operator password configured via environment.",
    },
    {
      key: "INITIAL_ADMIN_PASSWORD",
      label: "Initial Tenant Admin Seed Password",
      configured: Boolean(
        initialAdminVal && initialAdminVal !== DEFAULT_DEV_ADMIN_PWD,
      ),
      severity: "info",
      detail: initialAdminVal
        ? "Custom initial bootstrap admin password configured."
        : "Default bootstrap password used only when provisioning brand-new database.",
    },
    {
      key: "EXPO_PUBLIC_EAS_PROJECT_ID",
      label: "Expo EAS Cloud Project Binding",
      configured: Boolean(mobileMeta.easProjectId),
      severity: "recommended",
      detail: mobileMeta.easProjectId
        ? `Bound to EAS project ${mobileMeta.easProjectId}.`
        : "Not bound yet — run `npm --prefix mobile run eas:init` or set EXPO_PUBLIC_EAS_PROJECT_ID.",
    },
    {
      key: "EXPO_ACCESS_TOKEN",
      label: "Expo Push API Access Token",
      configured: expoTokenConfigured,
      severity: "info",
      detail: expoTokenConfigured
        ? "Authenticated Expo Push dispatch token configured."
        : "Optional unless Enhanced Push Security is enabled on Expo dashboard.",
    },
    {
      key: "FIREBASE_STORAGE_BUCKET",
      label: "Firebase Storage Media Bucket",
      configured: firebaseStorage.configured,
      severity: "recommended",
      detail: firebaseStorage.configured
        ? `Bound to ${firebaseStorage.storageBucket} (${firebaseStorage.credentialMode.replace(/_/g, " ")}).`
        : "Unset — /api/upload falls back to local disk.",
    },
    {
      key: "FIREBASE_SERVICE_ACCOUNT_JSON",
      label: "Firebase Admin Service Account Credentials",
      configured:
        firebaseStorage.credentialMode === "service_account_json" ||
        firebaseStorage.credentialMode === "service_account_fields",
      severity: process.env.VERCEL ? "critical" : "info",
      detail:
        firebaseStorage.credentialMode === "service_account_json" ||
        firebaseStorage.credentialMode === "service_account_fields"
          ? "Explicit Firebase Admin service account credentials active."
          : "Using Application Default Credentials (set FIREBASE_SERVICE_ACCOUNT_JSON when deploying on Vercel).",
    },
  ];

  // Fetch bound mobile push devices & stats
  const [tokenRows, eodRows, tenantCountRow, userCountRow, sessionRows] =
    await Promise.all([
      db("mobile_push_tokens as mpt")
        .leftJoin("tenants as t", "mpt.tenant_id", "t.id")
        .leftJoin("users as u", "mpt.user_id", "u.id")
        .select(
          "mpt.id",
          "mpt.tenant_id",
          "t.name as tenant_name",
          "t.slug as tenant_slug",
          "mpt.user_id",
          "u.username as username",
          "mpt.platform",
          "mpt.device_name",
          "mpt.token",
          "mpt.is_active",
          "mpt.last_seen_at",
        )
        .orderBy("mpt.last_seen_at", "desc")
        .limit(50)
        .catch(() => []),
      db("eod_dispatch_locks as edl")
        .leftJoin("tenants as t", "edl.tenant_id", "t.id")
        .select(
          "edl.tenant_id",
          "t.name as tenant_name",
          "edl.report_date",
          "edl.status",
          "edl.claimed_at",
          "edl.completed_at",
          "edl.failed_at",
          "edl.error_message",
        )
        .orderBy("edl.claimed_at", "desc")
        .limit(10)
        .catch(() => []),
      db("tenants").count("id as count").first().catch(() => ({ count: 0 })),
      db("users").count("id as count").first().catch(() => ({ count: 0 })),
      db("user_sessions")
        .whereNull("revoked_at")
        .whereRaw("expires_at > CURRENT_TIMESTAMP")
        .select("client_type")
        .catch(() => []),
    ]);

  let activeTotal = 0;
  let inactiveTotal = 0;
  let androidActive = 0;
  let iosActive = 0;

  const devices: BoundMobileDeviceItem[] = (tokenRows as any[]).map((row) => {
    const active = Number(row.is_active) === 1 || row.is_active === true;
    const plat = String(row.platform || "web").toLowerCase();
    if (active) {
      activeTotal += 1;
      if (plat === "android") androidActive += 1;
      if (plat === "ios") iosActive += 1;
    } else {
      inactiveTotal += 1;
    }

    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      tenantName: String(row.tenant_name || row.tenant_id),
      tenantSlug: String(row.tenant_slug || "default"),
      userId: String(row.user_id),
      username: String(row.username || "user"),
      platform: plat,
      deviceName: row.device_name ? String(row.device_name) : null,
      maskedToken: maskPushToken(row.token),
      isActive: active,
      lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    };
  });

  const eodRuns: EodRunItem[] = (eodRows as any[]).map((row) => ({
    tenantId: String(row.tenant_id),
    tenantName: String(row.tenant_name || row.tenant_id),
    reportDate: String(row.report_date),
    status: String(row.status),
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    failedAt: row.failed_at ? String(row.failed_at) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
  }));

  let activeMobileSessions = 0;
  let activeWebSessions = 0;
  for (const s of sessionRows as any[]) {
    if (s?.client_type === "mobile") activeMobileSessions += 1;
    else activeWebSessions += 1;
  }

  return {
    checkedAt: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || "development",
    database,
    storage,
    envAudit,
    mobileCloud: {
      platformConfig,
      easProjectId: mobileMeta.easProjectId,
      easOwner: mobileMeta.easOwner,
      expoAccessTokenConfigured: expoTokenConfigured,
      expoPushDisabled: pushDisabled,
      iosBundleIdentifier: mobileMeta.iosBundleIdentifier,
      androidPackage: mobileMeta.androidPackage,
      appSlug: mobileMeta.appSlug,
      otaUpdatesConfigured: mobileMeta.otaUpdatesConfigured,
    },
    deviceStats: {
      activeTotal,
      inactiveTotal,
      androidActive,
      iosActive,
      devices,
    },
    eodRuns,
    platformTotals: {
      tenants: Number((tenantCountRow as any)?.count || 0),
      users: Number((userCountRow as any)?.count || 0),
      activeMobileSessions,
      activeWebSessions,
    },
  };
}

export async function revokeBoundPushDevice(deviceId: string): Promise<boolean> {
  await applyMultiTenantSchema(db);
  const count = await db("mobile_push_tokens")
    .where("id", deviceId)
    .update({
      is_active: 0,
      updated_at: new Date().toISOString(),
    });
  return count > 0;
}

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    clean === "localhost" ||
    clean === "127.0.0.1" ||
    clean === "::1" ||
    clean === "0.0.0.0" ||
    clean.endsWith(".local") ||
    clean.endsWith(".internal")
  ) {
    return true;
  }

  const ipv4Match = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, aStr, bStr] = ipv4Match;
    const a = Number(aStr);
    const b = Number(bStr);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }

  if (clean.startsWith("fc") || clean.startsWith("fd") || clean.startsWith("fe80")) {
    return true;
  }

  return false;
}
