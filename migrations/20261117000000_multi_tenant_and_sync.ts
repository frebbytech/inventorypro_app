import type { Knex } from "knex";
import { applyMultiTenantSchema } from "../src/lib/tenant-schema";

export async function up(knex: Knex): Promise<void> {
  await applyMultiTenantSchema(knex);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("idempotency_keys");
  await knex.schema.dropTableIfExists("sync_events");
  await knex.schema.dropTableIfExists("tenants");
}
