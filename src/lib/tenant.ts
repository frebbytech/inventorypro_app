import "server-only";
import db from "@/db/knex";
import { ensureBaseTables } from "@/lib/base-schema";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
  applyMultiTenantSchema,
  normalizeSlug,
  rebuildTenantScopedViews,
} from "@/lib/tenant-schema";

export {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
  normalizeSlug,
  rebuildTenantScopedViews,
};

let multiTenantSchemaPromise: Promise<void> | null = null;

export async function ensureMultiTenantSchema(): Promise<void> {
  if (multiTenantSchemaPromise) {
    return multiTenantSchemaPromise;
  }

  multiTenantSchemaPromise = (async () => {
    await ensureBaseTables(db);
    await applyMultiTenantSchema(db);
  })().catch((err) => {
    multiTenantSchemaPromise = null;
    console.error("Failed to ensure multi-tenant schema:", err);
    throw err;
  });

  return multiTenantSchemaPromise;
}

export function resetMultiTenantSchemaCache() {
  multiTenantSchemaPromise = null;
}
