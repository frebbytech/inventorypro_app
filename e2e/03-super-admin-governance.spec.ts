import { expect, test } from "@playwright/test";
import {
  attachBrowserErrorCollector,
  signInAsStoreAdmin,
  signInAsSuperAdmin,
} from "./helpers";

test.describe("Super Admin Tenant Provisioning & Access Mode Governance", () => {
  test("provisions tenant, blocks web login on mobile_only mode, restores dual access, and cleans up tenant", async ({
    browser,
    page,
  }) => {
    const errors = attachBrowserErrorCollector(page);
    const suffix = Date.now().toString().slice(-6);
    const businessName = `E2E Pharmacy ${suffix}`;
    const slug = `e2e-pharmacy-${suffix}`;
    const ownerUsername = `owner${suffix}`;
    const ownerEmail = `owner${suffix}@example.com`;
    const ownerPassword = "OwnerPass123!";

    // 1. Sign in as Super Admin and create a new tenant
    await signInAsSuperAdmin(page);
    await expect(
      page.getByRole("heading", { name: /platform overview & tenants/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /new tenant/i }).click();
    await page.locator("#new-tenant-name").fill(businessName);
    await page.locator("#new-tenant-slug").fill(slug);
    await page.locator("#new-tenant-currency").fill("GHS");
    await page.locator("#new-tenant-access").selectOption("both");

    await page.locator("#owner-first").fill("Ama");
    await page.locator("#owner-last").fill("Mensah");
    await page.locator("#owner-username").fill(ownerUsername);
    await page.locator("#owner-email").fill(ownerEmail);
    await page.locator("#owner-password").fill(ownerPassword);

    await page.getByRole("button", { name: /create tenant/i }).click();

    const tenantRow = page.locator("tr", { hasText: slug });
    await expect(tenantRow).toBeVisible({ timeout: 20_000 });
    await expect(tenantRow.getByText(/web \+ mobile/i)).toBeVisible();

    // 2. Switch tenant platform access mode to mobile_only
    await tenantRow.getByTitle("Edit tenant details").click();
    await expect(
      page.getByRole("heading", { name: /edit tenant settings/i }),
    ).toBeVisible();
    await page.locator("#edit-tenant-access").selectOption("mobile_only");
    await page.getByRole("button", { name: /save changes/i }).click();

    await expect(tenantRow.getByText(/mobile only/i)).toBeVisible({
      timeout: 15_000,
    });

    // 3. In an isolated incognito context, verify store web login is blocked while mobile_only
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    const guestErrors = attachBrowserErrorCollector(guestPage, {
      allow4xxConsoleErrors: true,
    });

    await guestPage.goto("/auth/sign-in", { waitUntil: "domcontentloaded" });
    await guestPage
      .getByPlaceholder("admin or user@example.com")
      .fill(ownerUsername);
    await guestPage.getByPlaceholder("••••••••").fill(ownerPassword);
    await guestPage
      .getByRole("button", { name: /have a workspace code\?/i })
      .click();
    await guestPage.getByPlaceholder("e.g. my-store-slug").fill(slug);
    await guestPage.getByRole("button", { name: /sign in/i }).click();

    await expect(
      guestPage.getByText(/mobile app access only|mobile-only/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(guestPage).toHaveURL(/\/auth\/sign-in/);
    guestErrors.assertNoFatalErrors("mobile_only web login denial");
    await guestContext.close();

    // 4. Restore tenant platform access mode back to both
    await tenantRow.getByTitle("Edit tenant details").click();
    await page.locator("#edit-tenant-access").selectOption("both");
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(tenantRow.getByText(/web \+ mobile/i)).toBeVisible({
      timeout: 15_000,
    });

    // 5. Verify tenant owner can now sign in on web
    const allowedContext = await browser.newContext();
    const allowedPage = await allowedContext.newPage();
    const allowedErrors = attachBrowserErrorCollector(allowedPage);
    await signInAsStoreAdmin(allowedPage, {
      usernameOrEmail: ownerUsername,
      password: ownerPassword,
      workspaceSlug: slug,
    });
    await expect(allowedPage).toHaveURL(/\/admin/);
    allowedErrors.assertNoFatalErrors("restored dual-access tenant owner login");
    await allowedContext.close();

    // 6. Clean up provisioned test tenant
    await tenantRow.getByTitle("Delete tenant").click();
    await page.locator("#confirm-delete-slug").fill(slug);
    await page
      .getByRole("button", { name: /delete tenant permanently/i })
      .click();
    await expect(tenantRow).toHaveCount(0, { timeout: 15_000 });

    // 7. Navigate to Production Ops & Cloud Binding dashboard and verify diagnostics
    await page.getByRole("link", { name: /production ops/i }).click();
    await expect(page).toHaveURL(/\/super-admin\/ops/);
    await expect(
      page.getByRole("heading", { name: /production ops & cloud binding/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/healthy · \d+ms/i)).toBeVisible();
    await expect(page.getByText(/com\.frebbytech\.inventorypro/i)).toBeVisible();
    await expect(
      page.getByText(/nanaakwasi-8d50e\.firebasestorage\.app/i).first(),
    ).toBeVisible();

    errors.assertNoFatalErrors("super-admin governance and production ops flow");
  });
});
