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
import { applyMultiTenantSchema } from "@/lib/tenant-schema";
import { up as migrateMemberSaleAlertsUp } from "../migrations/20261126000000_member_sale_alerts";

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

  it("initializes base, multi-tenant, security, and super-admin schemas with v_product_catalog and member sale alert columns intact", async () => {
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

    const hasAlertEnabledCol = await db.schema.hasColumn(
      "settings",
      "member_sale_alert_enabled",
    );
    const hasAlertChannelsCol = await db.schema.hasColumn(
      "settings",
      "member_sale_alert_channels",
    );
    expect(hasAlertEnabledCol).toBe(true);
    expect(hasAlertChannelsCol).toBe(true);

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

  it("upgrades settings missing member_sale_alert columns via both Knex migration and applyMultiTenantSchema fast-path bypass", async () => {
    await ensureAuthSchema();
    await ensureMultiTenantSchema();

    // Simulate an existing DB that already had paper_size before member_sale_alert columns existed
    await db.schema.alterTable("settings", (table) => {
      table.dropColumn("member_sale_alert_enabled");
      table.dropColumn("member_sale_alert_channels");
    });

    expect(
      await db.schema.hasColumn("settings", "member_sale_alert_enabled"),
    ).toBe(false);
    expect(
      await db.schema.hasColumn("settings", "member_sale_alert_channels"),
    ).toBe(false);

    // applyMultiTenantSchema must not early-return when member_sale_alert columns are missing
    await applyMultiTenantSchema(db);

    expect(
      await db.schema.hasColumn("settings", "member_sale_alert_enabled"),
    ).toBe(true);
    expect(
      await db.schema.hasColumn("settings", "member_sale_alert_channels"),
    ).toBe(true);

    // Also verify the Knex migration up() independently adds them and is idempotent
    await db.schema.alterTable("settings", (table) => {
      table.dropColumn("member_sale_alert_enabled");
      table.dropColumn("member_sale_alert_channels");
    });

    await migrateMemberSaleAlertsUp(db);
    await migrateMemberSaleAlertsUp(db);

    expect(
      await db.schema.hasColumn("settings", "member_sale_alert_enabled"),
    ).toBe(true);
    expect(
      await db.schema.hasColumn("settings", "member_sale_alert_channels"),
    ).toBe(true);
  });
});

