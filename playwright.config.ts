import fs from "node:fs";
import { chromium, defineConfig } from "@playwright/test";

function resolveChromiumExecutablePath(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  try {
    const defaultExecutable = chromium.executablePath();
    if (defaultExecutable && fs.existsSync(defaultExecutable)) {
      return defaultExecutable;
    }
  } catch {
    // Fall back to known preinstalled Playwright binary on host
  }

  const fallbackCandidates = [
    "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ];

  for (const candidate of fallbackCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

const executablePath = resolveChromiumExecutablePath();
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    viewport: { width: 1280, height: 800 },
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npx next dev -p 3100 -H 127.0.0.1",
    url: `${baseURL}/auth/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: "3100",
      DATABASE_URL: "./e2e/.e2e_test.db",
      NEXT_DIST_DIR: ".next-e2e",
      DISABLE_EXPO_PUSH: "true",
      JWT_SECRET:
        process.env.JWT_SECRET ||
        "e2e-playwright-secret-key-at-least-32-chars",
      SUPER_ADMIN_USERNAME: process.env.SUPER_ADMIN_USERNAME || "superadmin",
      SUPER_ADMIN_PASSWORD:
        process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin123!",
    },
  },
});
