import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // --- Table: activity_logs ---
  await knex.schema.createTableIfNotExists("activity_logs", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("activity_type", 100).notNullable();
    table.string("title", 255).notNullable();
    table.text("description").defaultTo(null);
    table.text("metadata").defaultTo(null);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["created_at"], "activity_logs_idx_activity_created");
    table.index(["activity_type"], "activity_logs_idx_activity_type");
    table.index(["user_id"], "activity_logs_idx_activity_user");
    table
      .foreign(["user_id"])
      .references(["id"])
      .inTable("users")
      .onDelete("CASCADE");
  });

  // --- Table: audit_logs ---
  await knex.schema.createTableIfNotExists("audit_logs", (table) => {
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
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
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

  // --- Table: customers ---
  await knex.schema.createTableIfNotExists("customers", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("name", 100).notNullable();
    table.string("email", 255).defaultTo(null);
    table.string("address", 255).defaultTo(null);
    table.string("phonenumber", 100).defaultTo(null);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.index(["name"], "customers_idx_customers_name");
    table.index(["user_id"], "customers_idx_customers_user");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
  });

  // --- Table: inventory ---
  await knex.schema.createTableIfNotExists("inventory", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("supplier_id", 36).notNullable();
    table.string("product_id", 36).notNullable();
    table.string("product_category_id", 36).notNullable();
    table.integer("quantity").notNullable().defaultTo(0);
    table.check("quantity >= 0");
    table.date("restock_date").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
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

  // --- Table: notifications ---
  await knex.schema.createTableIfNotExists("notifications", (table) => {
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
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
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

  // --- Table: orders ---
  await knex.schema.createTableIfNotExists("orders", (table) => {
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
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.index(["order_date"], "orders_idx_orders_date");
    table.index(["status"], "orders_idx_orders_status");
    table.index(["customer_id"], "orders_idx_orders_customer");
    table.index(["user_id"], "orders_idx_orders_user");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
    table.foreign(["customer_id"]).references(["id"]).inTable("customers");
  });

  // --- Table: order_items ---
  await knex.schema.createTableIfNotExists("order_items", (table) => {
    table.string("id", 36).primary();
    table.string("order_id", 36).notNullable();
    table.string("product_id", 36).notNullable();
    table.integer("quantity").notNullable().defaultTo(0);
    table.check("quantity > 0");
    table.decimal("unit_price", 10, 2).notNullable();
    table.check("unit_price >= 0");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.index(["product_id"], "order_items_product_id");
    table.index(["order_id"], "order_items_order_id");
    table.foreign(["product_id"]).references(["id"]).inTable("products");
    table.foreign(["order_id"]).references(["id"]).inTable("orders");
  });

  // --- Table: products ---
  await knex.schema.createTableIfNotExists("products", (table) => {
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
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.index(["name"], "products_idx_products_name");
    table.index(["user_id"], "products_idx_products_user");
    table.index(["category_id"], "products_fk_products_category");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
    table
      .foreign(["category_id"])
      .references(["id"])
      .inTable("product_categories");
  });

  // --- Table: product_categories ---
  await knex.schema.createTableIfNotExists("product_categories", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("name", 100).notNullable();
    table.text("description").defaultTo(null);
    table.integer("is_active").notNullable().defaultTo(1);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
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

  // --- Table: sales ---
  await knex.schema.createTableIfNotExists("sales", (table) => {
    table.string("id", 36).primary();
    table.string("customer_id", 36).notNullable();
    table.string("user_id", 36).notNullable();
    table
      .string("receipt_number", 100)
      .notNullable()
      .defaultTo(crypto.randomUUID());
    table.timestamp("date").defaultTo(knex.fn.now());
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
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.index(["receipt_number"], "sales_idx_sales_receipt_number");
    table.index(["date"], "sales_idx_sales_date");
    table.index(["status"], "sales_idx_sales_status");
    table.index(["customer_id"], "sales_idx_sales_customer");
    table.index(["user_id"], "sales_idx_sales_user");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
    table.foreign(["customer_id"]).references(["id"]).inTable("customers");
  });

  // --- Table: sale_items ---
  await knex.schema.createTableIfNotExists("sale_items", (table) => {
    table.string("id", 36).primary();
    table.string("sales_id", 36).notNullable();
    table.string("product_id", 36).notNullable();
    table.integer("quantity").notNullable().defaultTo(0);
    table.check("quantity >= 0");
    table.decimal("unit_price", 10, 2).notNullable().defaultTo(0.0);
    table.check("unit_price >= 0");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.index(["product_id"], "sale_items_idx_sales_item_product");
    table.index(["sales_id"], "sale_items_idx_sales_item_sales");
    table.foreign(["product_id"]).references(["id"]).inTable("products");
    table.foreign(["sales_id"]).references(["id"]).inTable("sales");
  });

  // --- Table: settings ---
  await knex.schema.createTableIfNotExists("settings", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table
      .text("logo")
      .defaultTo(
        `data:image/png;base64,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`,
      );
    table.string("business_name", 255).defaultTo(null);
    table.text("business_address").defaultTo(null);
    table.string("business_phone", 50).defaultTo(null);
    table.string("business_email", 255).defaultTo(null);
    table.string("currency", 10).defaultTo("GHS");
    table.decimal("tax_rate", 5, 2).defaultTo(0.0);
    table.string("language", 10).defaultTo("en");
    table.string("business_opening_time").defaultTo("08:00");
    table.string("business_closing_time").defaultTo("18:00");
    table.text("business_hours_schedule").defaultTo(
      JSON.stringify([
        {
          day: "monday",
          label: "Monday",
          closed: false,
          openTime: "08:00",
          closeTime: "18:00",
        },
        {
          day: "tuesday",
          label: "Tuesday",
          closed: false,
          openTime: "08:00",
          closeTime: "18:00",
        },
        {
          day: "wednesday",
          label: "Wednesday",
          closed: false,
          openTime: "08:00",
          closeTime: "18:00",
        },
        {
          day: "thursday",
          label: "Thursday",
          closed: false,
          openTime: "08:00",
          closeTime: "18:00",
        },
        {
          day: "friday",
          label: "Friday",
          closed: false,
          openTime: "08:00",
          closeTime: "18:00",
        },
        {
          day: "saturday",
          label: "Saturday",
          closed: false,
          openTime: "09:00",
          closeTime: "16:00",
        },
        {
          day: "sunday",
          label: "Sunday",
          closed: true,
          openTime: "09:00",
          closeTime: "16:00",
        },
      ]),
    );
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
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.unique(["user_id"], { indexName: "settings_user_id" });
    table
      .foreign(["user_id"])
      .references(["id"])
      .inTable("users")
      .onDelete("CASCADE");
  });

  await knex.schema.createTable("api_settings", (table) => {
    table.text("id").primary();

    table
      .text("user_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    // Arkessel SMS
    table.text("arkessel_api_key");
    table.text("arkessel_sender_id");

    table
      .text("arkessel_base_url")
      .notNullable()
      .defaultTo("https://sms.arkesel.com/api/v2/sms/send");

    // Gmail SMTP / Nodemailer
    table.text("smtp_host").notNullable().defaultTo("smtp.gmail.com");

    table.integer("smtp_port").notNullable().defaultTo(587);

    // SQLite boolean: 0 = false, 1 = true
    table.integer("smtp_secure").notNullable().defaultTo(0);

    table.text("smtp_user");
    table.text("smtp_password");
    table.text("smtp_from_name");
    table.text("smtp_from_email");

    table.text("created_at").notNullable().defaultTo(knex.fn.now());

    table.text("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("eod_dispatch_locks", (table) => {
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

  await knex.schema.createTableIfNotExists("broadcast_messages", (table) => {
    table.string("id").primary();
    table.string("sender_id").notNullable();
    table.string("sender_name").notNullable();
    table.string("recipient_group").notNullable();
    table.string("channel").notNullable();
    table.string("subject").nullable();
    table.text("content").notNullable();
    table.integer("recipient_count").defaultTo(0);
    table.string("status").defaultTo("sent");
    table.datetime("created_at").defaultTo(knex.fn.now());
  });

  // --- Table: suppliers ---
  await knex.schema.createTableIfNotExists("suppliers", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("name", 100).notNullable();
    table.string("email", 100).defaultTo(null);
    table.string("company_name", 255).defaultTo(null);
    table.string("address", 255).defaultTo(null);
    table.string("phonenumber", 100).defaultTo(null);
    table.integer("is_active").defaultTo(1);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.index(["name"], "suppliers_idx_suppliers_name");
    table.index(["user_id"], "suppliers_idx_suppliers_user");
    table.foreign(["user_id"]).references(["id"]).inTable("users");
  });

  await knex.schema.createTableIfNotExists("supplier_transactions", (table) => {
    table.string("id").primary();
    table.string("transaction_no").nullable();
    table.string("supplier_id").notNullable();
    table.string("delivered_by").nullable();
    table.datetime("transaction_date").defaultTo(knex.fn.now());
    table.float("total_amount").defaultTo(0);
    table.float("amount_paid").defaultTo(0);
    table.float("balance").defaultTo(0);
    table.string("payment_mode").defaultTo("cash");
    table.string("status").defaultTo("completed");
    table.text("notes").nullable();
    table.string("user_id").notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTableIfNotExists(
    "supplier_transaction_items",
    (table) => {
      table.string("id").primary();
      table.string("supplier_transaction_id").notNullable();
      table.string("product_id").nullable();
      table.string("product_name").notNullable();
      table.string("category_name").nullable();
      table.string("product_type").defaultTo("boxes"); // e.g., boxes, sachets, packs
      table.integer("quantity").defaultTo(1);
      table.float("unit_price").defaultTo(0);
      table.float("total_price").defaultTo(0);
      table.timestamps(true, true);
    },
  );

  // --- Table: users ---
  await knex.schema.createTableIfNotExists("users", (table) => {
    // Use a native UUID generator if your database supports it, or stick to a indexed string
    table.string("id", 36).primary();

    // Authentication & Credentials

    table.string("username", 100).notNullable().unique();
    table.string("email", 255).notNullable().unique(); // Expanded to 255 per RFC standards
    table.string("password_hash", 255).nullable(); // Stores Bcrypt/Argon2 hashes

    // Profile Information
    table.string("firstname", 100).notNullable().defaultTo("");
    table.string("lastname", 100).notNullable().defaultTo("");
    table.string("phonenumber", 15).nullable();

    // Roles & Permissions (Optimized enum)
    table.enum("role", ["admin", "member"]).notNullable().defaultTo("member");
    table.integer("failed_login_attempts").defaultTo(0);
    table.datetime("locked_until").nullable();
    table.timestamp("last_login_at").nullable();
    // Timestamps (Auto-updating)
    table.timestamps(true, true);
  });

  // --- Table: user_sessions ---
  await knex.schema.createTableIfNotExists("user_sessions", (table) => {
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
    table.timestamp("expires_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["expires_at"], "user_sessions_idx_sessions_expires");
    table.index(["is_active"], "user_sessions_idx_sessions_active");
    table.index(["user_id"], "user_sessions_idx_sessions_user");
    table
      .foreign(["user_id"])
      .references(["id"])
      .inTable("users")
      .onDelete("CASCADE");
  });

  await knex.schema.createTableIfNotExists("daily_sales_reports", (table) => {
    table.string("id").primary();
    table.string("report_date").notNullable().unique();
    table.datetime("generated_at").defaultTo(knex.fn.now());
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

  // ==========================================
  // VIEWS SETUP (unchanged, already matching)
  // ==========================================

  await knex.schema.raw(`CREATE VIEW v_activity_logs AS
SELECT
  al.id              AS id,
  u.username         AS user_name,
  al.activity_type   AS activity_type,
  al.title           AS title,
  al.description     AS description,
  al.metadata        AS metadata,
  al.created_at      AS created_at
FROM activity_logs al
JOIN users u ON al.user_id = u.id;`);

  await knex.raw(`
  CREATE VIEW  v_audit_logs AS
  SELECT al.id AS id, al.user_id AS user_id, u.username AS user_name,
         al.entity_type AS entity_type, al.entity_id AS entity_id,
         al.action AS action, al.old_values AS old_values,
         al.new_values AS new_values, al.ip_address AS ip_address,
         al.user_agent AS user_agent, al.created_at AS created_at
  FROM audit_logs al
  LEFT JOIN users u ON al.user_id = u.id
`);

  await knex.raw(`
  CREATE VIEW  v_customer_info AS
  SELECT c.id AS customer_id, c.name AS customer_name, c.email AS email,
         c.address AS address, c.phonenumber AS phonenumber,
         u.username AS user_name, u.id AS user_id,
         c.created_at AS created_at, c.updated_at AS updated_at
  FROM customers c
  JOIN users u ON c.user_id = u.id
`);

  await knex.raw(`
  CREATE VIEW  v_inventory_product_details AS
  SELECT i.id AS inventory_id, i.quantity AS restock_quantity,
         i.restock_date AS restock_date,
         i.created_at AS inventory_created_at,
         i.updated_at AS inventory_updated_at,
         u.id AS user_id, u.username AS user_name, u.email AS user_email,
         s.name AS supplier_name,
         p.id AS product_id, p.name AS product_name,
         p.cost_price AS cost_price, p.unit_price AS unit_price,
         p.stock_quantity * p.cost_price AS cost_value,
         p.stock_quantity * p.unit_price AS stock_value,
         p.stock_quantity AS current_stock,
         pc.id AS category_id, pc.name AS category_name,
         pc.is_active AS category_active
  FROM inventory i
  JOIN users u ON i.user_id = u.id
  JOIN products p ON i.product_id = p.id
  JOIN product_categories pc ON i.product_category_id = pc.id
  JOIN suppliers s ON i.supplier_id = s.id
`);

  await knex.raw(`
  CREATE VIEW  v_inventory_restock AS
  SELECT i.id AS inventory_id, u.username AS user_name,
         s.name AS supplier_name, pc.name AS category_name,
         i.quantity AS restock_quantity, i.restock_date AS restock_date,
         i.created_at AS created_at, i.updated_at AS updated_at
  FROM inventory i
  JOIN users u ON i.user_id = u.id
  JOIN suppliers s ON i.supplier_id = s.id
  JOIN product_categories pc ON i.product_category_id = pc.id
`);

  await knex.raw(`
  CREATE VIEW  v_inventory_stock_status AS
  SELECT p.id AS product_id, p.name AS product_name,
         p.stock_quantity AS stock_quantity,
         pc.name AS category_name, u.username AS user_name,
         p.unit_price AS unit_price, p.cost_price AS cost_price,
         p.stock_quantity * p.unit_price AS stock_value,
         p.stock_quantity * p.cost_price AS cost_value,
         p.created_at AS created_at, p.updated_at AS updated_at
  FROM products p
  JOIN product_categories pc ON p.category_id = pc.id
  JOIN users u ON p.user_id = u.id
`);

  await knex.raw(`
  CREATE VIEW  v_monthly_revenue AS
  SELECT v_unified_transactions.user_id AS user_id,
         v_unified_transactions.user_name AS user_name,
         strftime('%Y-%m', v_unified_transactions.transaction_date) AS month,
         SUM(v_unified_transactions.total_amount) AS total_revenue,
         COUNT(0) AS transaction_count
  FROM v_unified_transactions
  GROUP BY v_unified_transactions.user_id,
           v_unified_transactions.user_name,
           strftime('%Y-%m', v_unified_transactions.transaction_date)
`);

  await knex.raw(`
  CREATE VIEW  v_notifications AS
  SELECT n.id AS id, u.username AS user_name, n.type AS type,
         n.title AS title, n.message AS message,
         n.reference_type AS reference_type, n.reference_id AS reference_id,
         n.is_read AS is_read, n.read_at AS read_at,
         n.created_at AS created_at
  FROM notifications n
  JOIN users u ON n.user_id = u.id
`);

  await knex.raw(`
  CREATE VIEW  v_order_items_detail AS
  SELECT oi.id AS order_item_id, o.id AS order_id,
         p.name AS product_name,
         oi.quantity AS quantity, oi.unit_price AS unit_price,
         oi.quantity * oi.unit_price AS subtotal,
         o.order_date AS order_date, c.name AS customer_name,
         u.username AS user_name, u.id AS user_id
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  JOIN products p ON oi.product_id = p.id
  JOIN customers c ON o.customer_id = c.id
  JOIN users u ON o.user_id = u.id
`);

  await knex.raw(`
  CREATE VIEW  v_order_summary AS
  SELECT o.id AS order_id, c.name AS customer_name,
         u.username AS user_name, o.order_date AS order_date,
         o.total_amount AS total_amount, o.status AS status,
         o.payment_mode AS payment_mode, o.order_details AS order_details,
         (SELECT COUNT(0) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         o.created_at AS created_at, o.updated_at AS updated_at
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  JOIN users u ON o.user_id = u.id
`);

  await knex.raw(`
  CREATE VIEW  v_product_catalog AS
  SELECT p.id AS product_id, p.name AS product_name,
         p.description AS description,
         p.photo_url AS photo_url,
         p.barcode AS barcode,
         p.cost_price AS cost_price, p.unit_price AS unit_price,
         p.stock_quantity * p.unit_price AS stock_value,
         p.stock_quantity AS stock_quantity,
         pc.name AS category_name, pc.id AS category_id,
         u.username AS user_name, u.id AS user_id,
         p.is_active AS active,
         p.created_at AS created_at, p.updated_at AS updated_at
  FROM products p
  JOIN product_categories pc ON p.category_id = pc.id
  JOIN users u ON p.user_id = u.id
`);

  await knex.raw(`
  CREATE VIEW  v_product_sales_performance AS
  SELECT p.id AS product_id, p.name AS product_name,
         p.user_id AS user_id,
         COALESCE(SUM(oi.quantity), 0) AS total_ordered_qty,
         COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_order_revenue,
         COALESCE(SUM(si.quantity), 0) AS total_sold_qty,
         COALESCE(SUM(si.quantity * si.unit_price), 0) AS total_sale_revenue,
         COALESCE(SUM(oi.quantity), 0) + COALESCE(SUM(si.quantity), 0) AS total_movement
  FROM products p
  LEFT JOIN order_items oi ON p.id = oi.product_id
  LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'delivered'
  LEFT JOIN sale_items si ON p.id = si.product_id
  LEFT JOIN sales s ON si.sales_id = s.id AND s.status = 'completed'
  GROUP BY p.id, p.name, p.user_id
`);

  await knex.raw(`
  CREATE VIEW  v_sales_summary AS
  SELECT CAST(sales.date AS DATE) AS sale_date,
         COUNT(0) AS total_sales,
         SUM(sales.total_amount) AS total_revenue
  FROM sales
  GROUP BY CAST(sales.date AS DATE)
`);

  await knex.raw(`
  CREATE VIEW  v_sale_items_detail AS
  SELECT si.id AS sale_item_id, s.id AS sale_id,
         si.product_id AS product_id, p.name AS product_name,
         si.quantity AS quantity, si.unit_price AS unit_price,
         si.quantity * si.unit_price AS subtotal,
         s.date AS sale_date, s.status AS status,
         c.name AS customer_name,
         u.username AS user_name, u.id AS user_id
  FROM sale_items si
  JOIN sales s ON si.sales_id = s.id
  JOIN products p ON si.product_id = p.id
  JOIN customers c ON s.customer_id = c.id
  JOIN users u ON s.user_id = u.id
`);

  await knex.raw(`
  CREATE VIEW  v_sale_summary AS
  SELECT s.id AS sale_id, s.customer_id AS customer_id,
         s.user_id AS user_id, s.receipt_number AS receipt_number,
         c.name AS customer_name, c.phonenumber AS phonenumber,
         u.username AS user_name, s.date AS sale_date,
         s.total_amount AS total_amount, s.payment_mode AS payment_mode,
         s.status AS status, s.details AS details,
         COALESCE(si.total_items, 0) AS item_count,
         s.created_at AS created_at, s.updated_at AS updated_at
  FROM sales s
  JOIN customers c ON s.customer_id = c.id
  JOIN users u ON s.user_id = u.id
  LEFT JOIN (
    SELECT sales_id, COUNT(0) AS total_items
    FROM sale_items
    GROUP BY sales_id
  ) si ON s.id = si.sales_id
`);

  await knex.raw(`
  CREATE VIEW  v_supplier_info AS
  SELECT s.id AS supplier_id, s.name AS supplier_name,
         s.email AS email, s.company_name AS company_name,
         s.address AS address, s.phonenumber AS phonenumber,
         u.username AS user_name, u.id AS user_id,
         s.created_at AS created_at, s.updated_at AS updated_at,
         s.is_active AS is_active
  FROM suppliers s
  JOIN users u ON s.user_id = u.id
`);

  await knex.raw(`
  CREATE VIEW  v_unified_transactions AS
  SELECT 'order' AS transaction_type,
         o.id AS transaction_id,
         o.customer_id AS customer_id,
         c.name AS customer_name,
         o.user_id AS user_id,
         u.username AS user_name,
         o.order_date AS transaction_date,
         o.total_amount AS total_amount,
         o.status AS status,
         o.payment_mode AS payment_mode,
         o.created_at AS created_at,
         o.updated_at AS updated_at
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  JOIN users u ON o.user_id = u.id
  WHERE o.status = 'delivered'

  UNION ALL

  SELECT 'sale' AS transaction_type,
         s.id AS transaction_id,
         s.customer_id AS customer_id,
         c.name AS customer_name,
         s.user_id AS user_id,
         u.username AS user_name,
         s.date AS transaction_date,
         s.total_amount AS total_amount,
         s.status AS status,
         s.payment_mode AS payment_mode,
         s.created_at AS created_at,
         s.updated_at AS updated_at
  FROM sales s
  JOIN customers c ON s.customer_id = c.id
  JOIN users u ON s.user_id = u.id
  WHERE s.status = 'completed'
`);

  await knex.raw(`
  CREATE VIEW  v_user_sessions AS
  SELECT us.id AS id, u.username AS user_name,
         us.device_name AS device_name,
         us.device_type AS device_type,
         us.browser AS browser,
         us.operating_system AS operating_system,
         us.ip_address AS ip_address,
         us.is_active AS is_active,
         us.last_activity_at AS last_activity_at,
         us.expires_at AS expires_at,
         us.created_at AS created_at
  FROM user_sessions us
  JOIN users u ON us.user_id = u.id
`);

  await knex.raw(`
        CREATE VIEW IF NOT EXISTS v_supplier_transactions AS
        SELECT 
          st.id AS id,
          st.transaction_no AS transaction_no,
          st.supplier_id AS supplier_id,
          COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
          COALESCE(s.name, 'N/A') AS company_name,
          st.delivered_by AS delivered_by,
          st.transaction_date AS transaction_date,
          st.total_amount AS total_amount,
          st.amount_paid AS amount_paid,
          st.balance AS balance,
          st.payment_mode AS payment_mode,
          st.status AS status,
          st.notes AS notes,
          st.user_id AS user_id,
          COALESCE(u.username, 'Admin') AS user_name,
          (SELECT COUNT(*) FROM supplier_transaction_items sti WHERE sti.supplier_transaction_id = st.id) AS total_items_count,
          st.created_at AS created_at,
          st.updated_at AS updated_at
          FROM supplier_transactions st
          LEFT JOIN suppliers s ON st.supplier_id = s.id
          LEFT JOIN users u ON st.user_id = u.id
          `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropViewIfExists("v_user_sessions");
  await knex.schema.dropViewIfExists("v_unified_transactions");
  await knex.schema.dropViewIfExists("v_supplier_info");
  await knex.schema.dropViewIfExists("v_sale_summary");
  await knex.schema.dropViewIfExists("v_sale_items_detail");
  await knex.schema.dropViewIfExists("v_sales_summary");
  await knex.schema.dropViewIfExists("v_product_sales_performance");
  await knex.schema.dropViewIfExists("v_product_catalog");
  await knex.schema.dropViewIfExists("v_order_summary");
  await knex.schema.dropViewIfExists("v_order_items_detail");
  await knex.schema.dropViewIfExists("v_notifications");
  await knex.schema.dropViewIfExists("v_monthly_revenue");
  await knex.schema.dropViewIfExists("v_inventory_stock_status");
  await knex.schema.dropViewIfExists("v_inventory_restock");
  await knex.schema.dropViewIfExists("v_inventory_product_details");
  await knex.schema.dropViewIfExists("v_customer_info");
  await knex.schema.dropViewIfExists("v_supplier_transactions");
  await knex.schema.dropViewIfExists("v_audit_logs");
  await knex.schema.dropViewIfExists("v_activity_logs");
  await knex.schema.dropTableIfExists("user_sessions");
  await knex.schema.dropTableIfExists("users");
  await knex.schema.dropTableIfExists("suppliers");
  await knex.schema.dropTableIfExists("settings");
  await knex.schema.dropTableIfExists("sale_items");
  await knex.schema.dropTableIfExists("sales");
  await knex.schema.dropTableIfExists("product_categories");
  await knex.schema.dropTableIfExists("products");
  await knex.schema.dropTableIfExists("order_items");
  await knex.schema.dropTableIfExists("orders");
  await knex.schema.dropTableIfExists("notifications");
  await knex.schema.dropTableIfExists("inventory");
  await knex.schema.dropTableIfExists("customers");
  await knex.schema.dropTableIfExists("audit_logs");
  await knex.schema.dropTableIfExists("broadcast_messages");
  await knex.schema.dropTableIfExists("activity_logs");
  await knex.schema.dropTableIfExists("eod_dispatch_locks");
  await knex.schema.dropTableIfExists("api_settings");
  await knex.schema.dropTableIfExists("daily_sales_reports");
  await knex.schema.dropTableIfExists("supplier_transactions");
  await knex.schema.dropTableIfExists("supplier_transactions_items");
}
