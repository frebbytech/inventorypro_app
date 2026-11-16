import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Drizzle ORM SQLite schema for Inventory Pro Mobile (`expo-sqlite`).
 * Mirrors `migrations/20260823161520_inventory_pro_dev_tables.ts`.
 */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstname: text("firstname").notNull().default(""),
  lastname: text("lastname").notNull().default(""),
  phonenumber: text("phonenumber"),
  role: text("role", { enum: ["admin", "member"] })
    .notNull()
    .default("member"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const userSessions = sqliteTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token"),
    deviceName: text("device_name"),
    deviceType: text("device_type"),
    operatingSystem: text("operating_system"),
    isActive: integer("is_active").notNull().default(1),
    lastActivityAt: text("last_activity_at"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("user_sessions_idx_user").on(table.userId),
    index("user_sessions_idx_active").on(table.isActive),
    index("user_sessions_idx_token").on(table.token),
  ],
);

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull().default("Inventory Pro"),
  businessAddress: text("business_address")
    .notNull()
    .default("AK-459-6364, Kumasi"),
  businessPhone: text("business_phone").notNull().default("+233543772591"),
  businessEmail: text("business_email")
    .notNull()
    .default("inventorypro@frebbytech.com"),
  currency: text("currency").notNull().default("GHS"),
  taxRate: real("tax_rate").notNull().default(0.01),
  stockAlertThreshold: integer("stock_alert_threshold").notNull().default(5),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const productCategories = sqliteTable(
  "product_categories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("product_categories_user_name_uidx").on(table.userId, table.name),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => productCategories.id),
    name: text("name").notNull(),
    photoUrl: text("photo_url").default(""),
    barcode: text("barcode").default(""),
    description: text("description").default(""),
    costPrice: real("cost_price").notNull(),
    unitPrice: real("unit_price").notNull(),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("products_idx_name").on(table.name),
    index("products_idx_barcode").on(table.barcode),
    index("products_idx_category").on(table.categoryId),
  ],
);

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  email: text("email"),
  address: text("address"),
  phonenumber: text("phonenumber"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const sales = sqliteTable(
  "sales",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    receiptNumber: text("receipt_number").notNull().unique(),
    date: text("date")
      .notNull()
      .default(sql`(datetime('now'))`),
    details: text("details").default(""),
    totalAmount: real("total_amount").notNull(),
    discountAmount: real("discount_amount").notNull().default(0),
    taxAmount: real("tax_amount").notNull().default(0),
    amountPaid: real("amount_paid").notNull().default(0),
    paymentMode: text("payment_mode", {
      enum: ["cash", "momo", "bank", "cheque"],
    })
      .notNull()
      .default("cash"),
    status: text("status", {
      enum: ["pending", "completed", "failed", "refunded"],
    })
      .notNull()
      .default("completed"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("sales_idx_date").on(table.date),
    index("sales_idx_status").on(table.status),
    index("sales_idx_receipt").on(table.receiptNumber),
  ],
);

export const saleItems = sqliteTable(
  "sale_items",
  {
    id: text("id").primaryKey(),
    salesId: text("sales_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    unitPrice: real("unit_price").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("sale_items_idx_sales").on(table.salesId),
    index("sale_items_idx_product").on(table.productId),
  ],
);

export const inventory = sqliteTable("inventory", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  productCategoryId: text("product_category_id")
    .notNull()
    .references(() => productCategories.id),
  quantity: integer("quantity").notNull(),
  restockDate: text("restock_date").notNull(),
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action", {
    enum: [
      "create",
      "update",
      "delete",
      "restore",
      "approve",
      "cancel",
      "login",
      "logout",
    ],
  }).notNull(),
  oldValues: text("old_values"),
  newValues: text("new_values"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    companyName: text("company_name").notNull().default(""),
    email: text("email"),
    address: text("address"),
    phonenumber: text("phonenumber"),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("suppliers_idx_name").on(table.name),
    index("suppliers_idx_company").on(table.companyName),
  ],
);

export const supplierTransactions = sqliteTable(
  "supplier_transactions",
  {
    id: text("id").primaryKey(),
    transactionNo: text("transaction_no").notNull().unique(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    deliveredBy: text("delivered_by"),
    transactionDate: text("transaction_date")
      .notNull()
      .default(sql`(datetime('now'))`),
    totalAmount: real("total_amount").notNull(),
    amountPaid: real("amount_paid").notNull().default(0),
    balance: real("balance").notNull().default(0),
    paymentMode: text("payment_mode", {
      enum: ["cash", "momo", "bank", "cheque"],
    })
      .notNull()
      .default("cash"),
    status: text("status", {
      enum: ["completed", "pending", "cancelled"],
    })
      .notNull()
      .default("completed"),
    notes: text("notes").default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("supplier_tx_idx_supplier").on(table.supplierId),
    index("supplier_tx_idx_date").on(table.transactionDate),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message"),
    isRead: integer("is_read").notNull().default(0),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("notifications_idx_user_read").on(table.userId, table.isRead),
    index("notifications_idx_created").on(table.createdAt),
  ],
);

export const broadcastMessages = sqliteTable(
  "broadcast_messages",
  {
    id: text("id").primaryKey(),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id),
    senderName: text("sender_name").notNull(),
    recipientGroup: text("recipient_group", {
      enum: ["employees", "customers", "suppliers"],
    }).notNull(),
    channel: text("channel", {
      enum: ["in_app", "sms", "email"],
    }).notNull(),
    subject: text("subject"),
    content: text("content").notNull(),
    recipientCount: integer("recipient_count").notNull().default(0),
    status: text("status", {
      enum: ["sent", "queued", "partial", "failed"],
    })
      .notNull()
      .default("sent"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("broadcast_messages_idx_created").on(table.createdAt)],
);

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(productCategories, {
    fields: [products.categoryId],
    references: [productCategories.id],
  }),
  saleItems: many(saleItems),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  cashier: one(users, {
    fields: [sales.userId],
    references: [users.id],
  }),
  items: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.salesId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

export type UserRecord = typeof users.$inferSelect;
export type ProductRecord = typeof products.$inferSelect;
export type ProductCategoryRecord = typeof productCategories.$inferSelect;
export type SaleRecord = typeof sales.$inferSelect;
export type SaleItemRecord = typeof saleItems.$inferSelect;
export type CustomerRecord = typeof customers.$inferSelect;
export type SupplierRecord = typeof suppliers.$inferSelect;
export type SupplierTransactionRecord = typeof supplierTransactions.$inferSelect;
export type SettingsRecord = typeof settings.$inferSelect;
export type NotificationRecord = typeof notifications.$inferSelect;
export type BroadcastMessageRecord = typeof broadcastMessages.$inferSelect;
