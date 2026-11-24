import { expect, type Page } from "@playwright/test";

export const DEFAULT_ADMIN_USERNAME =
  process.env.E2E_ADMIN_USERNAME || "frebbytech";
export const DEFAULT_ADMIN_PASSWORD =
  process.env.INITIAL_ADMIN_PASSWORD || "Admin123!";
export const DEFAULT_SUPER_ADMIN_USERNAME =
  process.env.SUPER_ADMIN_USERNAME || "superadmin";
export const DEFAULT_SUPER_ADMIN_PASSWORD =
  process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin123!";

export interface BrowserErrorCollector {
  pageErrors: string[];
  consoleErrors: string[];
  assertNoFatalErrors: (contextLabel?: string) => void;
}

const IGNORED_CONSOLE_PATTERNS = [
  // HMR WebSockets are disabled in embedded environments
  /WebSocket/i,
  // Chromium logs a generic failed resource message during intentional negative-auth checks
  /Failed to load resource: the server responded with a status of 40[13]/i,
];

export function attachBrowserErrorCollector(
  page: Page,
  options?: { allow4xxConsoleErrors?: boolean },
): BrowserErrorCollector {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (err) => {
    pageErrors.push(`${err.name}: ${err.message}`);
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (
      options?.allow4xxConsoleErrors &&
      IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))
    ) {
      return;
    }
    if (/WebSocket/i.test(text)) return;
    consoleErrors.push(text);
  });

  return {
    pageErrors,
    consoleErrors,
    assertNoFatalErrors(contextLabel = "browser session") {
      expect(
        pageErrors,
        `Unexpected uncaught page errors during ${contextLabel}`,
      ).toEqual([]);
      expect(
        consoleErrors,
        `Unexpected console.error messages during ${contextLabel}`,
      ).toEqual([]);
    },
  };
}

export async function signInAsStoreAdmin(
  page: Page,
  credentials?: {
    usernameOrEmail?: string;
    password?: string;
    workspaceSlug?: string;
  },
) {
  const username = credentials?.usernameOrEmail ?? DEFAULT_ADMIN_USERNAME;
  const password = credentials?.password ?? DEFAULT_ADMIN_PASSWORD;

  await page.goto("/auth/sign-in", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /sign in/i }),
  ).toBeVisible();

  await page.getByPlaceholder("admin or user@example.com").fill(username);
  await page.getByPlaceholder("••••••••").fill(password);

  if (credentials?.workspaceSlug) {
    const workspaceToggle = page.getByRole("button", {
      name: /have a workspace code\?/i,
    });
    if (await workspaceToggle.isVisible()) {
      await workspaceToggle.click();
    }
    await page
      .getByPlaceholder("e.g. my-store-slug")
      .fill(credentials.workspaceSlug);
  }

  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/sign-in"), {
    timeout: 25_000,
  });
}

export async function signInAsSuperAdmin(
  page: Page,
  credentials?: { identifier?: string; password?: string },
) {
  const identifier = credentials?.identifier ?? DEFAULT_SUPER_ADMIN_USERNAME;
  const password = credentials?.password ?? DEFAULT_SUPER_ADMIN_PASSWORD;

  await page.goto("/super-admin/login", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /super admin sign in/i }),
  ).toBeVisible();

  await page.locator("#super-admin-id").fill(identifier);
  await page.locator("#super-admin-password").fill(password);
  await page
    .getByRole("button", { name: /enter super admin console/i })
    .click();

  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/super-admin") &&
      url.pathname !== "/super-admin/login",
    { timeout: 25_000 },
  );
}
