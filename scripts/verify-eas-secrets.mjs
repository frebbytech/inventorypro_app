import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const useEasCli = args.includes("--eas-cli");
const isOta = args.includes("--ota");

function getArgValue(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
    return args[idx + 1].trim();
  }
  return fallback;
}

const profile = getArgValue("--profile", "production");
const platform = getArgValue("--platform", "android");

const root = process.cwd();
const mobileDir = path.join(root, "mobile");

const FORBIDDEN_REPO_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "google-services.json",
  "service-account.json",
]);

const FORBIDDEN_EXTENSIONS = new Set([
  ".jks",
  ".keystore",
  ".p8",
  ".p12",
  ".mobileprovision",
  ".pem",
]);

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`[FAIL] ${message}`);
}

function warnOrFail(message) {
  if (strict) {
    fail(message);
  } else {
    console.warn(`[WARN] ${message}`);
  }
}

console.log("=== InventoryPro EAS Secrets & GitHub Lockdown Verification ===");
console.log(
  `Mode: ${strict ? "STRICT" : "ADVISORY"} | Profile: ${profile} | Platform: ${platform}${useEasCli ? " | EAS CLI: ON" : ""}\n`,
);

// 1. Validate EAS & Expo project configuration
let easJson;
let appJson;
try {
  appJson = JSON.parse(
    fs.readFileSync(path.join(mobileDir, "app.json"), "utf8"),
  );
  easJson = JSON.parse(
    fs.readFileSync(path.join(mobileDir, "eas.json"), "utf8"),
  );
} catch (err) {
  fail(`Unable to parse mobile/app.json or mobile/eas.json: ${err.message}`);
  process.exit(1);
}

const projectId = String(
  appJson?.expo?.extra?.eas?.projectId ||
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    "",
).trim();
const owner = String(
  appJson?.expo?.owner || process.env.EXPO_OWNER || "",
).trim();

if (projectId) {
  console.log(`[PASS] EAS Project ID bound (${projectId})`);
} else {
  fail("Missing expo.extra.eas.projectId in mobile/app.json");
}

if (owner) {
  console.log(`[PASS] Expo Owner bound (${owner})`);
} else {
  warnOrFail("Expo owner is not explicitly set in mobile/app.json");
}

for (const envName of ["development", "preview", "production"]) {
  const buildProfile = easJson?.build?.[envName];
  if (!buildProfile) {
    fail(`Missing build.${envName} profile in mobile/eas.json`);
    continue;
  }
  if (buildProfile.environment !== envName) {
    fail(
      `mobile/eas.json build.${envName}.environment must be "${envName}" (found "${buildProfile.environment ?? ""}")`,
    );
  } else if (buildProfile.channel !== envName) {
    fail(
      `mobile/eas.json build.${envName}.channel must be "${envName}" (found "${buildProfile.channel ?? ""}")`,
    );
  } else {
    console.log(
      `[PASS] EAS profile "${envName}" binds environment="${envName}" & channel="${envName}"`,
    );
  }
}

// 2. Verify .gitignore protections & scan for accidental credential commits
const rootGitignore = fs.existsSync(path.join(root, ".gitignore"))
  ? fs.readFileSync(path.join(root, ".gitignore"), "utf8")
  : "";
const mobileGitignore = fs.existsSync(path.join(mobileDir, ".gitignore"))
  ? fs.readFileSync(path.join(mobileDir, ".gitignore"), "utf8")
  : "";

const requiredRootIgnores = [
  ".env",
  "google-services.json",
  "service-account.json",
  "*.pem",
];
for (const pattern of requiredRootIgnores) {
  if (!rootGitignore.includes(pattern)) {
    fail(`Root .gitignore is missing required secret ignore pattern: ${pattern}`);
  }
}

const requiredMobileIgnores = [
  "google-services.json",
  "service-account.json",
  "*.jks",
  "*.p8",
  "*.p12",
  "*.key",
  "*.mobileprovision",
];
for (const pattern of requiredMobileIgnores) {
  if (!mobileGitignore.includes(pattern)) {
    fail(`mobile/.gitignore is missing required credential ignore pattern: ${pattern}`);
  }
}
console.log("[PASS] .gitignore rules protect .env, FCM JSON, and native keystores");

function scanForCommittedSecrets(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".expo" ||
      entry.name === ".next" ||
      entry.name === ".git"
    ) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanForCommittedSecrets(fullPath);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (FORBIDDEN_REPO_FILES.has(entry.name) || FORBIDDEN_EXTENSIONS.has(ext)) {
      const rel = path.relative(root, fullPath);
      fail(
        `Sensitive file "${rel}" exists inside repository tree — store via EAS/GitHub Secrets instead`,
      );
    }
  }
}

scanForCommittedSecrets(mobileDir);
scanForCommittedSecrets(path.join(root, ".github"));
console.log("[PASS] No unignored secret or signing files detected in mobile/ or .github/");

// 3. Optional live EAS Cloud Environment Secrets verification via EAS CLI
function validateApiBaseUrl(rawUrl, sourceLabel) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    const isLocal =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname.endsWith(".local");
    if ((profile === "preview" || profile === "production") && (parsed.protocol !== "https:" || isLocal)) {
      fail(
        `${sourceLabel} EXPO_PUBLIC_API_BASE_URL for "${profile}" must use a public https:// endpoint`,
      );
      return false;
    }
    console.log(
      `[PASS] ${sourceLabel} EXPO_PUBLIC_API_BASE_URL uses ${parsed.protocol}//${parsed.host}`,
    );
    return true;
  } catch {
    fail(`${sourceLabel} EXPO_PUBLIC_API_BASE_URL is not a valid URL`);
    return false;
  }
}

if (useEasCli) {
  const easBin = process.platform === "win32" ? "eas.cmd" : "eas";
  try {
    const whoami = execFileSync(easBin, ["whoami"], {
      cwd: mobileDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    console.log(`[PASS] Authenticated with Expo EAS CLI (${whoami})`);
  } catch (err) {
    fail(
      `EAS CLI authentication check failed (configure EXPO_TOKEN or run "npx --prefix mobile eas login"): ${err?.stderr?.toString()?.trim() || err.message}`,
    );
    process.exit(1);
  }

  let envOutput = "";
  try {
    envOutput = execFileSync(
      easBin,
      ["env:list", "--environment", profile, "--non-interactive"],
      {
        cwd: mobileDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (err) {
    fail(
      `Unable to list EAS environment variables for "${profile}": ${err?.stderr?.toString()?.trim() || err.message}`,
    );
    process.exit(1);
  }

  const hasApiUrlVar = /\bEXPO_PUBLIC_API_BASE_URL\b/.test(envOutput);
  const hasGoogleServicesVar = /\bGOOGLE_SERVICES_JSON\b/.test(envOutput);

  if (profile === "preview" || profile === "production") {
    if (hasApiUrlVar) {
      console.log(
        `[PASS] EAS environment "${profile}" defines EXPO_PUBLIC_API_BASE_URL`,
      );
    } else {
      warnOrFail(
        `EAS environment "${profile}" is missing EXPO_PUBLIC_API_BASE_URL (required so standalone mobile apps connect to production backend)`,
      );
    }
  } else {
    console.log(
      `[INFO] EAS "${profile}" EXPO_PUBLIC_API_BASE_URL: ${hasApiUrlVar ? "present" : "unset (runtime server URL fallback active)"}`,
    );
  }

  if (!isOta && (platform === "android" || platform === "all")) {
    if (hasGoogleServicesVar) {
      console.log(
        `[PASS] EAS environment "${profile}" defines GOOGLE_SERVICES_JSON file variable for Android FCM push`,
      );
    } else {
      warnOrFail(
        `EAS environment "${profile}" is missing GOOGLE_SERVICES_JSON (Android native push notifications require google-services.json)`,
      );
    }
  }
} else {
  const localEnvApiUrl = (process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();
  if (localEnvApiUrl) {
    validateApiBaseUrl(localEnvApiUrl, "Shell env");
  } else {
    console.log(
      "[INFO] Offline mode: pass `--eas-cli --profile production --strict` after `eas login` (or in GitHub Actions) to query remote EAS Environment Variables.",
    );
  }
}

console.log(
  `\nVerification complete (${failures} error${failures === 1 ? "" : "s"}).`,
);
process.exit(failures > 0 ? 1 : 0);
