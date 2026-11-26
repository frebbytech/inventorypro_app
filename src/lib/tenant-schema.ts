import type { Knex } from "knex";

export const DEFAULT_TENANT_ID = "default-tenant";
export const DEFAULT_TENANT_NAME = "Inventory Pro";
export const DEFAULT_TENANT_SLUG = "inventory-pro";

const TENANT_SCOPED_TABLES = [
  "users",
  "product_categories",
  "products",
  "customers",
  "suppliers",
  "supplier_transactions",
  "supplier_transaction_items",
  "orders",
  "order_items",
  "inventory",
  "sales",
  "sale_items",
  "settings",
  "api_settings",
  "notifications",
  "broadcast_messages",
  "daily_sales_reports",
  "eod_dispatch_locks",
  "audit_logs",
  "activity_logs",
  "user_sessions",
  "two_factor_codes",
] as const;

export function normalizeSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || `store-${Date.now().toString(36)}`;
}

export function normalizeTenantAccessMode(
  raw: unknown,
): "both" | "mobile_only" | "web_only" {
  if (raw === "mobile_only" || raw === "web_only" || raw === "both") {
    return raw;
  }
  return "both";
}

async function addColumnIfMissing(
  knexOrDb: Knex,
  tableName: string,
  columnName: string,
  alterFn: (table: Knex.AlterTableBuilder) => void,
) {
  const hasTable = await knexOrDb.schema.hasTable(tableName);
  if (!hasTable) return;
  const hasCol = await knexOrDb.schema.hasColumn(tableName, columnName);
  if (!hasCol) {
    await knexOrDb.schema.alterTable(tableName, alterFn);
  }
}

async function getSqliteTableSql(
  knexOrDb: Knex,
  tableName: string,
): Promise<string> {
  const row = await knexOrDb("sqlite_master")
    .where({ type: "table", name: tableName })
    .first("sql")
    .catch(() => null);
  return String(row?.sql || "");
}

async function rebuildUsersForMultiTenancy(knexOrDb: Knex) {
  // Drop any standalone single-column unique index on `users(username)` created by Knex in SQLite
  const userIndexRows = await knexOrDb("sqlite_master")
    .where({ type: "index", tbl_name: "users" })
    .whereNotNull("sql")
    .select("name", "sql")
    .catch(() => []);

  for (const idx of userIndexRows) {
    const idxSql = String(idx.sql || "");
    const idxName = String(idx.name || "");
    const isSingleUsernameUnique =
      /create\s+unique\s+index/i.test(idxSql) &&
      /\(\s*[`"\[]?username[`"\]]?\s*\)/i.test(idxSql);
    if (idxName === "users_username_unique" || isSingleUsernameUnique) {
      await knexOrDb
        .raw(`DROP INDEX IF EXISTS "${idxName.replace(/"/g, '""')}"`)
        .catch(() => {});
    }
  }

  const sql = await getSqliteTableSql(knexOrDb, "users");
  const hasGlobalUsernameUnique =
    /`?username`?\s+varchar\([^)]+\)\s+not\s+null\s+unique/i.test(sql) ||
    /unique\s*\(\s*`?username`?\s*\)/i.test(sql);

  if (!sql || !hasGlobalUsernameUnique) {
    await knexOrDb
      .raw(
        `CREATE UNIQUE INDEX IF NOT EXISTS users_uq_tenant_username ON users(tenant_id, username)`,
      )
      .catch(() => {});
    return;
  }

  await knexOrDb.raw("PRAGMA foreign_keys = OFF").catch(() => {});
  try {
    await knexOrDb.raw(`DROP TABLE IF EXISTS users_mt_tmp`);
    await knexOrDb.schema.createTable("users_mt_tmp", (table) => {
      table.string("id", 36).primary();
      table
        .string("tenant_id", 64)
        .notNullable()
        .defaultTo(DEFAULT_TENANT_ID);
      table.string("username", 100).notNullable();
      table.string("email", 255).notNullable().unique();
      table.string("password_hash", 255).nullable();
      table.string("firstname", 100).notNullable().defaultTo("");
      table.string("lastname", 100).notNullable().defaultTo("");
      table.string("phonenumber", 15).nullable();
      table.enum("role", ["admin", "member"]).notNullable().defaultTo("member");
      table.integer("failed_login_attempts").defaultTo(0);
      table.datetime("locked_until").nullable();
      table.timestamp("last_login_at").nullable();
      table.boolean("two_factor_enabled").notNullable().defaultTo(false);
      table.string("two_factor_method", 20).notNullable().defaultTo("email");
      table.timestamp("two_factor_updated_at").nullable();
      table.timestamps(true, true);
      table.unique(["tenant_id", "username"], {
        indexName: "users_uq_tenant_username",
      });
      table.index(["tenant_id"], "users_idx_tenant");
    });

    const colsInfo = await knexOrDb.raw(`PRAGMA table_info(users)`);
    const existingCols = new Set(
      (Array.isArray(colsInfo) ? colsInfo : colsInfo?.rows || []).map(
        (c: any) => String(c.name),
      ),
    );

    const targetCols = [
      "id",
      "tenant_id",
      "username",
      "email",
      "password_hash",
      "firstname",
      "lastname",
      "phonenumber",
      "role",
      "failed_login_attempts",
      "locked_until",
      "last_login_at",
      "two_factor_enabled",
      "two_factor_method",
      "two_factor_updated_at",
      "created_at",
      "updated_at",
    ].filter((c) => existingCols.has(c));

    const selectCols = targetCols.map((c) =>
      c === "tenant_id"
        ? `COALESCE(tenant_id, '${DEFAULT_TENANT_ID}') as tenant_id`
        : `"${c}"`,
    );

    await knexOrDb.raw(
      `INSERT INTO users_mt_tmp (${targetCols.map((c) => `"${c}"`).join(", ")}) SELECT ${selectCols.join(", ")} FROM users`,
    );
    await knexOrDb.raw(`DROP TABLE users`);
    await knexOrDb.raw(`ALTER TABLE users_mt_tmp RENAME TO users`);
  } finally {
    await knexOrDb.raw("PRAGMA foreign_keys = ON").catch(() => {});
  }
}

async function rebuildTableWithCompositeUnique(knexOrDb: Knex) {
  await knexOrDb
    .raw(`DROP INDEX IF EXISTS product_categories_uq_category_name_per_user`)
    .catch(() => {});
  await knexOrDb
    .raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_categories_uq_tenant_name ON product_categories(tenant_id, name)`,
    )
    .catch(() => {});

  await knexOrDb
    .raw(`DROP INDEX IF EXISTS daily_sales_reports_report_date_unique`)
    .catch(() => {});

  const reportSql = await getSqliteTableSql(knexOrDb, "daily_sales_reports");
  if (
    reportSql &&
    (/`?report_date`?\s+varchar\([^)]+\)\s+not\s+null\s+unique/i.test(reportSql) ||
      /unique\s*\(\s*`?report_date`?\s*\)/i.test(reportSql))
  ) {
    await knexOrDb.raw("PRAGMA foreign_keys = OFF").catch(() => {});
    try {
      await knexOrDb.raw(`DROP TABLE IF EXISTS daily_sales_reports_mt_tmp`);
      await knexOrDb.schema.createTable("daily_sales_reports_mt_tmp", (table) => {
        table.string("id").primary();
        table
          .string("tenant_id", 64)
          .notNullable()
          .defaultTo(DEFAULT_TENANT_ID);
        table.string("report_date").notNullable();
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
        table.unique(["tenant_id", "report_date"], {
          indexName: "daily_sales_reports_uq_tenant_date",
        });
        table.index(["tenant_id"], "daily_sales_reports_idx_tenant");
      });

      await knexOrDb.raw(`
        INSERT INTO daily_sales_reports_mt_tmp (
          id, tenant_id, report_date, generated_at, total_sales_amount,
          total_transactions, completed_transactions, cancelled_transactions,
          total_items_sold, total_cost, gross_profit, payment_breakdown,
          top_products, cashier_summary, status, dispatch_logs, created_by,
          created_at, updated_at
        )
        SELECT
          id, COALESCE(tenant_id, '${DEFAULT_TENANT_ID}'), report_date,
          generated_at, total_sales_amount, total_transactions,
          completed_transactions, cancelled_transactions, total_items_sold,
          total_cost, gross_profit, payment_breakdown, top_products,
          cashier_summary, status, dispatch_logs, created_by, created_at, updated_at
        FROM daily_sales_reports
      `);
      await knexOrDb.raw(`DROP TABLE daily_sales_reports`);
      await knexOrDb.raw(
        `ALTER TABLE daily_sales_reports_mt_tmp RENAME TO daily_sales_reports`,
      );
    } finally {
      await knexOrDb.raw("PRAGMA foreign_keys = ON").catch(() => {});
    }
  } else {
    await knexOrDb
      .raw(
        `CREATE UNIQUE INDEX IF NOT EXISTS daily_sales_reports_uq_tenant_date ON daily_sales_reports(tenant_id, report_date)`,
      )
      .catch(() => {});
  }

  const lockSql = await getSqliteTableSql(knexOrDb, "eod_dispatch_locks");
  if (
    lockSql &&
    (/`?report_date`?\s+text\s+not\s+null\s+primary\s+key/i.test(lockSql) ||
      /primary\s+key\s*\(\s*`?report_date`?\s*\)/i.test(lockSql))
  ) {
    await knexOrDb.raw("PRAGMA foreign_keys = OFF").catch(() => {});
    try {
      await knexOrDb.raw(`DROP TABLE IF EXISTS eod_dispatch_locks_mt_tmp`);
      await knexOrDb.schema.createTable("eod_dispatch_locks_mt_tmp", (table) => {
        table
          .string("tenant_id", 64)
          .notNullable()
          .defaultTo(DEFAULT_TENANT_ID);
        table.text("report_date").notNullable();
        table
          .text("status")
          .notNullable()
          .defaultTo("processing")
          .checkIn(["processing", "completed", "failed"]);
        table.text("claimed_at").notNullable();
        table.text("completed_at");
        table.text("failed_at");
        table.text("error_message");
        table.primary(["tenant_id", "report_date"]);
      });

      await knexOrDb.raw(`
        INSERT INTO eod_dispatch_locks_mt_tmp (
          tenant_id, report_date, status, claimed_at, completed_at, failed_at, error_message
        )
        SELECT
          COALESCE(tenant_id, '${DEFAULT_TENANT_ID}'), report_date, status, claimed_at, completed_at, failed_at, error_message
        FROM eod_dispatch_locks
      `);
      await knexOrDb.raw(`DROP TABLE eod_dispatch_locks`);
      await knexOrDb.raw(
        `ALTER TABLE eod_dispatch_locks_mt_tmp RENAME TO eod_dispatch_locks`,
      );
    } finally {
      await knexOrDb.raw("PRAGMA foreign_keys = ON").catch(() => {});
    }
  }

  await knexOrDb
    .raw(
      `CREATE INDEX IF NOT EXISTS api_settings_idx_tenant ON api_settings(tenant_id)`,
    )
    .catch(() => {});
}

export async function rebuildTenantScopedViews(knexOrDb: Knex): Promise<void> {
  const sampleViewRow = await knexOrDb("sqlite_master")
    .where({ type: "view", name: "v_product_catalog" })
    .first("sql")
    .catch(() => null);
  const sampleSalesView = await knexOrDb("sqlite_master")
    .where({ type: "view", name: "v_sales_summary" })
    .first("sql")
    .catch(() => null);

  const productViewSql = String(sampleViewRow?.sql || "");
  const salesViewSql = String(sampleSalesView?.sql || "");
  const hasExpectedSqlDefinitions =
    productViewSql.includes("tenant_id") &&
    productViewSql.includes("low_stock_threshold") &&
    productViewSql.includes("photo_url") &&
    productViewSql.includes("barcode") &&
    productViewSql.includes("version") &&
    salesViewSql.includes("tenant_id");

  if (hasExpectedSqlDefinitions) {
    try {
      await Promise.all([
        knexOrDb("v_product_catalog")
          .select(
            "product_id",
            "tenant_id",
            "low_stock_threshold",
            "photo_url",
            "barcode",
            "version",
          )
          .limit(0),
        knexOrDb("v_sales_summary").select("tenant_id", "sale_date").limit(0),
        knexOrDb("v_sale_summary")
          .select("sale_id", "tenant_id", "receipt_number")
          .limit(0),
        knexOrDb("v_supplier_transactions")
          .select("id", "tenant_id", "transaction_no")
          .limit(0),
      ]);
      return;
    } catch {
      // One or more existing views reference outdated/missing columns or tables; rebuild all views.
    }
  }

  const viewsToDrop = [
    "v_user_sessions",
    "v_unified_transactions",
    "v_supplier_transactions",
    "v_supplier_info",
    "v_sale_summary",
    "v_sale_items_detail",
    "v_sales_summary",
    "v_product_sales_performance",
    "v_product_catalog",
    "v_order_summary",
    "v_order_items_detail",
    "v_notifications",
    "v_monthly_revenue",
    "v_inventory_stock_status",
    "v_inventory_restock",
    "v_inventory_product_details",
    "v_customer_info",
    "v_audit_logs",
    "v_activity_logs",
  ];

  for (const viewName of viewsToDrop) {
    await knexOrDb.schema.dropViewIfExists(viewName);
  }

  await knexOrDb.raw(`CREATE VIEW v_activity_logs AS
    SELECT
      al.id            AS id,
      al.tenant_id     AS tenant_id,
      al.user_id       AS user_id,
      u.username       AS user_name,
      al.activity_type AS activity_type,
      al.title         AS title,
      al.description   AS description,
      al.metadata      AS metadata,
      al.created_at    AS created_at
    FROM activity_logs al
    JOIN users u ON al.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_audit_logs AS
    SELECT
      al.id         AS id,
      al.tenant_id  AS tenant_id,
      al.user_id    AS user_id,
      u.username    AS user_name,
      al.entity_type AS entity_type,
      al.entity_id  AS entity_id,
      al.action     AS action,
      al.old_values AS old_values,
      al.new_values AS new_values,
      al.ip_address AS ip_address,
      al.user_agent AS user_agent,
      al.created_at AS created_at
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_customer_info AS
    SELECT
      c.id          AS customer_id,
      c.tenant_id   AS tenant_id,
      c.name        AS customer_name,
      c.email       AS email,
      c.address     AS address,
      c.phonenumber AS phonenumber,
      u.username    AS user_name,
      u.id          AS user_id,
      c.created_at  AS created_at,
      c.updated_at  AS updated_at
    FROM customers c
    JOIN users u ON c.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_inventory_product_details AS
    SELECT
      i.id          AS inventory_id,
      i.tenant_id   AS tenant_id,
      i.quantity    AS restock_quantity,
      i.restock_date AS restock_date,
      i.created_at  AS inventory_created_at,
      i.updated_at  AS inventory_updated_at,
      u.id          AS user_id,
      u.username    AS user_name,
      u.email       AS user_email,
      s.name        AS supplier_name,
      p.id          AS product_id,
      p.name        AS product_name,
      p.cost_price  AS cost_price,
      p.unit_price  AS unit_price,
      p.stock_quantity * p.cost_price AS cost_value,
      p.stock_quantity * p.unit_price AS stock_value,
      p.stock_quantity AS current_stock,
      pc.id         AS category_id,
      pc.name       AS category_name,
      pc.is_active  AS category_active
    FROM inventory i
    JOIN users u ON i.user_id = u.id
    JOIN products p ON i.product_id = p.id
    JOIN product_categories pc ON i.product_category_id = pc.id
    JOIN suppliers s ON i.supplier_id = s.id;`);

  await knexOrDb.raw(`CREATE VIEW v_inventory_restock AS
    SELECT
      i.id           AS inventory_id,
      i.tenant_id    AS tenant_id,
      u.username     AS user_name,
      s.name         AS supplier_name,
      pc.name        AS category_name,
      i.quantity     AS restock_quantity,
      i.restock_date AS restock_date,
      i.created_at   AS created_at,
      i.updated_at   AS updated_at
    FROM inventory i
    JOIN users u ON i.user_id = u.id
    JOIN suppliers s ON i.supplier_id = s.id
    JOIN product_categories pc ON i.product_category_id = pc.id;`);

  await knexOrDb.raw(`CREATE VIEW v_inventory_stock_status AS
    SELECT
      p.id           AS product_id,
      p.tenant_id    AS tenant_id,
      p.name         AS product_name,
      p.stock_quantity AS stock_quantity,
      pc.name        AS category_name,
      u.username     AS user_name,
      p.unit_price   AS unit_price,
      p.cost_price   AS cost_price,
      p.stock_quantity * p.unit_price AS stock_value,
      p.stock_quantity * p.cost_price AS cost_value,
      p.created_at   AS created_at,
      p.updated_at   AS updated_at
    FROM products p
    JOIN product_categories pc ON p.category_id = pc.id
    JOIN users u ON p.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_notifications AS
    SELECT
      n.id             AS id,
      n.tenant_id      AS tenant_id,
      n.user_id        AS user_id,
      u.username       AS user_name,
      n.type           AS type,
      n.title          AS title,
      n.message        AS message,
      n.reference_type AS reference_type,
      n.reference_id   AS reference_id,
      n.is_read        AS is_read,
      n.read_at        AS read_at,
      n.created_at     AS created_at
    FROM notifications n
    JOIN users u ON n.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_order_items_detail AS
    SELECT
      oi.id       AS order_item_id,
      o.tenant_id AS tenant_id,
      o.id        AS order_id,
      p.name      AS product_name,
      oi.quantity AS quantity,
      oi.unit_price AS unit_price,
      oi.quantity * oi.unit_price AS subtotal,
      o.order_date AS order_date,
      c.name      AS customer_name,
      u.username  AS user_name,
      u.id        AS user_id
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    JOIN customers c ON o.customer_id = c.id
    JOIN users u ON o.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_order_summary AS
    SELECT
      o.id            AS order_id,
      o.tenant_id     AS tenant_id,
      c.name          AS customer_name,
      u.username      AS user_name,
      o.order_date    AS order_date,
      o.total_amount  AS total_amount,
      o.status        AS status,
      o.payment_mode  AS payment_mode,
      o.order_details AS order_details,
      (SELECT COUNT(0) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
      o.created_at    AS created_at,
      o.updated_at    AS updated_at
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN users u ON o.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_product_catalog AS
    SELECT
      p.id             AS product_id,
      p.tenant_id      AS tenant_id,
      p.name           AS product_name,
      p.description    AS description,
      p.photo_url      AS photo_url,
      p.barcode        AS barcode,
      p.cost_price     AS cost_price,
      p.unit_price     AS unit_price,
      p.stock_quantity * p.unit_price AS stock_value,
      p.stock_quantity AS stock_quantity,
      p.low_stock_threshold AS low_stock_threshold,
      p.version        AS version,
      pc.name          AS category_name,
      pc.id            AS category_id,
      u.username       AS user_name,
      u.id             AS user_id,
      p.is_active      AS active,
      p.created_at     AS created_at,
      p.updated_at     AS updated_at
    FROM products p
    JOIN product_categories pc ON p.category_id = pc.id
    JOIN users u ON p.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_product_sales_performance AS
    SELECT
      p.id        AS product_id,
      p.tenant_id AS tenant_id,
      p.name      AS product_name,
      p.user_id   AS user_id,
      COALESCE(SUM(oi.quantity), 0) AS total_ordered_qty,
      COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_order_revenue,
      COALESCE(SUM(si.quantity), 0) AS total_sold_qty,
      COALESCE(SUM(si.quantity * si.unit_price), 0) AS total_sale_revenue,
      COALESCE(SUM(oi.quantity), 0) + COALESCE(SUM(si.quantity), 0) AS total_movement
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'delivered' AND o.tenant_id = p.tenant_id
    LEFT JOIN sale_items si ON p.id = si.product_id
    LEFT JOIN sales s ON si.sales_id = s.id AND s.status = 'completed' AND s.tenant_id = p.tenant_id
    GROUP BY p.id, p.tenant_id, p.name, p.user_id;`);

  await knexOrDb.raw(`CREATE VIEW v_sales_summary AS
    SELECT
      sales.tenant_id         AS tenant_id,
      CAST(sales.date AS DATE) AS sale_date,
      COUNT(0)                AS total_sales,
      SUM(sales.total_amount) AS total_revenue
    FROM sales
    GROUP BY sales.tenant_id, CAST(sales.date AS DATE);`);

  await knexOrDb.raw(`CREATE VIEW v_sale_items_detail AS
    SELECT
      si.id         AS sale_item_id,
      s.tenant_id   AS tenant_id,
      s.id          AS sale_id,
      si.product_id AS product_id,
      p.name        AS product_name,
      p.cost_price  AS cost_price,
      si.quantity   AS quantity,
      si.unit_price AS unit_price,
      si.quantity * si.unit_price AS subtotal,
      s.date        AS sale_date,
      s.status      AS status,
      c.name        AS customer_name,
      u.username    AS user_name,
      u.id          AS user_id,
      s.created_at  AS created_at
    FROM sale_items si
    JOIN sales s ON si.sales_id = s.id
    JOIN products p ON si.product_id = p.id
    JOIN customers c ON s.customer_id = c.id
    JOIN users u ON s.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_sale_summary AS
    SELECT
      s.id             AS sale_id,
      s.tenant_id      AS tenant_id,
      s.customer_id    AS customer_id,
      s.user_id        AS user_id,
      s.receipt_number AS receipt_number,
      c.name           AS customer_name,
      c.phonenumber    AS phonenumber,
      u.username       AS user_name,
      s.date           AS sale_date,
      s.total_amount   AS total_amount,
      s.payment_mode   AS payment_mode,
      s.status         AS status,
      s.details        AS details,
      COALESCE(si.total_items, 0) AS item_count,
      s.created_at     AS created_at,
      s.updated_at     AS updated_at
    FROM sales s
    JOIN customers c ON s.customer_id = c.id
    JOIN users u ON s.user_id = u.id
    LEFT JOIN (
      SELECT sales_id, COUNT(0) AS total_items
      FROM sale_items
      GROUP BY sales_id
    ) si ON s.id = si.sales_id;`);

  await knexOrDb.raw(`CREATE VIEW v_supplier_info AS
    SELECT
      s.id           AS supplier_id,
      s.tenant_id    AS tenant_id,
      s.name         AS supplier_name,
      s.email        AS email,
      s.company_name AS company_name,
      s.address      AS address,
      s.phonenumber  AS phonenumber,
      u.username     AS user_name,
      u.id           AS user_id,
      s.created_at   AS created_at,
      s.updated_at   AS updated_at,
      s.is_active    AS is_active
    FROM suppliers s
    JOIN users u ON s.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_unified_transactions AS
    SELECT
      'order'         AS transaction_type,
      o.id            AS transaction_id,
      o.tenant_id     AS tenant_id,
      o.customer_id   AS customer_id,
      c.name          AS customer_name,
      o.user_id       AS user_id,
      u.username      AS user_name,
      o.order_date    AS transaction_date,
      o.total_amount  AS total_amount,
      o.status        AS status,
      o.payment_mode  AS payment_mode,
      o.created_at    AS created_at,
      o.updated_at    AS updated_at
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN users u ON o.user_id = u.id
    WHERE o.status = 'delivered'

    UNION ALL

    SELECT
      'sale'          AS transaction_type,
      s.id            AS transaction_id,
      s.tenant_id     AS tenant_id,
      s.customer_id   AS customer_id,
      c.name          AS customer_name,
      s.user_id       AS user_id,
      u.username      AS user_name,
      s.date          AS transaction_date,
      s.total_amount  AS total_amount,
      s.status        AS status,
      s.payment_mode  AS payment_mode,
      s.created_at    AS created_at,
      s.updated_at    AS updated_at
    FROM sales s
    JOIN customers c ON s.customer_id = c.id
    JOIN users u ON s.user_id = u.id
    WHERE s.status = 'completed';`);

  await knexOrDb.raw(`CREATE VIEW v_monthly_revenue AS
    SELECT
      tenant_id AS tenant_id,
      user_id   AS user_id,
      user_name AS user_name,
      strftime('%Y-%m', transaction_date) AS month,
      SUM(total_amount) AS total_revenue,
      COUNT(0) AS transaction_count
    FROM v_unified_transactions
    GROUP BY tenant_id, user_id, user_name, strftime('%Y-%m', transaction_date);`);

  await knexOrDb.raw(`CREATE VIEW v_user_sessions AS
    SELECT
      us.id             AS id,
      us.tenant_id      AS tenant_id,
      us.user_id        AS user_id,
      u.username        AS user_name,
      us.device_name    AS device_name,
      us.device_type    AS device_type,
      us.browser        AS browser,
      us.operating_system AS operating_system,
      us.ip_address     AS ip_address,
      us.is_active      AS is_active,
      us.last_activity_at AS last_activity_at,
      us.expires_at     AS expires_at,
      us.created_at     AS created_at
    FROM user_sessions us
    JOIN users u ON us.user_id = u.id;`);

  await knexOrDb.raw(`CREATE VIEW v_supplier_transactions AS
    SELECT
      st.id             AS id,
      st.tenant_id      AS tenant_id,
      st.transaction_no AS transaction_no,
      st.supplier_id    AS supplier_id,
      COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
      COALESCE(s.company_name, s.name, 'N/A') AS company_name,
      st.delivered_by   AS delivered_by,
      st.transaction_date AS transaction_date,
      st.total_amount   AS total_amount,
      st.amount_paid    AS amount_paid,
      st.balance        AS balance,
      st.payment_mode   AS payment_mode,
      st.status         AS status,
      st.notes          AS notes,
      st.user_id        AS user_id,
      COALESCE(u.username, 'Admin') AS user_name,
      (SELECT COUNT(*) FROM supplier_transaction_items sti WHERE sti.supplier_transaction_id = st.id) AS total_items_count,
      st.created_at     AS created_at,
      st.updated_at     AS updated_at
    FROM supplier_transactions st
    LEFT JOIN suppliers s ON st.supplier_id = s.id
    LEFT JOIN users u ON st.user_id = u.id;`);
}

export async function applyMultiTenantSchema(knexOrDb: Knex): Promise<void> {
  const hasUsers = await knexOrDb.schema.hasTable("users");
  if (!hasUsers) return;

  // Fast-path: if multi-tenant tables, latest evolved columns, default tenant, and views
  // are already in place, skip 220+ sequential migration roundtrips on warm/cold starts.
  try {
    const [
      hasTenants,
      hasTenantsAccessMode,
      hasSyncEvents,
      hasIdempotencyKeys,
      hasMobilePushTokens,
      hasProductsVersion,
      hasSettingsPaperSize,
      hasSettingsMemberSaleAlertEnabled,
      hasSettingsMemberSaleAlertChannels,
      hasUserSessionsTenant,
      vCatalogRow,
      defaultTenant,
    ] = await Promise.all([
      knexOrDb.schema.hasTable("tenants"),
      knexOrDb.schema.hasColumn("tenants", "access_mode"),
      knexOrDb.schema.hasTable("sync_events"),
      knexOrDb.schema.hasTable("idempotency_keys"),
      knexOrDb.schema.hasTable("mobile_push_tokens"),
      knexOrDb.schema.hasColumn("products", "version"),
      knexOrDb.schema.hasColumn("settings", "paper_size"),
      knexOrDb.schema.hasColumn("settings", "member_sale_alert_enabled"),
      knexOrDb.schema.hasColumn("settings", "member_sale_alert_channels"),
      knexOrDb.schema.hasColumn("user_sessions", "tenant_id"),
      knexOrDb("sqlite_master")
        .where({ type: "view", name: "v_product_catalog" })
        .first("sql"),
      knexOrDb("tenants").where("id", DEFAULT_TENANT_ID).first("id").catch(() => null),
    ]);

    const catalogSql = String(vCatalogRow?.sql || "");
    if (
      hasTenants &&
      hasTenantsAccessMode &&
      hasSyncEvents &&
      hasIdempotencyKeys &&
      hasMobilePushTokens &&
      hasProductsVersion &&
      hasSettingsPaperSize &&
      hasSettingsMemberSaleAlertEnabled &&
      hasSettingsMemberSaleAlertChannels &&
      hasUserSessionsTenant &&
      defaultTenant?.id &&
      catalogSql.includes("tenant_id") &&
      catalogSql.includes("low_stock_threshold") &&
      catalogSql.includes("version")
    ) {
      return;
    }
  } catch {
    // Fall through to full migration if any fast check fails
  }

  const hasTenants = await knexOrDb.schema.hasTable("tenants");
  if (!hasTenants) {
    await knexOrDb.schema.createTable("tenants", (table) => {
      table.string("id", 64).primary();
      table.string("name", 255).notNullable();
      table.string("slug", 120).notNullable().unique();
      table.string("owner_user_id", 64).nullable();
      table.string("status", 32).notNullable().defaultTo("active");
      table.string("access_mode", 32).notNullable().defaultTo("both");
      table.timestamp("created_at").defaultTo(knexOrDb.fn.now());
      table.timestamp("updated_at").defaultTo(knexOrDb.fn.now());
    });
  } else {
    await addColumnIfMissing(knexOrDb, "tenants", "access_mode", (table) => {
      table.string("access_mode", 32).notNullable().defaultTo("both");
    });
  }

  const hasSyncEvents = await knexOrDb.schema.hasTable("sync_events");
  if (!hasSyncEvents) {
    await knexOrDb.schema.createTable("sync_events", (table) => {
      table.increments("cursor").primary();
      table.string("tenant_id", 64).notNullable().index();
      table.string("entity_type", 64).notNullable();
      table.string("entity_id", 100).notNullable();
      table.string("action", 32).notNullable();
      table.text("payload_json").nullable();
      table.string("actor_user_id", 64).nullable();
      table.timestamp("created_at").notNullable().defaultTo(knexOrDb.fn.now());
      table.index(["tenant_id", "cursor"], "sync_events_idx_tenant_cursor");
    });
  }

  const hasIdempotencyKeys = await knexOrDb.schema.hasTable("idempotency_keys");
  if (!hasIdempotencyKeys) {
    await knexOrDb.schema.createTable("idempotency_keys", (table) => {
      table.string("id", 64).primary();
      table.string("tenant_id", 64).notNullable();
      table.string("client_mutation_id", 128).notNullable();
      table.string("endpoint", 120).notNullable();
      table.integer("status_code").notNullable().defaultTo(200);
      table.text("response_json").notNullable();
      table.timestamp("created_at").notNullable().defaultTo(knexOrDb.fn.now());
      table.unique(["tenant_id", "client_mutation_id"], {
        indexName: "idempotency_uq_tenant_mutation",
      });
    });
  }

  const hasMobilePushTokens = await knexOrDb.schema.hasTable("mobile_push_tokens");
  if (!hasMobilePushTokens) {
    await knexOrDb.schema.createTable("mobile_push_tokens", (table) => {
      table.string("id", 64).primary();
      table.string("tenant_id", 64).notNullable().index();
      table.string("user_id", 64).notNullable().index();
      table.string("token", 512).notNullable();
      table.string("platform", 32).notNullable().defaultTo("android");
      table.string("device_name", 255).nullable();
      table.integer("is_active").notNullable().defaultTo(1);
      table.timestamp("last_seen_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knexOrDb.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knexOrDb.fn.now());
      table.unique(["user_id", "token"], {
        indexName: "mobile_push_tokens_uq_user_token",
      });
      table.index(
        ["tenant_id", "user_id", "is_active"],
        "mobile_push_tokens_idx_tenant_user_active",
      );
    });
  }

  for (const tableName of TENANT_SCOPED_TABLES) {
    await addColumnIfMissing(knexOrDb, tableName, "tenant_id", (table) => {
      table
        .string("tenant_id", 64)
        .notNullable()
        .defaultTo(DEFAULT_TENANT_ID);
    });

    const hasTbl = await knexOrDb.schema.hasTable(tableName);
    if (hasTbl) {
      await knexOrDb
        .raw(
          `CREATE INDEX IF NOT EXISTS "${tableName}_idx_tenant_id" ON "${tableName}" ("tenant_id")`,
        )
        .catch(() => {});
    }
  }

  // Ensure evolved columns exist on legacy tables before rebuilding views
  await addColumnIfMissing(knexOrDb, "products", "photo_url", (table) => {
    table.text("photo_url").defaultTo("");
  });
  await addColumnIfMissing(knexOrDb, "products", "barcode", (table) => {
    table.text("barcode").defaultTo("");
  });
  await addColumnIfMissing(knexOrDb, "products", "description", (table) => {
    table.text("description").defaultTo("");
  });
  await addColumnIfMissing(knexOrDb, "products", "low_stock_threshold", (table) => {
    table.integer("low_stock_threshold").notNullable().defaultTo(5);
  });
  await addColumnIfMissing(knexOrDb, "products", "is_active", (table) => {
    table.integer("is_active").defaultTo(1);
  });
  await addColumnIfMissing(knexOrDb, "products", "version", (table) => {
    table.integer("version").notNullable().defaultTo(1);
  });

  await addColumnIfMissing(knexOrDb, "sales", "receipt_number", (table) => {
    table.string("receipt_number", 100).defaultTo("");
  });
  await addColumnIfMissing(knexOrDb, "suppliers", "company_name", (table) => {
    table.string("company_name", 255).defaultTo(null);
  });
  await addColumnIfMissing(knexOrDb, "suppliers", "is_active", (table) => {
    table.integer("is_active").defaultTo(1);
  });
  await addColumnIfMissing(knexOrDb, "supplier_transactions", "transaction_no", (table) => {
    table.string("transaction_no").nullable();
  });
  await addColumnIfMissing(knexOrDb, "supplier_transactions", "delivered_by", (table) => {
    table.string("delivered_by").nullable();
  });
  await addColumnIfMissing(knexOrDb, "supplier_transactions", "amount_paid", (table) => {
    table.float("amount_paid").defaultTo(0);
  });
  await addColumnIfMissing(knexOrDb, "supplier_transactions", "balance", (table) => {
    table.float("balance").defaultTo(0);
  });
  await addColumnIfMissing(knexOrDb, "supplier_transactions", "notes", (table) => {
    table.text("notes").nullable();
  });

  await addColumnIfMissing(knexOrDb, "settings", "logo", (table) => {
    table.text("logo").defaultTo("");
  });
  await addColumnIfMissing(knexOrDb, "settings", "language", (table) => {
    table.string("language", 10).defaultTo("en");
  });
  await addColumnIfMissing(knexOrDb, "settings", "business_opening_time", (table) => {
    table.string("business_opening_time").defaultTo("08:00");
  });
  await addColumnIfMissing(knexOrDb, "settings", "business_closing_time", (table) => {
    table.string("business_closing_time").defaultTo("18:00");
  });
  await addColumnIfMissing(knexOrDb, "settings", "business_hours_schedule", (table) => {
    table.text("business_hours_schedule").defaultTo("[]");
  });
  await addColumnIfMissing(knexOrDb, "settings", "business_hours_notes", (table) => {
    table.text("business_hours_notes").defaultTo("");
  });
  await addColumnIfMissing(knexOrDb, "settings", "business_24_7", (table) => {
    table.boolean("business_24_7").defaultTo(false);
  });
  await addColumnIfMissing(knexOrDb, "settings", "eod_report_enabled", (table) => {
    table.boolean("eod_report_enabled").defaultTo(true);
  });
  await addColumnIfMissing(knexOrDb, "settings", "eod_business_closing_time", (table) => {
    table.string("eod_business_closing_time").defaultTo("18:00");
  });
  await addColumnIfMissing(knexOrDb, "settings", "eod_channels", (table) => {
    table.text("eod_channels").defaultTo('["in_app","email","sms"]');
  });
  await addColumnIfMissing(knexOrDb, "settings", "eod_admin_email", (table) => {
    table.string("eod_admin_email").nullable();
  });
  await addColumnIfMissing(knexOrDb, "settings", "eod_admin_phone", (table) => {
    table.string("eod_admin_phone").nullable();
  });
  await addColumnIfMissing(knexOrDb, "settings", "stock_audio_alert", (table) => {
    table.boolean("stock_audio_alert").defaultTo(true);
  });
  await addColumnIfMissing(knexOrDb, "settings", "stock_audio_volume", (table) => {
    table.float("stock_audio_volume").defaultTo(0.5);
  });
  await addColumnIfMissing(knexOrDb, "settings", "stock_audio_tone", (table) => {
    table.string("stock_audio_tone").defaultTo("chime");
  });
  await addColumnIfMissing(knexOrDb, "settings", "stock_alert_threshold", (table) => {
    table.integer("stock_alert_threshold").defaultTo(5);
  });
  await addColumnIfMissing(knexOrDb, "settings", "printer_device_name", (table) => {
    table.string("printer_device_name").defaultTo("");
  });
  await addColumnIfMissing(knexOrDb, "settings", "print_after_sale", (table) => {
    table.integer("print_after_sale").defaultTo(0);
  });
  await addColumnIfMissing(knexOrDb, "settings", "paper_size", (table) => {
    table.string("paper_size", 20).defaultTo("thermal_80mm");
  });
  await addColumnIfMissing(knexOrDb, "settings", "member_sale_alert_enabled", (table) => {
    table.boolean("member_sale_alert_enabled").defaultTo(false);
  });
  await addColumnIfMissing(knexOrDb, "settings", "member_sale_alert_channels", (table) => {
    table.text("member_sale_alert_channels").defaultTo('["in_app"]');
  });

  const existingDefaultTenant = await knexOrDb("tenants")
    .where("id", DEFAULT_TENANT_ID)
    .first();

  if (!existingDefaultTenant) {
    const firstSettings = await knexOrDb("settings")
      .select("business_name")
      .first()
      .catch(() => null);
    const firstAdmin = await knexOrDb("users")
      .where("role", "admin")
      .first("id")
      .catch(() => null);

    await knexOrDb("tenants")
      .insert({
        id: DEFAULT_TENANT_ID,
        name: firstSettings?.business_name || DEFAULT_TENANT_NAME,
        slug: DEFAULT_TENANT_SLUG,
        owner_user_id: firstAdmin?.id || null,
        status: "active",
        access_mode: "both",
      })
      .onConflict("id")
      .ignore();
  }

  await knexOrDb("tenants")
    .whereNull("access_mode")
    .orWhere("access_mode", "")
    .update({ access_mode: "both" })
    .catch(() => {});

  for (const tableName of TENANT_SCOPED_TABLES) {
    const hasTbl = await knexOrDb.schema.hasTable(tableName);
    if (!hasTbl) continue;
    await knexOrDb(tableName)
      .whereNull("tenant_id")
      .orWhere("tenant_id", "")
      .update({ tenant_id: DEFAULT_TENANT_ID })
      .catch(() => {});
  }

  await rebuildUsersForMultiTenancy(knexOrDb);
  await rebuildTableWithCompositeUnique(knexOrDb);
  await rebuildTenantScopedViews(knexOrDb);
}
