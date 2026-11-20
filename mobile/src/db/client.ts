import { count } from "drizzle-orm";
import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";
import { hashPassword } from "./crypto";
import * as schema from "./schema";

export type ExpoSqliteDrizzleDb = ExpoSQLiteDatabase<typeof schema>;

const DATABASE_NAME = "inventory_pro.db";

let rawSqlite: SQLite.SQLiteDatabase | null = null;
let drizzleDb: ExpoSqliteDrizzleDb | null = null;
let readyPromise: Promise<ExpoSqliteDrizzleDb> | null = null;

function getRawSqlite(): SQLite.SQLiteDatabase {
  if (!rawSqlite) {
    rawSqlite = SQLite.openDatabaseSync(DATABASE_NAME);
  }
  return rawSqlite;
}

export function getDrizzleDb(): ExpoSqliteDrizzleDb {
  if (!drizzleDb) {
    drizzleDb = drizzle(getRawSqlite(), { schema });
  }
  return drizzleDb;
}

function ensureColumnExists(
  sqlite: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definitionSql: string,
): void {
  try {
    const cols = sqlite.getAllSync<{ name: string }>(`PRAGMA table_info(${table});`);
    if (!cols.some((c) => c.name === column)) {
      sqlite.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql};`);
    }
  } catch {
    // Ignore if table not created yet or column already added concurrently
  }
}

function ensureTablesSync(sqlite: SQLite.SQLiteDatabase): void {
  try {
    sqlite.execSync("PRAGMA journal_mode = WAL;");
  } catch {
    // Ignore on platforms where WAL mode is not applicable (e.g., web wa-sqlite)
  }

  sqlite.execSync(`
    PRAGMA foreign_keys = ON;

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
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      two_factor_method TEXT NOT NULL DEFAULT 'email',
      two_factor_updated_at TEXT DEFAULT NULL,
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
    CREATE INDEX IF NOT EXISTS user_sessions_idx_token ON user_sessions(token);

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
      language TEXT NOT NULL DEFAULT 'en',
      notification_email INTEGER NOT NULL DEFAULT 0,
      notification_push INTEGER NOT NULL DEFAULT 0,
      notification_sms INTEGER NOT NULL DEFAULT 0,
      stock_audio_alert INTEGER NOT NULL DEFAULT 1,
      stock_audio_tone TEXT NOT NULL DEFAULT 'chime',
      stock_audio_volume REAL NOT NULL DEFAULT 0.5,
      eod_report_enabled INTEGER NOT NULL DEFAULT 0,
      eod_business_closing_time TEXT NOT NULL DEFAULT '18:00',
      eod_admin_email TEXT NOT NULL DEFAULT '',
      eod_admin_phone TEXT NOT NULL DEFAULT '',
      business_24_7 INTEGER NOT NULL DEFAULT 0,
      business_opening_time TEXT NOT NULL DEFAULT '08:00',
      business_closing_time TEXT NOT NULL DEFAULT '18:00',
      business_hours_schedule TEXT NOT NULL DEFAULT '[]',
      business_hours_notes TEXT NOT NULL DEFAULT '',
      print_after_sale INTEGER NOT NULL DEFAULT 1,
      paper_size TEXT NOT NULL DEFAULT 'thermal_80mm',
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

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      email TEXT DEFAULT NULL,
      address TEXT DEFAULT NULL,
      phonenumber TEXT DEFAULT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS suppliers_idx_name ON suppliers(name);
    CREATE INDEX IF NOT EXISTS suppliers_idx_company ON suppliers(company_name);

    CREATE TABLE IF NOT EXISTS supplier_transactions (
      id TEXT PRIMARY KEY,
      transaction_no TEXT NOT NULL UNIQUE,
      supplier_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      delivered_by TEXT DEFAULT NULL,
      transaction_date TEXT NOT NULL DEFAULT (datetime('now')),
      total_amount REAL NOT NULL CHECK (total_amount >= 0),
      amount_paid REAL NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
      balance REAL NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'momo', 'bank', 'cheque')),
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'cancelled')),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS supplier_tx_idx_supplier ON supplier_transactions(supplier_id);
    CREATE INDEX IF NOT EXISTS supplier_tx_idx_date ON supplier_transactions(transaction_date);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT DEFAULT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      reference_type TEXT DEFAULT NULL,
      reference_id TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS notifications_idx_user_read ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS notifications_idx_created ON notifications(created_at);

    CREATE TABLE IF NOT EXISTS broadcast_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      recipient_group TEXT NOT NULL CHECK (recipient_group IN ('employees', 'customers', 'suppliers')),
      channel TEXT NOT NULL CHECK (channel IN ('in_app', 'sms', 'email')),
      subject TEXT DEFAULT NULL,
      content TEXT NOT NULL,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'queued', 'partial', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS broadcast_messages_idx_created ON broadcast_messages(created_at);

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      client_mutation_id TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL,
      operation TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'POST',
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'conflict', 'failed')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS sync_outbox_idx_status_created ON sync_outbox(status, created_at);
  `);

  // Idempotent schema migrations for pre-existing local SQLite databases
  ensureColumnExists(sqlite, "users", "two_factor_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumnExists(sqlite, "users", "two_factor_method", "TEXT NOT NULL DEFAULT 'email'");
  ensureColumnExists(sqlite, "users", "two_factor_updated_at", "TEXT DEFAULT NULL");

  ensureColumnExists(sqlite, "settings", "language", "TEXT NOT NULL DEFAULT 'en'");
  ensureColumnExists(sqlite, "settings", "notification_email", "INTEGER NOT NULL DEFAULT 0");
  ensureColumnExists(sqlite, "settings", "notification_push", "INTEGER NOT NULL DEFAULT 0");
  ensureColumnExists(sqlite, "settings", "notification_sms", "INTEGER NOT NULL DEFAULT 0");
  ensureColumnExists(sqlite, "settings", "stock_audio_alert", "INTEGER NOT NULL DEFAULT 1");
  ensureColumnExists(sqlite, "settings", "stock_audio_tone", "TEXT NOT NULL DEFAULT 'chime'");
  ensureColumnExists(sqlite, "settings", "stock_audio_volume", "REAL NOT NULL DEFAULT 0.5");
  ensureColumnExists(sqlite, "settings", "eod_report_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumnExists(sqlite, "settings", "eod_business_closing_time", "TEXT NOT NULL DEFAULT '18:00'");
  ensureColumnExists(sqlite, "settings", "eod_admin_email", "TEXT NOT NULL DEFAULT ''");
  ensureColumnExists(sqlite, "settings", "eod_admin_phone", "TEXT NOT NULL DEFAULT ''");
  ensureColumnExists(sqlite, "settings", "business_24_7", "INTEGER NOT NULL DEFAULT 0");
  ensureColumnExists(sqlite, "settings", "business_opening_time", "TEXT NOT NULL DEFAULT '08:00'");
  ensureColumnExists(sqlite, "settings", "business_closing_time", "TEXT NOT NULL DEFAULT '18:00'");
  ensureColumnExists(sqlite, "settings", "business_hours_schedule", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumnExists(sqlite, "settings", "business_hours_notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumnExists(sqlite, "settings", "print_after_sale", "INTEGER NOT NULL DEFAULT 1");
  ensureColumnExists(sqlite, "settings", "paper_size", "TEXT NOT NULL DEFAULT 'thermal_80mm'");
}

function isoDaysAgoAt(daysAgo: number, hour: number, minute: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function seedDatabaseIfEmpty(db: ExpoSqliteDrizzleDb): Promise<void> {
  const existing = db.select({ cnt: count() }).from(schema.users).get();
  if ((existing?.cnt ?? 0) > 0) {
    return;
  }

  // Hash seeded passwords before entering synchronous Drizzle transaction
  const [adminPasswordHash, staffPasswordHash] = await Promise.all([
    hashPassword("Admin123!"),
    hashPassword("Staff123!"),
  ]);

  const adminId = "user-admin-001";
  const staffId = "user-staff-002";
  const todayStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const yestDate = new Date();
  yestDate.setUTCDate(yestDate.getUTCDate() - 1);
  const yestStamp = yestDate.toISOString().slice(0, 10).replace(/-/g, "");

  db.transaction((tx) => {
    tx.insert(schema.users)
      .values([
        {
          id: adminId,
          username: "frebbytech",
          email: "inventorypro@frebbytech.com",
          passwordHash: adminPasswordHash,
          firstname: "System",
          lastname: "Admin",
          phonenumber: "+233543772591",
          role: "admin",
        },
        {
          id: staffId,
          username: "kwame",
          email: "kwame@frebbytech.com",
          passwordHash: staffPasswordHash,
          firstname: "Kwame",
          lastname: "Boateng",
          phonenumber: "+233244556677",
          role: "member",
        },
      ])
      .run();

    tx.insert(schema.settings)
      .values({
        id: "settings-001",
        userId: adminId,
        businessName: "Inventory Pro",
        businessAddress: "AK-459-6364, Kumasi",
        businessPhone: "+233543772591",
        businessEmail: "inventorypro@frebbytech.com",
        currency: "GHS",
        taxRate: 0.01,
        stockAlertThreshold: 5,
      })
      .run();

    tx.insert(schema.productCategories)
      .values([
        {
          id: "cat-dairy",
          userId: adminId,
          name: "Dairy & Beverages",
          description: "Milk tins, bottled water, and malt drinks",
          isActive: 1,
        },
        {
          id: "cat-groceries",
          userId: adminId,
          name: "Groceries & Grains",
          description: "Rice, cooking oil, and pantry staples",
          isActive: 1,
        },
        {
          id: "cat-personal",
          userId: adminId,
          name: "Personal Care",
          description: "Soaps and oral hygiene essentials",
          isActive: 1,
        },
        {
          id: "cat-household",
          userId: adminId,
          name: "Household",
          description: "Detergents and dishwashing supplies",
          isActive: 1,
        },
        {
          id: "cat-snacks",
          userId: adminId,
          name: "Snacks & Bakery",
          description: "Biscuits and packaged snacks",
          isActive: 1,
        },
      ])
      .run();

    tx.insert(schema.products)
      .values([
        {
          id: "prod-001",
          userId: adminId,
          categoryId: "cat-dairy",
          name: "Peak Evaporated Milk 170g",
          barcode: "5449000000996",
          description: "Full cream evaporated milk tin, shelf-stable retail unit.",
          costPrice: 12.5,
          unitPrice: 16.0,
          stockQuantity: 42,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 9, 15),
        },
        {
          id: "prod-002",
          userId: adminId,
          categoryId: "cat-dairy",
          name: "Nestle Milo Activ-Go 400g",
          barcode: "6001067041234",
          description: "Chocolate malt beverage refill tin with vitamins and minerals.",
          costPrice: 42.0,
          unitPrice: 52.0,
          stockQuantity: 18,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 8, 45),
        },
        {
          id: "prod-003",
          userId: adminId,
          categoryId: "cat-dairy",
          name: "Ideal Milk Original 160g",
          barcode: "8901058851234",
          description: "Evaporated unsweetened milk for everyday beverages and cooking.",
          costPrice: 11.0,
          unitPrice: 14.5,
          stockQuantity: 3,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 10, 20),
        },
        {
          id: "prod-004",
          userId: adminId,
          categoryId: "cat-groceries",
          name: "Royal Aroma Jasmine Rice 5kg",
          barcode: "6154000112233",
          description: "Long-grain perfumed jasmine rice family pack.",
          costPrice: 115.0,
          unitPrice: 138.0,
          stockQuantity: 0,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 11, 5),
        },
        {
          id: "prod-005",
          userId: adminId,
          categoryId: "cat-groceries",
          name: "Frytol Vegetable Cooking Oil 1L",
          barcode: "6151100049102",
          description: "Cholesterol-free fortified vegetable cooking oil bottle.",
          costPrice: 36.0,
          unitPrice: 44.0,
          stockQuantity: 2,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 9, 55),
        },
        {
          id: "prod-006",
          userId: adminId,
          categoryId: "cat-dairy",
          name: "Voltic Natural Mineral Water 1.5L",
          barcode: "6030000100024",
          description: "Still natural mineral water bottle (single retail unit).",
          costPrice: 4.5,
          unitPrice: 7.0,
          stockQuantity: 64,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 7, 30),
        },
        {
          id: "prod-007",
          userId: adminId,
          categoryId: "cat-personal",
          name: "Geisha Black Soap 175g",
          barcode: "6001087354110",
          description: "Long-lasting moisturizing bath soap bar.",
          costPrice: 9.0,
          unitPrice: 12.5,
          stockQuantity: 4,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 8, 10),
        },
        {
          id: "prod-008",
          userId: adminId,
          categoryId: "cat-personal",
          name: "Pepsodent Cavity Fighter 140g",
          barcode: "8901030701122",
          description: "Fluoride toothpaste family size tube.",
          costPrice: 14.0,
          unitPrice: 18.5,
          stockQuantity: 25,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 8, 15),
        },
        {
          id: "prod-009",
          userId: adminId,
          categoryId: "cat-household",
          name: "Omo Multi-Active Detergent 500g",
          barcode: "6001087368896",
          description: "Fast-dissolving washing powder sachet for hand & machine wash.",
          costPrice: 19.0,
          unitPrice: 24.0,
          stockQuantity: 1,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 11, 30),
        },
        {
          id: "prod-010",
          userId: adminId,
          categoryId: "cat-groceries",
          name: "Gino Tomato Paste 400g",
          barcode: "6033000105519",
          description: "Rich double-concentrated tomato paste tin.",
          costPrice: 15.0,
          unitPrice: 19.5,
          stockQuantity: 0,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 10, 40),
        },
        {
          id: "prod-011",
          userId: adminId,
          categoryId: "cat-snacks",
          name: "McVitie's Digestive Biscuits 250g",
          barcode: "5000168001234",
          description: "Wholewheat crispy digestive biscuit pack.",
          costPrice: 18.5,
          unitPrice: 24.5,
          stockQuantity: 15,
          lowStockThreshold: 5,
          isActive: 1,
          updatedAt: isoDaysAgoAt(0, 9, 0),
        },
        {
          id: "prod-012",
          userId: adminId,
          categoryId: "cat-household",
          name: "Sunlight Dishwashing Liquid 400ml",
          barcode: "6001087009126",
          description: "Lemon-scented grease-cutting dishwashing liquid bottle.",
          costPrice: 20.0,
          unitPrice: 26.0,
          stockQuantity: 11,
          lowStockThreshold: 5,
          isActive: 0,
          updatedAt: isoDaysAgoAt(1, 17, 10),
        },
      ])
      .run();

    tx.insert(schema.customers)
      .values([
        { id: "cust-walkin", userId: adminId, name: "Walk-in Customer", phonenumber: null },
        { id: "cust-ama", userId: adminId, name: "Ama Mensah", phonenumber: "+233244112233" },
        { id: "cust-kofi", userId: adminId, name: "Kofi Owusu", phonenumber: "+233208991144" },
        { id: "cust-yaw", userId: adminId, name: "Yaw Darko", phonenumber: null },
        { id: "cust-efua", userId: adminId, name: "Efua Sarpong", phonenumber: "+233552348811" },
        { id: "cust-adwoa", userId: adminId, name: "Adwoa Appiah", phonenumber: null },
      ])
      .run();

    tx.insert(schema.sales)
      .values([
        {
          id: "sale-1042",
          customerId: "cust-ama",
          userId: staffId,
          receiptNumber: `RCP-${todayStamp}-1042`,
          date: isoDaysAgoAt(0, 11, 42),
          details: "Counter POS",
          totalAmount: 192.5,
          discountAmount: 0,
          taxAmount: 0,
          amountPaid: 192.5,
          paymentMode: "momo",
          status: "completed",
        },
        {
          id: "sale-1041",
          customerId: "cust-walkin",
          userId: staffId,
          receiptNumber: `RCP-${todayStamp}-1041`,
          date: isoDaysAgoAt(0, 11, 8),
          details: "Counter POS",
          totalAmount: 364.0,
          discountAmount: 0,
          taxAmount: 0,
          amountPaid: 364.0,
          paymentMode: "cash",
          status: "completed",
        },
        {
          id: "sale-1040",
          customerId: "cust-kofi",
          userId: adminId,
          receiptNumber: `RCP-${todayStamp}-1040`,
          date: isoDaysAgoAt(0, 10, 19),
          details: "Counter POS",
          totalAmount: 218.67,
          discountAmount: 10.0,
          taxAmount: 2.17,
          amountPaid: 218.67,
          paymentMode: "bank",
          status: "completed",
        },
        {
          id: "sale-1039",
          customerId: "cust-yaw",
          userId: adminId,
          receiptNumber: `RCP-${todayStamp}-1039`,
          date: isoDaysAgoAt(0, 9, 34),
          details: "Counter POS",
          totalAmount: 156.5,
          discountAmount: 0,
          taxAmount: 0,
          amountPaid: 156.5,
          paymentMode: "momo",
          status: "completed",
        },
        {
          id: "sale-1038",
          customerId: "cust-efua",
          userId: staffId,
          receiptNumber: `RCP-${todayStamp}-1038`,
          date: isoDaysAgoAt(0, 8, 52),
          details: "Refunded damaged tins",
          totalAmount: 58.5,
          discountAmount: 0,
          taxAmount: 0,
          amountPaid: 0,
          paymentMode: "cash",
          status: "refunded",
        },
        {
          id: "sale-1037",
          customerId: "cust-adwoa",
          userId: adminId,
          receiptNumber: `RCP-${todayStamp}-1037`,
          date: isoDaysAgoAt(0, 8, 12),
          details: "Counter POS",
          totalAmount: 358.0,
          discountAmount: 0,
          taxAmount: 0,
          amountPaid: 358.0,
          paymentMode: "cash",
          status: "completed",
        },
        {
          id: "sale-1030",
          customerId: "cust-walkin",
          userId: adminId,
          receiptNumber: `RCP-${yestStamp}-1030`,
          date: isoDaysAgoAt(1, 16, 20),
          details: "Counter POS",
          totalAmount: 1185.0,
          discountAmount: 0,
          taxAmount: 0,
          amountPaid: 1185.0,
          paymentMode: "cash",
          status: "completed",
        },
      ])
      .run();

    tx.insert(schema.saleItems)
      .values([
        { id: "si-1", salesId: "sale-1042", productId: "prod-002", quantity: 2, unitPrice: 52.0 },
        { id: "si-2", salesId: "sale-1042", productId: "prod-001", quantity: 4, unitPrice: 16.0 },
        { id: "si-3", salesId: "sale-1042", productId: "prod-011", quantity: 1, unitPrice: 24.5 },
        { id: "si-4", salesId: "sale-1041", productId: "prod-004", quantity: 2, unitPrice: 138.0 },
        { id: "si-5", salesId: "sale-1041", productId: "prod-005", quantity: 2, unitPrice: 44.0 },
        { id: "si-6", salesId: "sale-1040", productId: "prod-008", quantity: 3, unitPrice: 18.5 },
        { id: "si-7", salesId: "sale-1040", productId: "prod-007", quantity: 6, unitPrice: 12.5 },
        { id: "si-8", salesId: "sale-1040", productId: "prod-009", quantity: 4, unitPrice: 24.0 },
        { id: "si-9", salesId: "sale-1039", productId: "prod-006", quantity: 12, unitPrice: 7.0 },
        { id: "si-10", salesId: "sale-1039", productId: "prod-003", quantity: 5, unitPrice: 14.5 },
        { id: "si-11", salesId: "sale-1038", productId: "prod-010", quantity: 3, unitPrice: 19.5 },
        { id: "si-12", salesId: "sale-1037", productId: "prod-001", quantity: 10, unitPrice: 16.0 },
        { id: "si-13", salesId: "sale-1037", productId: "prod-002", quantity: 3, unitPrice: 52.0 },
        { id: "si-14", salesId: "sale-1037", productId: "prod-006", quantity: 6, unitPrice: 7.0 },
        { id: "si-15", salesId: "sale-1030", productId: "prod-004", quantity: 6, unitPrice: 138.0 },
        { id: "si-16", salesId: "sale-1030", productId: "prod-001", quantity: 15, unitPrice: 16.0 },
        { id: "si-17", salesId: "sale-1030", productId: "prod-008", quantity: 6, unitPrice: 19.5 },
      ])
      .run();
  });
}

function seedSuppliersIfEmpty(db: ExpoSqliteDrizzleDb): void {
  const existingSuppliers = db
    .select({ cnt: count() })
    .from(schema.suppliers)
    .get();
  if ((existingSuppliers?.cnt ?? 0) > 0) {
    return;
  }

  const firstUser = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .limit(1)
    .get();
  if (!firstUser) return;

  const ownerId = firstUser.id;
  db.transaction((tx) => {
    tx.insert(schema.suppliers)
      .values([
        {
          id: "sup-nestle",
          userId: ownerId,
          name: "Daniel Boateng",
          companyName: "Nestle Ghana Wholesale",
          email: "orders@nestle-dist.gh",
          address: "Adum Commercial Hub, Kumasi",
          phonenumber: "+233322021455",
          isActive: 1,
        },
        {
          id: "sup-unilever",
          userId: ownerId,
          name: "Abena Asante",
          companyName: "Unilever Trade Partners",
          email: "trade@unilever-gh.com",
          address: "Tema Industrial Area, Plot 14",
          phonenumber: "+233303208910",
          isActive: 1,
        },
        {
          id: "sup-voltic",
          userId: ownerId,
          name: "Kojo Mensah",
          companyName: "Voltic & Beverage Supply",
          email: "dispatch@volticgh.com",
          address: "Asokwa Depot, Kumasi",
          phonenumber: "+233244890122",
          isActive: 1,
        },
        {
          id: "sup-olam",
          userId: ownerId,
          name: "Ibrahim Musa",
          companyName: "Olam Grains & Staples",
          email: "grains@olamghana.com",
          address: "Aboabo Wholesale Market, Kumasi",
          phonenumber: "+233501223344",
          isActive: 1,
        },
      ])
      .run();

    tx.insert(schema.supplierTransactions)
      .values([
        {
          id: "stx-001",
          transactionNo: "SUP-TXN-8801",
          supplierId: "sup-nestle",
          userId: ownerId,
          deliveredBy: "K. Antwi (Van 04)",
          transactionDate: isoDaysAgoAt(2, 10, 30),
          totalAmount: 1850.0,
          amountPaid: 1850.0,
          balance: 0,
          paymentMode: "bank",
          status: "completed",
          notes: "Monthly Milo & Peak Evaporated Milk restock",
        },
        {
          id: "stx-002",
          transactionNo: "SUP-TXN-8802",
          supplierId: "sup-unilever",
          userId: ownerId,
          deliveredBy: "Unilever Logistics",
          transactionDate: isoDaysAgoAt(1, 14, 15),
          totalAmount: 940.0,
          amountPaid: 600.0,
          balance: 340.0,
          paymentMode: "momo",
          status: "pending",
          notes: "Geisha soap & Pepsodent carton delivery",
        },
      ])
      .run();
  });
}

function seedNotificationsIfEmpty(db: ExpoSqliteDrizzleDb): void {
  const existingNotifications = db
    .select({ cnt: count() })
    .from(schema.notifications)
    .get();
  if ((existingNotifications?.cnt ?? 0) > 0) {
    return;
  }

  const allUsers = db
    .select({
      id: schema.users.id,
      firstname: schema.users.firstname,
      lastname: schema.users.lastname,
      username: schema.users.username,
    })
    .from(schema.users)
    .all();

  if (allUsers.length === 0) return;

  const firstAdmin = allUsers[0];
  const senderName =
    [firstAdmin.firstname, firstAdmin.lastname].filter(Boolean).join(" ").trim() ||
    firstAdmin.username;

  db.transaction((tx) => {
    const starterRows: Array<typeof schema.notifications.$inferInsert> = [];

    for (const u of allUsers) {
      starterRows.push(
        {
          id: `notif-lowstock-rice-${u.id}`,
          userId: u.id,
          type: "low_stock",
          title: "Out of stock: Royal Aroma Jasmine Rice 5kg",
          message: "Current inventory is 0 units. Reorder from Olam Grains & Staples.",
          isRead: 0,
          referenceType: "product",
          referenceId: "prod-004",
          createdAt: isoDaysAgoAt(0, 10, 45),
          updatedAt: isoDaysAgoAt(0, 10, 45),
        },
        {
          id: `notif-lowstock-oil-${u.id}`,
          userId: u.id,
          type: "low_stock",
          title: "Low stock alert: Frytol Vegetable Cooking Oil 1L",
          message: "Only 2 bottles left (alert threshold: 5 units).",
          isRead: 0,
          referenceType: "product",
          referenceId: "prod-005",
          createdAt: isoDaysAgoAt(0, 9, 55),
          updatedAt: isoDaysAgoAt(0, 9, 55),
        },
        {
          id: `notif-team-welcome-${u.id}`,
          userId: u.id,
          type: "employee",
          title: "Morning Shift Handover",
          message:
            "Please count the cash drawer before 8:00 AM and verify Milo & Peak stock shelves.",
          isRead: 1,
          referenceType: "broadcast",
          referenceId: "bcast-001",
          createdAt: isoDaysAgoAt(1, 7, 30),
          updatedAt: isoDaysAgoAt(1, 7, 30),
        },
      );
    }

    tx.insert(schema.notifications).values(starterRows).run();

    const existingBroadcasts = tx
      .select({ cnt: count() })
      .from(schema.broadcastMessages)
      .get();
    if ((existingBroadcasts?.cnt ?? 0) === 0) {
      tx.insert(schema.broadcastMessages)
        .values({
          id: "bcast-001",
          senderId: firstAdmin.id,
          senderName,
          recipientGroup: "employees",
          channel: "in_app",
          subject: "Morning Shift Handover",
          content:
            "Please count the cash drawer before 8:00 AM and verify Milo & Peak stock shelves.",
          recipientCount: allUsers.length,
          status: "sent",
          createdAt: isoDaysAgoAt(1, 7, 30),
          updatedAt: isoDaysAgoAt(1, 7, 30),
        })
        .run();
    }
  });
}

export async function ensureDbReady(): Promise<ExpoSqliteDrizzleDb> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const sqlite = getRawSqlite();
      ensureTablesSync(sqlite);
      const db = getDrizzleDb();
      await seedDatabaseIfEmpty(db);
      seedSuppliersIfEmpty(db);
      seedNotificationsIfEmpty(db);
      return db;
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}
