import crypto from "crypto";
import type { Knex } from "knex";

let baseSchemaPromise: Promise<void> | null = null;

async function createTableIfMissing(
  knexOrDb: Knex,
  tableName: string,
  cb: (table: Knex.CreateTableBuilder) => void,
) {
  const exists = await knexOrDb.schema.hasTable(tableName);
  if (!exists) {
    await knexOrDb.schema.createTable(tableName, cb);
  }
}

async function initBaseTables(knexOrDb: Knex): Promise<void> {
  // 1. Core independent tables first
  await createTableIfMissing(knexOrDb, "users", (table) => {
    table.string("id", 36).primary();
    table.string("username", 100).notNullable().unique();
    table.string("email", 255).notNullable().unique();
    table.string("password_hash", 255).nullable();
    table.string("firstname", 100).notNullable().defaultTo("");
    table.string("lastname", 100).notNullable().defaultTo("");
    table.string("phonenumber", 15).nullable();
    table.enum("role", ["admin", "member"]).notNullable().defaultTo("member");
    table.integer("failed_login_attempts").defaultTo(0);
    table.datetime("locked_until").nullable();
    table.timestamp("last_login_at").nullable();
    table.timestamps(true, true);
  });

  await createTableIfMissing(knexOrDb, "eod_dispatch_locks", (table) => {
    table.text("report_date").primary();
    table
      .text("status")
      .notNullable()
      .defaultTo("processing")
      .checkIn(["processing", "completed", "failed"]);
    table.text("claimed_at").notNullable();
    table.text("completed_at");
    table.text("failed_at");
    table.text("error_message");
  });

  await createTableIfMissing(knexOrDb, "broadcast_messages", (table) => {
    table.string("id").primary();
    table.string("sender_id").notNullable();
    table.string("sender_name").notNullable();
    table.string("recipient_group").notNullable();
    table.string("channel").notNullable();
    table.string("subject").nullable();
    table.text("content").notNullable();
    table.integer("recipient_count").defaultTo(0);
    table.string("status").defaultTo("sent");
    table.datetime("created_at").defaultTo(knexOrDb.fn.now());
  });

  await createTableIfMissing(knexOrDb, "daily_sales_reports", (table) => {
    table.string("id").primary();
    table.string("report_date").notNullable().unique();
    table.datetime("generated_at").defaultTo(knexOrDb.fn.now());
    table.float("total_sales_amount").defaultTo(0);
    table.integer("total_transactions").defaultTo(0);
    table.integer("completed_transactions").defaultTo(0);
    table.integer("cancelled_transactions").defaultTo(0);
    table.integer("total_items_sold").defaultTo(0);
    table.float("total_cost").defaultTo(0);
    table.float("gross_profit").defaultTo(0);
    table.text("payment_breakdown").nullable();
    table.text("top_products").nullable();
    table.text("cashier_summary").nullable();
    table.string("status").defaultTo("generated");
    table.text("dispatch_logs").nullable();
    table.string("created_by").nullable();
    table.timestamps(true, true);
  });

  // 2. Tables referencing users
  await createTableIfMissing(knexOrDb, "activity_logs", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("activity_type", 100).notNullable();
    table.string("title", 255).notNullable();
    table.text("description").defaultTo(null);
    table.text("metadata").defaultTo(null);
    table.timestamp("created_at").notNullable().defaultTo(knexOrDb.fn.now());
    table.index(["created_at"], "activity_logs_idx_activity_created");
    table.index(["activity_type"], "activity_logs_idx_activity_type");
    table.index(["user_id"], "activity_logs_idx_activity_user");
    table
      .foreign(["user_id"])
      .references(["id"])
      .inTable("users")
      .onDelete("CASCADE");
  });

  await createTableIfMissing(knexOrDb, "audit_logs", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).defaultTo(null);
    table.string("entity_type", 100).notNullable();
    table.string("entity_id", 100).notNullable();
    table
      .text("action")
      .notNullable()
      .checkIn([
        "create",
        "update",
        "delete",
        "restore",
        "approve",
        "cancel",
        "login",
        "logout",
      ]);
    table.text("old_values").defaultTo(null);
    table.text("new_values").defaultTo(null);
    table.string("ip_address", 45).defaultTo(null);
    table.text("user_agent").defaultTo(null);
    table.timestamp("created_at").notNullable().defaultTo(knexOrDb.fn.now());
    table.index(["created_at"], "audit_logs_idx_audit_created");
    table.index(["action"], "audit_logs_idx_audit_action");
    table.index(["entity_type", "entity_id"], "audit_logs_idx_audit_entity");
    table.index(["user_id"], "audit_logs_idx_audit_user");
    table
      .foreign(["user_id"])
      .references(["id"])
      .inTable("users")
      .onDelete("SET NULL");
  });

  await createTableIfMissing(knexOrDb, "customers", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("name", 100).notNullable();
    table.string("email", 255).defaultTo(null);
    table.string("address", 255).defaultTo(null);
    table.string("phonenumber", 100).defaultTo(null);
    table.timestamp("created_at").defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    table.index(["name"], "customers_idx_customers_name");
    table.index(["user_id"], "customers_idx_customers_user");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
  });

  await createTableIfMissing(knexOrDb, "product_categories", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("name", 100).notNullable();
    table.text("description").defaultTo(null);
    table.integer("is_active").notNullable().defaultTo(1);
    table.timestamp("created_at").notNullable().defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knexOrDb.fn.now());
    table.index(
      ["is_active"],
      "product_categories_idx_product_categories_active",
    );
    table.index(["name"], "product_categories_idx_product_categories_name");
    table.index(["user_id"], "product_categories_idx_product_categories_user");
    table.unique(["user_id", "name"], {
      indexName: "product_categories_uq_category_name_per_user",
    });
    table
      .foreign(["user_id"])
      .references(["id"])
      .inTable("users")
      .onDelete("CASCADE");
  });

  await createTableIfMissing(knexOrDb, "suppliers", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("name", 100).notNullable();
    table.string("email", 100).defaultTo(null);
    table.string("company_name", 255).defaultTo(null);
    table.string("address", 255).defaultTo(null);
    table.string("phonenumber", 100).defaultTo(null);
    table.integer("is_active").defaultTo(1);
    table.timestamp("created_at").defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    table.index(["name"], "suppliers_idx_suppliers_name");
    table.index(["user_id"], "suppliers_idx_suppliers_user");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
  });

  await createTableIfMissing(knexOrDb, "products", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("category_id", 36).notNullable();
    table.string("name", 100).notNullable();
    table.text("photo_url").defaultTo("");
    table.text("barcode").defaultTo("");
    table.text("description").defaultTo("");
    table.decimal("cost_price", 10, 2).notNullable();
    table.check("cost_price >= 0");
    table.decimal("unit_price", 10, 2).notNullable();
    table.check("unit_price >= 0");
    table.integer("stock_quantity").notNullable().defaultTo(0);
    table.integer("low_stock_threshold").notNullable().defaultTo(5);
    table.check("stock_quantity >= 0");
    table.integer("is_active").defaultTo(1);
    table.timestamp("created_at").defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    table.index(["name"], "products_idx_products_name");
    table.index(["user_id"], "products_idx_products_user");
    table.index(["category_id"], "products_fk_products_category");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
    table
      .foreign(["category_id"])
      .references(["id"])
      .inTable("product_categories");
  });

  await createTableIfMissing(knexOrDb, "inventory", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("supplier_id", 36).notNullable();
    table.string("product_id", 36).notNullable();
    table.string("product_category_id", 36).notNullable();
    table.integer("quantity").notNullable().defaultTo(0);
    table.check("quantity >= 0");
    table.date("restock_date").notNullable();
    table.timestamp("created_at").defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    table.index(
      ["product_category_id"],
      "inventory_idx_inventory_product_category",
    );
    table.index(["supplier_id"], "inventory_idx_inventory_supplier");
    table.index(["user_id"], "inventory_idx_inventory_user");
    table.index(["product_id"], "inventory_product_id");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
    table
      .foreign(["product_category_id"])
      .references(["id"])
      .inTable("product_categories");
    table.foreign(["product_id"]).references(["id"]).inTable("products");
    table.foreign(["supplier_id"]).references(["id"]).inTable("suppliers");
  });

  await createTableIfMissing(knexOrDb, "notifications", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table
      .text("type")
      .defaultTo("system")
      .checkIn([
        "system",
        "product",
        "inventory",
        "order",
        "sale",
        "report",
        "payment",
        "customer",
        "employee",
      ]);
    table.string("title", 255).notNullable();
    table.text("message").notNullable();
    table.string("reference_type", 100).defaultTo(null);
    table.string("reference_id", 100).defaultTo(null);
    table.integer("is_read").notNullable().defaultTo(0);
    table.timestamp("read_at").defaultTo(null);
    table.timestamp("created_at").notNullable().defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    table.index(["created_at"], "notifications_idx_notifications_created");
    table.index(["type"], "notifications_idx_notifications_type");
    table.index(["is_read"], "notifications_idx_notifications_read");
    table.index(["user_id"], "notifications_idx_notifications_user");
    table
      .foreign(["user_id"])
      .references(["id"])
      .inTable("users")
      .onDelete("CASCADE");
  });

  await createTableIfMissing(knexOrDb, "orders", (table) => {
    table.string("id", 36).primary();
    table.string("customer_id", 36).notNullable();
    table.string("user_id", 36).notNullable();
    table.date("order_date").notNullable();
    table.text("order_details").defaultTo("");
    table.decimal("total_amount", 10, 2).notNullable();
    table.check("total_amount >= 0");
    table
      .text("status")
      .notNullable()
      .defaultTo("pending")
      .checkIn(["pending", "delivered", "failed"]);
    table
      .text("payment_mode")
      .defaultTo("cash")
      .checkIn(["cash", "credit", "momo", "bank", "cheque"]);
    table.timestamp("created_at").defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    table.index(["order_date"], "orders_idx_orders_date");
    table.index(["status"], "orders_idx_orders_status");
    table.index(["customer_id"], "orders_idx_orders_customer");
    table.index(["user_id"], "orders_idx_orders_user");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
    table.foreign(["customer_id"]).references(["id"]).inTable("customers");
  });

  await createTableIfMissing(knexOrDb, "order_items", (table) => {
    table.string("id", 36).primary();
    table.string("order_id", 36).notNullable();
    table.string("product_id", 36).notNullable();
    table.integer("quantity").notNullable().defaultTo(0);
    table.check("quantity > 0");
    table.decimal("unit_price", 10, 2).notNullable();
    table.check("unit_price >= 0");
    table.timestamp("created_at").defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    table.index(["product_id"], "order_items_product_id");
    table.index(["order_id"], "order_items_order_id");
    table.foreign(["product_id"]).references(["id"]).inTable("products");
    table.foreign(["order_id"]).references(["id"]).inTable("orders");
  });

  await createTableIfMissing(knexOrDb, "sales", (table) => {
    table.string("id", 36).primary();
    table.string("customer_id", 36).notNullable();
    table.string("user_id", 36).notNullable();
    table
      .string("receipt_number", 100)
      .notNullable()
      .defaultTo(crypto.randomUUID());
    table.timestamp("date").defaultTo(knexOrDb.fn.now());
    table.text("details").defaultTo("");
    table.decimal("total_amount", 10, 2).notNullable();
    table.check("total_amount >= 0");
    table
      .text("payment_mode")
      .defaultTo("cash")
      .checkIn(["cash", "momo", "bank", "cheque"]);
    table
      .text("status")
      .notNullable()
      .defaultTo("completed")
      .checkIn(["pending", "completed", "failed"]);
    table.timestamp("created_at").defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    table.index(["receipt_number"], "sales_idx_sales_receipt_number");
    table.index(["date"], "sales_idx_sales_date");
    table.index(["status"], "sales_idx_sales_status");
    table.index(["customer_id"], "sales_idx_sales_customer");
    table.index(["user_id"], "sales_idx_sales_user");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
    table.foreign(["customer_id"]).references(["id"]).inTable("customers");
  });

  await createTableIfMissing(knexOrDb, "sale_items", (table) => {
    table.string("id", 36).primary();
    table.string("sales_id", 36).notNullable();
    table.string("product_id", 36).notNullable();
    table.integer("quantity").notNullable().defaultTo(0);
    table.check("quantity >= 0");
    table.decimal("unit_price", 10, 2).notNullable().defaultTo(0.0);
    table.check("unit_price >= 0");
    table.timestamp("created_at").defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    table.index(["product_id"], "sale_items_idx_sales_item_product");
    table.index(["sales_id"], "sale_items_idx_sales_item_sales");
    table.foreign(["product_id"]).references(["id"]).inTable("products");
    table.foreign(["sales_id"]).references(["id"]).inTable("sales");
  });

  await createTableIfMissing(knexOrDb, "settings", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.text("logo").defaultTo("");
    table.string("business_name", 255).defaultTo(null);
    table.text("business_address").defaultTo(null);
    table.string("business_phone", 50).defaultTo(null);
    table.string("business_email", 255).defaultTo(null);
    table.string("currency", 10).defaultTo("GHS");
    table.decimal("tax_rate", 5, 2).defaultTo(0.0);
    table.string("language", 10).defaultTo("en");
    table.string("business_opening_time").defaultTo("08:00");
    table.string("business_closing_time").defaultTo("18:00");
    table.text("business_hours_schedule").defaultTo("[]");
    table.text("business_hours_notes").defaultTo("");
    table.boolean("business_24_7").defaultTo(false);
    table.boolean("eod_report_enabled").defaultTo(true);
    table.string("eod_business_closing_time").defaultTo("18:00");
    table.text("eod_channels").defaultTo('["in_app","email","sms"]');
    table.string("eod_admin_email").nullable();
    table.string("eod_admin_phone").nullable();
    table.string("theme", 20).defaultTo("system");
    table.string("accent_color", 20).defaultTo("blue");
    table.integer("notification_email").defaultTo(1);
    table.integer("notification_push").defaultTo(1);
    table.integer("notification_sms").defaultTo(0);
    table.boolean("stock_audio_alert").defaultTo(true);
    table.float("stock_audio_volume").defaultTo(0.5);
    table.string("stock_audio_tone").defaultTo("chime");
    table.integer("stock_alert_threshold").defaultTo(5);
    table.string("printer_device_name").defaultTo("");
    table.integer("print_after_sale").defaultTo(0);
    table.string("paper_size", 20).defaultTo("thermal_80mm");
    table.timestamp("created_at").defaultTo(knexOrDb.fn.now());
    table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    table.unique(["user_id"], { indexName: "settings_user_id" });
    table
      .foreign(["user_id"])
      .references(["id"])
      .inTable("users")
      .onDelete("CASCADE");
  });

  await createTableIfMissing(knexOrDb, "api_settings", (table) => {
    table.text("id").primary();
    table
      .text("user_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.text("arkessel_api_key");
    table.text("arkessel_sender_id");
    table
      .text("arkessel_base_url")
      .notNullable()
      .defaultTo("https://sms.arkesel.com/api/v2/sms/send");
    table.text("smtp_host").notNullable().defaultTo("smtp.gmail.com");
    table.integer("smtp_port").notNullable().defaultTo(587);
    table.integer("smtp_secure").notNullable().defaultTo(0);
    table.text("smtp_user");
    table.text("smtp_password");
    table.text("smtp_from_name");
    table.text("smtp_from_email");
    table.text("created_at").notNullable().defaultTo(knexOrDb.fn.now());
    table.text("updated_at").notNullable().defaultTo(knexOrDb.fn.now());
  });

  await createTableIfMissing(knexOrDb, "supplier_transactions", (table) => {
    table.string("id").primary();
    table.string("transaction_no").nullable();
    table.string("supplier_id").notNullable();
    table.string("delivered_by").nullable();
    table.datetime("transaction_date").defaultTo(knexOrDb.fn.now());
    table.float("total_amount").defaultTo(0);
    table.float("amount_paid").defaultTo(0);
    table.float("balance").defaultTo(0);
    table.string("payment_mode").defaultTo("cash");
    table.string("status").defaultTo("completed");
    table.text("notes").nullable();
    table.string("user_id").notNullable();
    table.timestamps(true, true);
  });

  await createTableIfMissing(knexOrDb, "supplier_transaction_items", (table) => {
    table.string("id").primary();
    table.string("supplier_transaction_id").notNullable();
    table.string("product_id").nullable();
    table.string("product_name").notNullable();
    table.string("category_name").nullable();
    table.string("product_type").defaultTo("boxes");
    table.integer("quantity").defaultTo(1);
    table.float("unit_price").defaultTo(0);
    table.float("total_price").defaultTo(0);
    table.timestamps(true, true);
  });

  await createTableIfMissing(knexOrDb, "user_sessions", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.text("token").defaultTo(null);
    table.string("device_name", 255).defaultTo(null);
    table.string("device_type", 50).defaultTo(null);
    table.string("browser", 100).defaultTo(null);
    table.string("operating_system", 100).defaultTo(null);
    table.string("ip_address", 45).defaultTo(null);
    table.integer("is_active").notNullable().defaultTo(1);
    table.timestamp("last_activity_at").defaultTo(null);
    table.timestamp("expires_at").notNullable().defaultTo(knexOrDb.fn.now());
    table.timestamp("created_at").notNullable().defaultTo(knexOrDb.fn.now());
    table.index(["expires_at"], "user_sessions_idx_sessions_expires");
    table.index(["is_active"], "user_sessions_idx_sessions_active");
    table.index(["user_id"], "user_sessions_idx_sessions_user");
    table
      .foreign(["user_id"])
      .references(["id"])
      .inTable("users")
      .onDelete("CASCADE");
  });
}

export async function ensureBaseTables(knexOrDb: Knex): Promise<void> {
  if (baseSchemaPromise) {
    return baseSchemaPromise;
  }

  baseSchemaPromise = initBaseTables(knexOrDb).catch((err) => {
    baseSchemaPromise = null;
    throw err;
  });

  return baseSchemaPromise;
}
