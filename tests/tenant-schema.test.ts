import { describe, expect, it } from "vitest";
import db from "@/db/knex";
import { ensureAuthSchema } from "@/lib/auth";
import { ensureSecuritySchema } from "@/lib/security";
import { ensureSuperAdminSchema } from "@/lib/super-admin";
import {
  DEFAULT_TENANT_ID,
  ensureMultiTenantSchema,
  normalizeSlug,
  normalizeTenantAccessMode,
  rebuildTenantScopedViews,
} from "@/lib/tenant";

describe("Tenant Schema & Initialization", () => {
  it("normalizes slugs and tenant access modes safely", () => {
    expect(normalizeSlug("  Acme Pharmacy Ltd! ")).toBe("acme-pharmacy-ltd");
    expect(normalizeSlug("___")).toMatch(/^store-[a-z0-9]+$/);

    expect(normalizeTenantAccessMode(undefined)).toBe("both");
    expect(normalizeTenantAccessMode(null)).toBe("both");
    expect(normalizeTenantAccessMode("invalid-mode")).toBe("both");
    expect(normalizeTenantAccessMode("mobile_only")).toBe("mobile_only");
    expect(normalizeTenantAccessMode("web_only")).toBe("web_only");
    expect(normalizeTenantAccessMode("both")).toBe("both");
  });

  it("initializes base, multi-tenant, security, and super-admin schemas with v_product_catalog intact", async () => {
    await ensureAuthSchema();
    await ensureMultiTenantSchema();
    await ensureSecuritySchema();
    await ensureSuperAdminSchema();
    await rebuildTenantScopedViews(db);

    const hasAccessModeCol = await db.schema.hasColumn("tenants", "access_mode");
    expect(hasAccessModeCol).toBe(true);

    const hasLowStockCol = await db.schema.hasColumn(
      "products",
      "low_stock_threshold",
    );
    expect(hasLowStockCol).toBe(true);

    const defaultTenant = await db("tenants")
      .where("id", DEFAULT_TENANT_ID)
      .first("id", "slug", "status", "access_mode");
    expect(defaultTenant).toBeTruthy();
    expect(defaultTenant?.status).toBe("active");
    expect(normalizeTenantAccessMode(defaultTenant?.access_mode)).toBe("both");

    // Verify v_product_catalog executes cleanly with low_stock_threshold column
    const catalogRows = await db("v_product_catalog")
      .where("tenant_id", DEFAULT_TENANT_ID)
      .select(
        "product_id",
        "product_name",
        "low_stock_threshold",
        "stock_quantity",
      );
    expect(Array.isArray(catalogRows)).toBe(true);
  });
});
