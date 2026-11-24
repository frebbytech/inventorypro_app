import { expect, test } from "@playwright/test";
import { attachBrowserErrorCollector, signInAsStoreAdmin } from "./helpers";

test.describe("Catalog Setup & End-to-End POS Checkout", () => {
  test("creates a category and product, adds to POS cart, completes payment, and updates stock", async ({
    page,
  }) => {
    const errors = attachBrowserErrorCollector(page);
    const suffix = Date.now().toString().slice(-6);
    const categoryName = `Beverages ${suffix}`;
    const productName = `Sparkling Water ${suffix}`;
    const barcode = `890123${suffix}`;

    await signInAsStoreAdmin(page);

    // 1. Create a category so product creation has a guaranteed valid category
    await page.goto("/admin/product-category", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: /add category/i }).click();
    await page.locator("#name").fill(categoryName);
    await page.locator("#description").fill("Playwright E2E test category");
    await page.getByRole("button", { name: /create category/i }).click();
    await expect(page.getByText(categoryName).first()).toBeVisible({
      timeout: 15_000,
    });

    // 2. Create a product with stock=20, cost=10, price=25
    await page.goto("/admin/product", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /add product/i }).click();

    await page.getByPlaceholder("Product name here").fill(productName);
    await page
      .getByPlaceholder("e.g. 8901234567890 or scan barcode")
      .fill(barcode);

    // Open Shadcn Select for Category
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: categoryName }).click();

    await page.getByPlaceholder("Stock quantity").fill("20");
    await page.getByPlaceholder("Cost price").fill("10");
    await page.getByPlaceholder("Unit price").fill("25");
    await page
      .getByPlaceholder("Enter product description")
      .fill("Sparkling mineral water bottle for POS E2E checkout verification.");

    // Submit dialog form ("Add Product" button inside dialog footer)
    const productDialog = page.getByRole("dialog");
    await productDialog.getByRole("button", { name: /add product/i }).click();
    await expect(productDialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(productName).first()).toBeVisible({
      timeout: 15_000,
    });

    // 3. Open POS screen, locate product, add to cart, and complete payment
    await page.goto("/sales", { waitUntil: "domcontentloaded" });
    const searchInput = page.getByPlaceholder(
      "Search products by name or barcode...",
    );
    await searchInput.fill(productName);

    const addButton = page.getByRole("button", {
      name: new RegExp(`Add one ${productName} to cart`, "i"),
    });
    await expect(addButton).toBeVisible({ timeout: 15_000 });
    await addButton.click();

    // Verify Cart section updated and Charge button is enabled
    const chargeButton = page
      .getByRole("region", { name: /cart/i })
      .getByRole("button", { name: /charge/i });
    await expect(chargeButton).toBeEnabled();
    await expect(chargeButton).toContainText("25.00");

    // 4. Open payment dialog, confirm exact amount, and complete sale
    await chargeButton.click();
    await expect(
      page.getByRole("heading", { name: /take payment/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /exact amount/i }).click();
    await expect(page.locator("#amount-paid")).toHaveValue("25.00");

    await page.getByRole("button", { name: /confirm payment/i }).click();

    // Receipt printer modal opens during/after sale persistence
    const receiptDialog = page.getByRole("dialog");
    await expect(
      receiptDialog.getByText("RECEIPT PRINTER", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });

    // Wait until the sale completes and clears the cart before dismissing the receipt modal
    await expect(
      page
        .getByRole("region", { name: /cart/i })
        .getByText(/your cart is empty/i),
    ).toBeVisible({ timeout: 15_000 });

    const closeOrDoneBtn = receiptDialog
      .getByRole("button", {
        name: /^(done|close)$/i,
      })
      .first();
    await closeOrDoneBtn.click();
    await expect(receiptDialog).toBeHidden({ timeout: 10_000 });

    // 5. Reload POS and confirm stock decremented from 20 to 19
    await page.goto("/sales", { waitUntil: "domcontentloaded" });
    await page
      .getByPlaceholder("Search products by name or barcode...")
      .fill(productName);
    await expect(page.getByText("19 in stock")).toBeVisible({
      timeout: 15_000,
    });

    errors.assertNoFatalErrors("category, product creation, and POS checkout");
  });
});
