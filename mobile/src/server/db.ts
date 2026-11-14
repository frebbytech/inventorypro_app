import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Database as SqliteDatabase } from "better-sqlite3";

/**
 * Server-only SQLite database module for Expo Router API Routes (`+api.ts`).
 * Schema mirrors `migrations/20260823161520_inventory_pro_dev_tables.ts`.
 */

let dbInstance: SqliteDatabase | null = null;
let schemaInitialized = false;

export function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPasswordSync(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, salt, hexDigest] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hexDigest, "hex");
  if (derived.length !== storedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, storedBuf);
}

function resolveDbPath(): string {
  if (process.env.INVENTORY_PRO_DB_PATH) {
    return path.resolve(process.env.INVENTORY_PRO_DB_PATH);
  }
  return path.join(process.cwd(), "data", "inventory-pro.sqlite");
}

function initSchema(db: SqliteDatabase): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      firstname TEXT NOT NULL DEFAULT '',
      lastname TEXT NOT NULL DEFAULT '',
      phonenumber TEXT DEFAULT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT DEFAULT NULL,
      last_login_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT DEFAULT NULL,
      device_name TEXT DEFAULT NULL,
      device_type TEXT DEFAULT NULL,
      operating_system TEXT DEFAULT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_activity_at TEXT DEFAULT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS user_sessions_idx_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS user_sessions_idx_active ON user_sessions(is_active);

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      business_name TEXT NOT NULL DEFAULT 'Inventory Pro',
      business_address TEXT NOT NULL DEFAULT 'AK-459-6364, Kumasi',
      business_phone TEXT NOT NULL DEFAULT '+233543772591',
      business_email TEXT NOT NULL DEFAULT 'inventorypro@frebbytech.com',
      currency TEXT NOT NULL DEFAULT 'GHS',
      tax_rate REAL NOT NULL DEFAULT 0.01,
      stock_alert_threshold INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      photo_url TEXT DEFAULT '',
      barcode TEXT DEFAULT '',
      description TEXT DEFAULT '',
      cost_price REAL NOT NULL CHECK (cost_price >= 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES product_categories(id)
    );

    CREATE INDEX IF NOT EXISTS products_idx_name ON products(name);
    CREATE INDEX IF NOT EXISTS products_idx_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS products_idx_category ON products(category_id);

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT DEFAULT NULL,
      address TEXT DEFAULT NULL,
      phonenumber TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      receipt_number TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL DEFAULT (datetime('now')),
      details TEXT DEFAULT '',
      total_amount REAL NOT NULL CHECK (total_amount >= 0),
      discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
      tax_amount REAL NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
      amount_paid REAL NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
      payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'momo', 'bank', 'cheque')),
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE INDEX IF NOT EXISTS sales_idx_date ON sales(date);
    CREATE INDEX IF NOT EXISTS sales_idx_status ON sales(status);
    CREATE INDEX IF NOT EXISTS sales_idx_receipt ON sales(receipt_number);

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sales_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity >= 0),
      unit_price REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sales_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS sale_items_idx_sales ON sale_items(sales_id);
    CREATE INDEX IF NOT EXISTS sale_items_idx_product ON sale_items(product_id);

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_category_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      restock_date TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (product_category_id) REFERENCES product_categories(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore', 'approve', 'cancel', 'login', 'logout')),
      old_values TEXT DEFAULT NULL,
      new_values TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
}

function isoDaysAgoAt(daysAgo: number, hour: number, minute: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

function seedDatabaseIfEmpty(db: SqliteDatabase): void {
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM users").get() as { cnt: number };
  if (row.cnt > 0) {
    return;
  }

  const adminId = "user-admin-001";
  const staffId = "user-staff-002";

  db.exec("BEGIN IMMEDIATE");
  try {
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, email, password_hash, firstname, lastname, phonenumber, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      adminId,
      "frebbytech",
      "inventorypro@frebbytech.com",
      hashPasswordSync(process.env.INITIAL_ADMIN_PASSWORD || "Admin123!"),
      "System",
      "Admin",
      "+233543772591",
      "admin",
    );

    insertUser.run(
      staffId,
      "kwame",
      "kwame@frebbytech.com",
      hashPasswordSync("Staff123!"),
      "Kwame",
      "Boateng",
      "+233244556677",
      "member",
    );

    db.prepare(`
      INSERT INTO settings (id, user_id, business_name, business_address, business_phone, business_email, currency, tax_rate, stock_alert_threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "settings-001",
      adminId,
      "Inventory Pro",
      "AK-459-6364, Kumasi",
      "+233543772591",
      "inventorypro@frebbytech.com",
      "GHS",
      0.01,
      5,
    );

    const insertCategory = db.prepare(`
      INSERT INTO product_categories (id, user_id, name, description, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    const categories = [
      ["cat-dairy", "Dairy & Beverages", "Milk tins, bottled water, and malt drinks"],
      ["cat-groceries", "Groceries & Grains", "Rice, cooking oil, and pantry staples"],
      ["cat-personal", "Personal Care", "Soaps and oral hygiene essentials"],
      ["cat-household", "Household", "Detergents and dishwashing supplies"],
      ["cat-snacks", "Snacks & Bakery", "Biscuits and packaged snacks"],
    ] as const;
    for (const [id, name, description] of categories) {
      insertCategory.run(id, adminId, name, description);
    }

    const insertProduct = db.prepare(`
      INSERT INTO products (
        id, user_id, category_id, name, photo_url, barcode, description,
        cost_price, unit_price, stock_quantity, low_stock_threshold, is_active, updated_at
      ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const products = [
      ["prod-001", "cat-dairy", "Peak Evaporated Milk 170g", "5449000000996", "Full cream evaporated milk tin, shelf-stable retail unit.", 12.5, 16.0, 42, 5, 1, isoDaysAgoAt(0, 9, 15)],
      ["prod-002", "cat-dairy", "Nestle Milo Activ-Go 400g", "6001067041234", "Chocolate malt beverage refill tin with vitamins and minerals.", 42.0, 52.0, 18, 5, 1, isoDaysAgoAt(0, 8, 45)],
      ["prod-003", "cat-dairy", "Ideal Milk Original 160g", "8901058851234", "Evaporated unsweetened milk for everyday beverages and cooking.", 11.0, 14.5, 3, 5, 1, isoDaysAgoAt(0, 10, 20)],
      ["prod-004", "cat-groceries", "Royal Aroma Jasmine Rice 5kg", "6154000112233", "Long-grain perfumed jasmine rice family pack.", 115.0, 138.0, 0, 5, 1, isoDaysAgoAt(0, 11, 5)],
      ["prod-005", "cat-groceries", "Frytol Vegetable Cooking Oil 1L", "6151100049102", "Cholesterol-free fortified vegetable cooking oil bottle.", 36.0, 44.0, 2, 5, 1, isoDaysAgoAt(0, 9, 55)],
      ["prod-006", "cat-dairy", "Voltic Natural Mineral Water 1.5L", "6030000100024", "Still natural mineral water bottle (single retail unit).", 4.5, 7.0, 64, 5, 1, isoDaysAgoAt(0, 7, 30)],
      ["prod-007", "cat-personal", "Geisha Black Soap 175g", "6001087354110", "Long-lasting moisturizing bath soap bar.", 9.0, 12.5, 4, 5, 1, isoDaysAgoAt(0, 8, 10)],
      ["prod-008", "cat-personal", "Pepsodent Cavity Fighter 140g", "8901030701122", "Fluoride toothpaste family size tube.", 14.0, 18.5, 25, 5, 1, isoDaysAgoAt(0, 8, 15)],
      ["prod-009", "cat-household", "Omo Multi-Active Detergent 500g", "6001087368896", "Fast-dissolving washing powder sachet for hand & machine wash.", 19.0, 24.0, 1, 5, 1, isoDaysAgoAt(0, 11, 30)],
      ["prod-010", "cat-groceries", "Gino Tomato Paste 400g", "6033000105519", "Rich double-concentrated tomato paste tin.", 15.0, 19.5, 0, 5, 1, isoDaysAgoAt(0, 10, 40)],
      ["prod-011", "cat-snacks", "McVitie's Digestive Biscuits 250g", "5000168001234", "Wholewheat crispy digestive biscuit pack.", 18.5, 24.5, 15, 5, 1, isoDaysAgoAt(0, 9, 0)],
      ["prod-012", "cat-household", "Sunlight Dishwashing Liquid 400ml", "6001087009126", "Lemon-scented grease-cutting dishwashing liquid bottle.", 20.0, 26.0, 11, 5, 0, isoDaysAgoAt(1, 17, 10)],
    ] as const;

    for (const p of products) {
      insertProduct.run(p[0], adminId, p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10]);
    }

    const insertCustomer = db.prepare(`
      INSERT INTO customers (id, user_id, name, phonenumber)
      VALUES (?, ?, ?, ?)
    `);
    const customers = [
      ["cust-walkin", "Walk-in Customer", null],
      ["cust-ama", "Ama Mensah", "+233244112233"],
      ["cust-kofi", "Kofi Owusu", "+233208991144"],
      ["cust-yaw", "Yaw Darko", null],
      ["cust-efua", "Efua Sarpong", "+233552348811"],
      ["cust-adwoa", "Adwoa Appiah", null],
    ] as const;
    for (const [id, name, phone] of customers) {
      insertCustomer.run(id, adminId, name, phone);
    }

    const todayStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const yestDate = new Date();
    yestDate.setUTCDate(yestDate.getUTCDate() - 1);
    const yestStamp = yestDate.toISOString().slice(0, 10).replace(/-/g, "");

    const insertSale = db.prepare(`
      INSERT INTO sales (
        id, customer_id, user_id, receipt_number, date, details,
        total_amount, discount_amount, tax_amount, amount_paid, payment_mode, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSaleItem = db.prepare(`
      INSERT INTO sale_items (id, sales_id, product_id, quantity, unit_price)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Today's sales
    insertSale.run("sale-1042", "cust-ama", staffId, `RCP-${todayStamp}-1042`, isoDaysAgoAt(0, 11, 42), "Counter POS", 192.5, 0, 0, 192.5, "momo", "completed");
    insertSaleItem.run("si-1", "sale-1042", "prod-002", 2, 52.0);
    insertSaleItem.run("si-2", "sale-1042", "prod-001", 4, 16.0);
    insertSaleItem.run("si-3", "sale-1042", "prod-011", 1, 24.5);

    insertSale.run("sale-1041", "cust-walkin", staffId, `RCP-${todayStamp}-1041`, isoDaysAgoAt(0, 11, 8), "Counter POS", 364.0, 0, 0, 364.0, "cash", "completed");
    insertSaleItem.run("si-4", "sale-1041", "prod-004", 2, 138.0);
    insertSaleItem.run("si-5", "sale-1041", "prod-005", 2, 44.0);

    insertSale.run("sale-1040", "cust-kofi", adminId, `RCP-${todayStamp}-1040`, isoDaysAgoAt(0, 10, 19), "Counter POS", 218.67, 10.0, 2.17, 218.67, "bank", "completed");
    insertSaleItem.run("si-6", "sale-1040", "prod-008", 3, 18.5);
    insertSaleItem.run("si-7", "sale-1040", "prod-007", 6, 12.5);
    insertSaleItem.run("si-8", "sale-1040", "prod-009", 4, 24.0);

    insertSale.run("sale-1039", "cust-yaw", adminId, `RCP-${todayStamp}-1039`, isoDaysAgoAt(0, 9, 34), "Counter POS", 156.5, 0, 0, 156.5, "momo", "completed");
    insertSaleItem.run("si-9", "sale-1039", "prod-006", 12, 7.0);
    insertSaleItem.run("si-10", "sale-1039", "prod-003", 5, 14.5);

    insertSale.run("sale-1038", "cust-efua", staffId, `RCP-${todayStamp}-1038`, isoDaysAgoAt(0, 8, 52), "Refunded damaged tins", 58.5, 0, 0, 0, "cash", "refunded");
    insertSaleItem.run("si-11", "sale-1038", "prod-010", 3, 19.5);

    insertSale.run("sale-1037", "cust-adwoa", adminId, `RCP-${todayStamp}-1037`, isoDaysAgoAt(0, 8, 12), "Counter POS", 358.0, 0, 0, 358.0, "cash", "completed");
    insertSaleItem.run("si-12", "sale-1037", "prod-001", 10, 16.0);
    insertSaleItem.run("si-13", "sale-1037", "prod-002", 3, 52.0);
    insertSaleItem.run("si-14", "sale-1037", "prod-006", 6, 7.0);

    // Yesterday's baseline sale for revenue comparison
    insertSale.run("sale-1030", "cust-walkin", adminId, `RCP-${yestStamp}-1030`, isoDaysAgoAt(1, 16, 20), "Counter POS", 1185.0, 0, 0, 1185.0, "cash", "completed");
    insertSaleItem.run("si-15", "sale-1030", "prod-004", 6, 138.0);
    insertSaleItem.run("si-16", "sale-1030", "prod-001", 15, 16.0);
    insertSaleItem.run("si-17", "sale-1030", "prod-008", 6, 19.5);

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getDb(): SqliteDatabase {
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
    const BetterSqlite3 = nodeRequire("better-sqlite3") as new (
      filename: string,
    ) => SqliteDatabase;
    dbInstance = new BetterSqlite3(dbPath);
  }
  if (!schemaInitialized) {
    initSchema(dbInstance);
    seedDatabaseIfEmpty(dbInstance);
    schemaInitialized = true;
  }
  return dbInstance;
}
