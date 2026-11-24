import { expect, test } from "@playwright/test";
import {
  attachBrowserErrorCollector,
  DEFAULT_ADMIN_USERNAME,
  signInAsStoreAdmin,
} from "./helpers";

test.describe("Authentication & Core Route Health", () => {
  test("redirects unauthenticated root visits to /auth/sign-in and rejects bad credentials", async ({
    page,
  }) => {
    const errors = attachBrowserErrorCollector(page, {
      allow4xxConsoleErrors: true,
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await expect(
      page.getByRole("heading", { name: /sign in/i }),
    ).toBeVisible();

    await page
      .getByPlaceholder("admin or user@example.com")
      .fill(DEFAULT_ADMIN_USERNAME);
    await page.getByPlaceholder("••••••••").fill("WrongPassword999!");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(
      page.getByText(/invalid|incorrect|failed/i).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/sign-in/);

    errors.assertNoFatalErrors("unauthenticated redirect & invalid login");
  });

  test("signs in as store admin and renders every core workspace route with zero runtime errors", async ({
    page,
  }) => {
    const errors = attachBrowserErrorCollector(page);

    await signInAsStoreAdmin(page);
    await expect(page).toHaveURL(/\/admin/);

    const routes: Array<{ path: string; readyText: RegExp }> = [
      { path: "/admin", readyText: /dashboard|overview|sales|inventory/i },
      { path: "/sales", readyText: /point of sale \(pos\)/i },
      { path: "/admin/product", readyText: /products \(\d+\)/i },
      { path: "/admin/product-category", readyText: /products categories/i },
      { path: "/admin/inventory", readyText: /inventory/i },
      { path: "/admin/messages", readyText: /messages|broadcast/i },
      { path: "/admin/settings", readyText: /settings|business/i },
      { path: "/logs", readyText: /logs|activity|audit/i },
      { path: "/summary", readyText: /summary|sales/i },
    ];

    for (const route of routes) {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/auth\/sign-in/);
      await expect(page.getByText(route.readyText).first()).toBeVisible({
        timeout: 20_000,
      });

      // Verify Next.js did not render an error boundary or leak server modules
      await expect(
        page.getByText(/application error|unhandled runtime error/i),
      ).toHaveCount(0);
    }

    // Open the Notification sheet (triggers NotificationButton + notifications Server Action bundle)
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    const bellButton = page.getByRole("button", { name: /notifications/i });
    await expect(bellButton).toBeVisible();
    await bellButton.click();
    await expect(
      page.getByRole("heading", { name: /^notifications$/i }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Ensure the previously seen client bundle error never occurred on any route
    const combinedErrors = [...errors.pageErrors, ...errors.consoleErrors].join(
      "\n",
    );
    expect(combinedErrors).not.toContain("pushNotifications");
    errors.assertNoFatalErrors("authenticated core workspace routes");
  });
});
