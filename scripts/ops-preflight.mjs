import fs from "node:fs";
import path from "node:path";

const strict = process.argv.includes("--strict");
const root = process.cwd();

const requiredStoreAssets = [
  "mobile/assets/icon.png",
  "mobile/assets/adaptive-icon.png",
  "mobile/assets/splash-icon.png",
  "mobile/assets/notification-icon.png",
  "mobile/assets/favicon.png",
];

function checkEnvVar(name, options = {}) {
  const val = (process.env[name] || "").trim();
  if (!val) {
    return { ok: false, status: "MISSING", note: `${name} is not set` };
  }
  if (options.rejectValues?.includes(val)) {
    return {
      ok: false,
      status: "DEFAULT",
      note: `${name} still uses default development placeholder`,
    };
  }
  if (options.minLength && val.length < options.minLength) {
    return {
      ok: false,
      status: "WEAK",
      note: `${name} is shorter than ${options.minLength} characters`,
    };
  }
  return { ok: true, status: "OK", note: `${name} configured` };
}

console.log("=== InventoryPro Production Ops & Cloud Binding Preflight ===");
console.log(`Mode: ${strict ? "STRICT (production gate)" : "ADVISORY"}\n`);

let criticalFailures = 0;

// 1. Mobile config & store asset checks
const appJsonPath = path.join(root, "mobile/app.json");
const easJsonPath = path.join(root, "mobile/eas.json");
const appConfigTsPath = path.join(root, "mobile/app.config.ts");

let easProjectId = (process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "").trim();
try {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  JSON.parse(fs.readFileSync(easJsonPath, "utf8"));
  const fileProjectId = String(appJson?.expo?.extra?.eas?.projectId || "").trim();
  if (!easProjectId && fileProjectId) easProjectId = fileProjectId;
  console.log("[PASS] mobile/app.json & mobile/eas.json valid JSON");
} catch (err) {
  console.error("[FAIL] Invalid mobile/app.json or mobile/eas.json:", err);
  criticalFailures += 1;
}

if (fs.existsSync(appConfigTsPath)) {
  console.log("[PASS] mobile/app.config.ts dynamic cloud binding present");
} else {
  console.warn("[WARN] mobile/app.config.ts missing");
}

for (const assetRel of requiredStoreAssets) {
  const full = path.join(root, assetRel);
  if (!fs.existsSync(full)) {
    console.error(`[FAIL] Missing store asset: ${assetRel}`);
    criticalFailures += 1;
  }
}
console.log(`[PASS] Verified ${requiredStoreAssets.length} mobile store PNG assets`);

if (easProjectId) {
  console.log(`[PASS] Expo EAS projectId bound (${easProjectId})`);
} else {
  console.log(
    "[WARN] Expo EAS projectId unbound (run `cd mobile && npx eas init` or set EXPO_PUBLIC_EAS_PROJECT_ID)",
  );
  if (strict) criticalFailures += 1;
}

// 2. Environment & security guardrails (never prints secret values)
const envChecks = [
  checkEnvVar("JWT_SECRET", {
    minLength: 24,
    rejectValues: [
      "inventorypro_default_jwt_secret_key_2026_change_in_prod",
      "replace-with-a-strong-random-secret",
    ],
  }),
  checkEnvVar("CRON_SECRET", { minLength: 16 }),
  checkEnvVar("SUPER_ADMIN_PASSWORD", {
    minLength: 8,
    rejectValues: ["SuperAdmin123!", "replace-with-super-admin-password"],
  }),
  checkEnvVar("ENCRYPTION_KEY", { minLength: 16 }),
];

for (const result of envChecks) {
  const prefix = result.ok ? "[PASS]" : strict ? "[FAIL]" : "[WARN]";
  console.log(`${prefix} ${result.status}: ${result.note}`);
  if (!result.ok && strict) {
    criticalFailures += 1;
  }
}

// 3. Database & storage writable check
const dbUrl = (process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "").trim();
if (/^(libsql|https?|wss?):\/\//i.test(dbUrl)) {
  const tokenPresent = Boolean(
    (process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || "").trim(),
  );
  console.log(
    tokenPresent
      ? "[PASS] Remote Turso/libSQL URL & auth token configured"
      : "[WARN] Remote DATABASE_URL configured without DATABASE_AUTH_TOKEN",
  );
  if (!tokenPresent && strict) criticalFailures += 1;
} else {
  console.log(
    `[INFO] Database target: local SQLite (${dbUrl || "./inventory_pro.db"})`,
  );
}

const firebaseConfigPath = path.join(root, "firebase-applet-config.json");
let firebaseBucket = (process.env.FIREBASE_STORAGE_BUCKET || "").trim();
if (!firebaseBucket && fs.existsSync(firebaseConfigPath)) {
  try {
    const fb = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    if (fb?.projectId && fb.projectId !== "remixed-project-id") {
      firebaseBucket = String(fb?.storageBucket || "").trim();
    }
  } catch {
    // ignore malformed json
  }
}

if (firebaseBucket) {
  console.log(`[PASS] Firebase Storage bucket bound (${firebaseBucket})`);
} else {
  console.log(
    "[WARN] Firebase Storage bucket unbound (configure firebase-applet-config.json or FIREBASE_STORAGE_BUCKET)",
  );
  if (strict) criticalFailures += 1;
}

const uploadsDir = path.join(root, "public", "images");
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.accessSync(uploadsDir, fs.constants.W_OK);
  console.log("[PASS] Media upload fallback directory public/images is writable");
} catch {
  if (firebaseBucket) {
    console.log(
      "[INFO] Media fallback public/images read-only (Firebase Storage active)",
    );
  } else {
    console.error("[FAIL] Media upload directory public/images is not writable");
    criticalFailures += 1;
  }
}

console.log(
  `\nPreflight complete (${criticalFailures} blocking issue${criticalFailures === 1 ? "" : "s"}).`,
);
process.exit(criticalFailures > 0 ? 1 : 0);
