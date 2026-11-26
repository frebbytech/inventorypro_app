import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasSettings = await knex.schema.hasTable("settings");
  if (!hasSettings) {
    return;
  }

  const hasEnabled = await knex.schema.hasColumn(
    "settings",
    "member_sale_alert_enabled",
  );
  if (!hasEnabled) {
    await knex.schema.alterTable("settings", (table) => {
      table.boolean("member_sale_alert_enabled").defaultTo(false);
    });
  }

  const hasChannels = await knex.schema.hasColumn(
    "settings",
    "member_sale_alert_channels",
  );
  if (!hasChannels) {
    await knex.schema.alterTable("settings", (table) => {
      table.text("member_sale_alert_channels").defaultTo('["in_app"]');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSettings = await knex.schema.hasTable("settings");
  if (!hasSettings) {
    return;
  }

  const hasChannels = await knex.schema.hasColumn(
    "settings",
    "member_sale_alert_channels",
  );
  if (hasChannels) {
    await knex.schema.alterTable("settings", (table) => {
      table.dropColumn("member_sale_alert_channels");
    });
  }

  const hasEnabled = await knex.schema.hasColumn(
    "settings",
    "member_sale_alert_enabled",
  );
  if (hasEnabled) {
    await knex.schema.alterTable("settings", (table) => {
      table.dropColumn("member_sale_alert_enabled");
    });
  }
}
