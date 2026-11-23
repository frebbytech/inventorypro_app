import "server-only";
import db from "@/db/knex";
import { ensureBaseTables } from "@/lib/base-schema";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
  applyMultiTenantSchema,
  normalizeSlug,
  normalizeTenantAccessMode,
  rebuildTenantScopedViews,
} from "@/lib/tenant-schema";

export {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
  normalizeSlug,
  normalizeTenantAccessMode,
  rebuildTenantScopedViews,
};

const globalForTenantSchema = globalThis as typeof globalThis & {
  __inventoryProMultiTenantSchemaPromise?: Promise<void> | null;
};

export async function ensureMultiTenantSchema(): Promise<void> {
  if (globalForTenantSchema.__inventoryProMultiTenantSchemaPromise) {
    return globalForTenantSchema.__inventoryProMultiTenantSchemaPromise;
  }

  globalForTenantSchema.__inventoryProMultiTenantSchemaPromise = (async () => {
    await ensureBaseTables(db);
    await applyMultiTenantSchema(db);
  })().catch((err) => {
    globalForTenantSchema.__inventoryProMultiTenantSchemaPromise = null;
    console.error("Failed to ensure multi-tenant schema:", err);
    throw err;
  });

  return globalForTenantSchema.__inventoryProMultiTenantSchemaPromise;
}

export function resetMultiTenantSchemaCache() {
  globalForTenantSchema.__inventoryProMultiTenantSchemaPromise = null;
}
