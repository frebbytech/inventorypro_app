import { and, asc, desc, eq, gt, gte, like, lt, lte, ne, or, sql } from "drizzle-orm";
import type { ExpoSqliteDrizzleDb } from "./client";
import { generateId, generateSessionToken, verifyPassword } from "./crypto";
import {
  auditLogs,
  customers,
  inventory,
  productCategories,
  products,
  saleItems,
  sales,
  settings,
  userSessions,
  users,
} from "./schema";
import {
  LOW_STOCK_THRESHOLD,
  type AdjustStockInput,
  type AuditLogItem,
  type AuditLogsQueryParams,
  type AuthLoginResponse,
  type AuthSessionResponse,
  type BulkImportProductsResult,
  type CategoryItem,
  type CreateCategoryInput,
  type CreateProductInput,
  type CreateRestockInput,
  type CreateSaleInput,
  type PaymentBreakdownItem,
  type PaymentMode,
  type ProductDetailResponse,
  type ProductItem,
  type ProductQueryParams,
  type ProductSaleRecord,
  type RefundSaleInput,
  type RestockLogItem,
  type RestockQueryParams,
  type SaleReceiptDetail,
  type SalesDateRange,
  type SalesQueryParams,
  type SalesReportData,
  type SaleStatus,
  type SaleTransactionSummary,
  type SessionUser,
  type StockAlertItem,
  type StoreProfile,
  type TodayDashboardData,
  type TopSellingProductItem,
  type UpdateBusinessSettingsInput,
  type UpdateCategoryInput,
  type UpdateProductInput,
} from "@/types/domain";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface JoinedProductRow {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  barcode: string | null;
  costPrice: number;
  unitPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: number;
  updatedAt: string;
}

function mapProductRow(row: JoinedProductRow): ProductItem {
  const unitPrice = Number(row.unitPrice) || 0;
  const stockQuantity = Number(row.stockQuantity) || 0;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    barcode: row.barcode || "",
    costPrice: Number(row.costPrice) || 0,
    unitPrice,
    stockQuantity,
    lowStockThreshold: Number(row.lowStockThreshold) || LOW_STOCK_THRESHOLD,
    stockValue: Number((stockQuantity * unitPrice).toFixed(2)),
    active: row.isActive === 1,
    updatedAt: row.updatedAt,
  };
}

function mapSessionUser(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    firstname: row.firstname,
    lastname: row.lastname,
    phonenumber: row.phonenumber ?? undefined,
    role: row.role,
    lastLoginAt: row.lastLoginAt,
  };
}

export function getStoreProfile(db: ExpoSqliteDrizzleDb): StoreProfile {
  const row = db
    .select({
      businessName: settings.businessName,
      businessAddress: settings.businessAddress,
      businessPhone: settings.businessPhone,
      businessEmail: settings.businessEmail,
      currency: settings.currency,
      taxRate: settings.taxRate,
      stockAlertThreshold: settings.stockAlertThreshold,
    })
    .from(settings)
    .limit(1)
    .get();

  if (!row) {
    return {
      storeName: "Inventory Pro",
      storeAddress: "AK-459-6364, Kumasi",
      storePhone: "+233543772591",
      storeEmail: "inventorypro@frebbytech.com",
      currency: "GHS",
      taxRate: 0.01,
      stockAlertThreshold: LOW_STOCK_THRESHOLD,
    };
  }

  return {
    storeName: row.businessName,
    storeAddress: row.businessAddress,
    storePhone: row.businessPhone,
    storeEmail: row.businessEmail,
    currency: row.currency || "GHS",
    taxRate: Number(row.taxRate) || 0,
    stockAlertThreshold: Number(row.stockAlertThreshold) || LOW_STOCK_THRESHOLD,
  };
}

export function updateStoreStockThreshold(
  db: ExpoSqliteDrizzleDb,
  input: { userId: string; threshold: number },
): StoreProfile {
  const cleanThreshold = Math.trunc(Number(input.threshold));
  if (!Number.isFinite(cleanThreshold) || cleanThreshold < 1 || cleanThreshold > 9999) {
    throw new Error("Stock alert threshold must be between 1 and 9,999 units.");
  }

  const nowIso = new Date().toISOString();

  db.transaction((tx) => {
    const existing = tx
      .select({ id: settings.id, stockAlertThreshold: settings.stockAlertThreshold })
      .from(settings)
      .limit(1)
      .get();

    if (existing) {
      tx.update(settings)
        .set({
          stockAlertThreshold: cleanThreshold,
          updatedAt: nowIso,
        })
        .where(eq(settings.id, existing.id))
        .run();

      tx.insert(auditLogs)
        .values({
          id: generateId("aud"),
          userId: input.userId,
          entityType: "settings",
          entityId: existing.id,
          action: "update",
          oldValues: JSON.stringify({
            stock_alert_threshold: existing.stockAlertThreshold,
          }),
          newValues: JSON.stringify({
            stock_alert_threshold: cleanThreshold,
          }),
        })
        .run();
    } else {
      const settingsId = generateId("settings");
      tx.insert(settings)
        .values({
          id: settingsId,
          userId: input.userId,
          stockAlertThreshold: cleanThreshold,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .run();
    }
  });

  return getStoreProfile(db);
}

export function updateStoreBusinessProfile(
  db: ExpoSqliteDrizzleDb,
  input: UpdateBusinessSettingsInput & { userId: string },
): StoreProfile {
  const storeName = input.storeName.trim();
  const storeAddress = input.storeAddress.trim();
  const storePhone = input.storePhone.trim();
  const storeEmail = input.storeEmail.trim();
  const currency = (input.currency?.trim() || "GHS").toUpperCase();
  const taxRate = Number(input.taxRate);

  if (storeName.length < 2) {
    throw new Error("Business name must be at least 2 characters.");
  }
  if (storeAddress.length < 5) {
    throw new Error("Business address must be at least 5 characters.");
  }
  if (storeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storeEmail)) {
    throw new Error("Enter a valid business email address.");
  }
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
    throw new Error("Tax rate must be between 0% and 100%.");
  }

  const normalizedTaxRate = Number(taxRate.toFixed(4));
  const nowIso = new Date().toISOString();

  db.transaction((tx) => {
    const existing = tx
      .select({
        id: settings.id,
        businessName: settings.businessName,
        businessAddress: settings.businessAddress,
        businessPhone: settings.businessPhone,
        businessEmail: settings.businessEmail,
        currency: settings.currency,
        taxRate: settings.taxRate,
      })
      .from(settings)
      .limit(1)
      .get();

    if (existing) {
      tx.update(settings)
        .set({
          businessName: storeName,
          businessAddress: storeAddress,
          businessPhone: storePhone,
          businessEmail: storeEmail,
          currency,
          taxRate: normalizedTaxRate,
          updatedAt: nowIso,
        })
        .where(eq(settings.id, existing.id))
        .run();

      tx.insert(auditLogs)
        .values({
          id: generateId("aud"),
          userId: input.userId,
          entityType: "settings",
          entityId: existing.id,
          action: "update",
          oldValues: JSON.stringify({
            business_name: existing.businessName,
            business_address: existing.businessAddress,
            business_phone: existing.businessPhone,
            business_email: existing.businessEmail,
            currency: existing.currency,
            tax_rate: existing.taxRate,
          }),
          newValues: JSON.stringify({
            business_name: storeName,
            business_address: storeAddress,
            business_phone: storePhone,
            business_email: storeEmail,
            currency,
            tax_rate: normalizedTaxRate,
          }),
        })
        .run();
    } else {
      const settingsId = generateId("settings");
      tx.insert(settings)
        .values({
          id: settingsId,
          userId: input.userId,
          businessName: storeName,
          businessAddress: storeAddress,
          businessPhone: storePhone,
          businessEmail: storeEmail,
          currency,
          taxRate: normalizedTaxRate,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .run();
    }
  });

  return getStoreProfile(db);
}

export async function authenticateWithCredentials(
  db: ExpoSqliteDrizzleDb,
  input: { identifier: string; password: string; deviceName?: string; platform?: string },
): Promise<AuthLoginResponse> {
  const cleanIdentifier = input.identifier.trim().toLowerCase();
  if (!cleanIdentifier || !input.password) {
    throw new Error("Username/email and password are required.");
  }

  const user = db
    .select()
    .from(users)
    .where(
      or(
        eq(sql`LOWER(${users.username})`, cleanIdentifier),
        eq(sql`LOWER(${users.email})`, cleanIdentifier),
      ),
    )
    .limit(1)
    .get();

  if (!user) {
    throw new Error("Invalid username/email or password.");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid username/email or password.");
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const sessionId = generateId("sess");
  const token = generateSessionToken();

  db.transaction((tx) => {
    tx.update(users)
      .set({
        lastLoginAt: nowIso,
        failedLoginAttempts: 0,
        updatedAt: nowIso,
      })
      .where(eq(users.id, user.id))
      .run();

    tx.insert(userSessions)
      .values({
        id: sessionId,
        userId: user.id,
        token,
        deviceName: input.deviceName || "Inventory Pro Mobile",
        deviceType: "mobile",
        operatingSystem: input.platform || "expo",
        isActive: 1,
        lastActivityAt: nowIso,
        expiresAt,
      })
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: user.id,
        entityType: "user_session",
        entityId: sessionId,
        action: "login",
        newValues: JSON.stringify({
          deviceName: input.deviceName || "Inventory Pro Mobile",
          platform: input.platform || "expo",
        }),
      })
      .run();
  });

  const store = getStoreProfile(db);
  return {
    token,
    expiresAt,
    user: {
      ...mapSessionUser(user),
      lastLoginAt: nowIso,
    },
    store,
  };
}

export function restoreSessionByToken(
  db: ExpoSqliteDrizzleDb,
  token: string,
): (AuthSessionResponse & { sessionId: string }) | null {
  if (!token) return null;

  const session = db
    .select()
    .from(userSessions)
    .where(and(eq(userSessions.token, token), eq(userSessions.isActive, 1)))
    .limit(1)
    .get();

  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const user = db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)
    .get();

  if (!user) return null;

  db.update(userSessions)
    .set({ lastActivityAt: new Date().toISOString() })
    .where(eq(userSessions.id, session.id))
    .run();

  return {
    sessionId: session.id,
    user: mapSessionUser(user),
    store: getStoreProfile(db),
  };
}

export function revokeSessionByToken(
  db: ExpoSqliteDrizzleDb,
  token: string,
): void {
  if (!token) return;
  const session = db
    .select()
    .from(userSessions)
    .where(eq(userSessions.token, token))
    .limit(1)
    .get();

  if (!session) return;

  db.transaction((tx) => {
    tx.update(userSessions)
      .set({ isActive: 0 })
      .where(eq(userSessions.id, session.id))
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: session.userId,
        entityType: "user_session",
        entityId: session.id,
        action: "logout",
      })
      .run();
  });
}

export function getTodayDashboard(db: ExpoSqliteDrizzleDb): TodayDashboardData {
  const todayUtcDate = new Date().toISOString().slice(0, 10);
  const yestDate = new Date();
  yestDate.setUTCDate(yestDate.getUTCDate() - 1);
  const yesterdayUtcDate = yestDate.toISOString().slice(0, 10);

  const todayStats = db
    .select({
      revenue: sql<number>`COALESCE(SUM(${sales.totalAmount}), 0)`,
      orders: sql<number>`COUNT(*)`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.status, "completed"),
        eq(sql`substr(${sales.date}, 1, 10)`, todayUtcDate),
      ),
    )
    .get();

  const yesterdayStats = db
    .select({
      revenue: sql<number>`COALESCE(SUM(${sales.totalAmount}), 0)`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.status, "completed"),
        eq(sql`substr(${sales.date}, 1, 10)`, yesterdayUtcDate),
      ),
    )
    .get();

  const todayRevenue = Number(todayStats?.revenue) || 0;
  const todayOrders = Number(todayStats?.orders) || 0;
  const todayAov = todayOrders > 0 ? todayRevenue / todayOrders : 0;
  const yesterdayRevenue = Number(yesterdayStats?.revenue) || 0;
  const todayVsYesterdayRevenueDelta =
    yesterdayRevenue > 0
      ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
      : 0;

  const productRows = db
    .select({
      id: products.id,
      name: products.name,
      categoryName: productCategories.name,
      barcode: products.barcode,
      costPrice: products.costPrice,
      unitPrice: products.unitPrice,
      stockQuantity: products.stockQuantity,
      lowStockThreshold: products.lowStockThreshold,
    })
    .from(products)
    .innerJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(eq(products.isActive, 1))
    .all();

  const totalInventoryValuation = productRows.reduce(
    (sum, p) => sum + Number(p.stockQuantity) * Number(p.unitPrice),
    0,
  );
  const totalStockUnits = productRows.reduce(
    (sum, p) => sum + Number(p.stockQuantity),
    0,
  );

  const storeThreshold = getStoreProfile(db).stockAlertThreshold || LOW_STOCK_THRESHOLD;

  const lowStockAlerts: StockAlertItem[] = productRows
    .filter((p) => Number(p.stockQuantity) < storeThreshold)
    .map((p) => {
      const stock = Number(p.stockQuantity);
      return {
        id: p.id,
        name: p.name,
        categoryName: p.categoryName,
        barcode: p.barcode || "",
        stock,
        threshold: storeThreshold,
        costPrice: Number(p.costPrice),
        sellingPrice: Number(p.unitPrice),
        severity: stock <= 0 ? ("critical" as const) : ("warning" as const),
      };
    })
    .sort((a, b) => a.stock - b.stock);

  const outOfStockCount = lowStockAlerts.filter((a) => a.stock <= 0).length;
  const lowStockCount = lowStockAlerts.filter((a) => a.stock > 0).length;

  return {
    kpis: {
      todayRevenue: Number(todayRevenue.toFixed(2)),
      todayOrders,
      todayAov: Number(todayAov.toFixed(2)),
      yesterdayRevenue: Number(yesterdayRevenue.toFixed(2)),
      todayVsYesterdayRevenueDelta: Number(todayVsYesterdayRevenueDelta.toFixed(1)),
      totalInventoryValuation: Number(totalInventoryValuation.toFixed(2)),
      totalProductsCount: productRows.length,
      totalStockUnits,
      outOfStockCount,
      lowStockCount,
      lastSyncedAt: new Date().toISOString(),
    },
    lowStockAlerts,
  };
}

export function listCategories(db: ExpoSqliteDrizzleDb): string[] {
  const rows = db
    .selectDistinct({ name: productCategories.name })
    .from(productCategories)
    .where(eq(productCategories.isActive, 1))
    .orderBy(asc(productCategories.name))
    .all();

  return ["All", ...rows.map((r) => r.name)];
}

export function listProducts(
  db: ExpoSqliteDrizzleDb,
  params?: ProductQueryParams,
): ProductItem[] {
  const conditions = [];

  if (params?.query?.trim()) {
    const pattern = `%${params.query.trim()}%`;
    conditions.push(
      or(
        like(products.name, pattern),
        like(products.barcode, pattern),
        like(productCategories.name, pattern),
      ),
    );
  }

  if (params?.category && params.category !== "All") {
    conditions.push(eq(productCategories.name, params.category));
  }

  const configuredThreshold =
    typeof params?.threshold === "number" &&
    Number.isFinite(params.threshold) &&
    params.threshold >= 1
      ? Math.trunc(params.threshold)
      : getStoreProfile(db).stockAlertThreshold || LOW_STOCK_THRESHOLD;

  if (params?.stockStatus === "out_of_stock") {
    conditions.push(lte(products.stockQuantity, 0));
  } else if (params?.stockStatus === "low_stock") {
    conditions.push(
      and(
        gt(products.stockQuantity, 0),
        lt(products.stockQuantity, configuredThreshold),
      ),
    );
  } else if (params?.stockStatus === "in_stock") {
    conditions.push(sql`${products.stockQuantity} >= ${configuredThreshold}`);
  }

  const baseQuery = db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      categoryId: products.categoryId,
      categoryName: productCategories.name,
      barcode: products.barcode,
      costPrice: products.costPrice,
      unitPrice: products.unitPrice,
      stockQuantity: products.stockQuantity,
      lowStockThreshold: products.lowStockThreshold,
      isActive: products.isActive,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(productCategories, eq(products.categoryId, productCategories.id));

  const rows =
    conditions.length > 0
      ? baseQuery
          .where(and(...conditions))
          .orderBy(desc(products.isActive), asc(products.stockQuantity), asc(products.name))
          .all()
      : baseQuery
          .orderBy(desc(products.isActive), asc(products.stockQuantity), asc(products.name))
          .all();

  return rows.map(mapProductRow);
}

export function getProductDetail(
  db: ExpoSqliteDrizzleDb,
  productId: string,
): ProductDetailResponse | null {
  const row = db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      categoryId: products.categoryId,
      categoryName: productCategories.name,
      barcode: products.barcode,
      costPrice: products.costPrice,
      unitPrice: products.unitPrice,
      stockQuantity: products.stockQuantity,
      lowStockThreshold: products.lowStockThreshold,
      isActive: products.isActive,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(eq(products.id, productId))
    .limit(1)
    .get();

  if (!row) return null;

  const recentSalesRows = db
    .select({
      id: saleItems.id,
      saleId: sales.id,
      receiptNo: sales.receiptNumber,
      customerName: customers.name,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      saleDate: sales.date,
      paymentMode: sales.paymentMode,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.salesId, sales.id))
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(eq(saleItems.productId, productId))
    .orderBy(desc(sales.date))
    .limit(15)
    .all();

  const recentSales: ProductSaleRecord[] = recentSalesRows.map((s) => ({
    id: s.id,
    saleId: s.saleId,
    receiptNo: s.receiptNo,
    customerName: s.customerName,
    quantity: Number(s.quantity),
    unitPrice: Number(s.unitPrice),
    subtotal: Number((Number(s.quantity) * Number(s.unitPrice)).toFixed(2)),
    saleDate: s.saleDate,
    paymentMode: s.paymentMode,
  }));

  return {
    product: mapProductRow(row),
    recentSales,
  };
}

export function findProductByBarcode(
  db: ExpoSqliteDrizzleDb,
  barcode: string,
): ProductItem | null {
  const clean = barcode.trim();
  if (!clean) return null;

  const row = db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      categoryId: products.categoryId,
      categoryName: productCategories.name,
      barcode: products.barcode,
      costPrice: products.costPrice,
      unitPrice: products.unitPrice,
      stockQuantity: products.stockQuantity,
      lowStockThreshold: products.lowStockThreshold,
      isActive: products.isActive,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(eq(sql`TRIM(${products.barcode})`, clean))
    .limit(1)
    .get();

  return row ? mapProductRow(row) : null;
}

export function adjustProductStock(
  db: ExpoSqliteDrizzleDb,
  input: AdjustStockInput & { productId: string; userId: string },
): ProductItem {
  return db.transaction((tx) => {
    const existing = tx
      .select({
        id: products.id,
        categoryId: products.categoryId,
        stockQuantity: products.stockQuantity,
      })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1)
      .get();

    if (!existing) {
      throw new Error("Product not found.");
    }

    const oldQty = Number(existing.stockQuantity);
    let nextQty = oldQty;
    if (typeof input.setQuantity === "number" && Number.isFinite(input.setQuantity)) {
      nextQty = Math.trunc(input.setQuantity);
    } else if (typeof input.delta === "number" && Number.isFinite(input.delta)) {
      nextQty = oldQty + Math.trunc(input.delta);
    } else {
      throw new Error("Provide a stock delta or target quantity.");
    }

    if (nextQty < 0) {
      throw new Error("Stock quantity cannot be negative.");
    }

    const delta = nextQty - oldQty;
    const nowIso = new Date().toISOString();

    tx.update(products)
      .set({ stockQuantity: nextQty, updatedAt: nowIso })
      .where(eq(products.id, existing.id))
      .run();

    tx.insert(inventory)
      .values({
        id: generateId("inv"),
        userId: input.userId,
        productId: existing.id,
        productCategoryId: existing.categoryId,
        quantity: delta,
        restockDate: nowIso.slice(0, 10),
        notes: input.reason?.trim() || "Mobile stock adjustment",
      })
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "product",
        entityId: existing.id,
        action: "update",
        oldValues: JSON.stringify({ stock_quantity: oldQty }),
        newValues: JSON.stringify({
          stock_quantity: nextQty,
          reason: input.reason || "Mobile adjustment",
        }),
      })
      .run();

    const updated = tx
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
        barcode: products.barcode,
        costPrice: products.costPrice,
        unitPrice: products.unitPrice,
        stockQuantity: products.stockQuantity,
        lowStockThreshold: products.lowStockThreshold,
        isActive: products.isActive,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .innerJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(eq(products.id, existing.id))
      .limit(1)
      .get();

    if (!updated) {
      throw new Error("Unable to load updated product.");
    }

    return mapProductRow(updated);
  });
}

function getDateRangeStartDate(dateRange?: SalesDateRange): string | null {
  if (!dateRange || dateRange === "all") return null;
  const now = new Date();
  if (dateRange === "today") {
    return now.toISOString().slice(0, 10);
  }
  const daysBack = dateRange === "7d" ? 6 : 29;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - daysBack);
  return start.toISOString().slice(0, 10);
}

export function listSales(
  db: ExpoSqliteDrizzleDb,
  params?: SalesQueryParams,
): SaleTransactionSummary[] {
  const conditions = [];

  if (params?.query?.trim()) {
    const pattern = `%${params.query.trim()}%`;
    conditions.push(
      or(
        like(sales.receiptNumber, pattern),
        like(customers.name, pattern),
        like(users.username, pattern),
      ),
    );
  }

  if (params?.paymentMode && params.paymentMode !== "all") {
    conditions.push(eq(sales.paymentMode, params.paymentMode));
  }

  if (params?.status && params.status !== "all") {
    conditions.push(eq(sales.status, params.status));
  }

  const startDate = getDateRangeStartDate(params?.dateRange);
  if (startDate) {
    conditions.push(gte(sql`substr(${sales.date}, 1, 10)`, startDate));
  }

  const baseQuery = db
    .select({
      id: sales.id,
      receiptNo: sales.receiptNumber,
      customerName: customers.name,
      customerPhone: customers.phonenumber,
      firstname: users.firstname,
      lastname: users.lastname,
      username: users.username,
      saleDate: sales.date,
      totalAmount: sales.totalAmount,
      amountPaid: sales.amountPaid,
      discount: sales.discountAmount,
      tax: sales.taxAmount,
      paymentMode: sales.paymentMode,
      status: sales.status,
      itemCount: sql<number>`(SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si WHERE si.sales_id = ${sales.id})`,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .innerJoin(users, eq(sales.userId, users.id));

  const rows =
    conditions.length > 0
      ? baseQuery.where(and(...conditions)).orderBy(desc(sales.date)).all()
      : baseQuery.orderBy(desc(sales.date)).all();

  return rows.map((r) => {
    const fullName = `${r.firstname} ${r.lastname}`.trim();
    return {
      id: r.id,
      receiptNo: r.receiptNo,
      customerName: r.customerName,
      customerPhone: r.customerPhone ?? undefined,
      cashierName: fullName || r.username,
      saleDate: r.saleDate,
      totalAmount: Number(r.totalAmount),
      amountPaid: Number(r.amountPaid),
      discount: Number(r.discount),
      tax: Number(r.tax),
      paymentMode: r.paymentMode as PaymentMode,
      status: r.status as SaleStatus,
      itemCount: Number(r.itemCount),
    };
  });
}

export function getSaleReceipt(
  db: ExpoSqliteDrizzleDb,
  saleId: string,
): SaleReceiptDetail | null {
  const row = db
    .select({
      id: sales.id,
      receiptNo: sales.receiptNumber,
      customerName: customers.name,
      customerPhone: customers.phonenumber,
      saleDate: sales.date,
      details: sales.details,
      totalAmount: sales.totalAmount,
      amountPaid: sales.amountPaid,
      discountAmount: sales.discountAmount,
      taxAmount: sales.taxAmount,
      paymentMode: sales.paymentMode,
      status: sales.status,
      firstname: users.firstname,
      lastname: users.lastname,
      username: users.username,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .innerJoin(users, eq(sales.userId, users.id))
    .where(or(eq(sales.id, saleId), eq(sales.receiptNumber, saleId)))
    .limit(1)
    .get();

  if (!row) return null;

  const itemRows = db
    .select({
      id: saleItems.id,
      productId: saleItems.productId,
      productName: products.name,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
    })
    .from(saleItems)
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.salesId, row.id))
    .all();

  const mappedItems = itemRows.map((i) => {
    const quantity = Number(i.quantity);
    const unitPrice = Number(i.unitPrice);
    return {
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      quantity,
      unitPrice,
      subtotal: Number((quantity * unitPrice).toFixed(2)),
    };
  });

  const store = getStoreProfile(db);
  const subtotal = mappedItems.reduce((sum, i) => sum + i.subtotal, 0);
  const taxableBase = Math.max(0, subtotal - Number(row.discountAmount));
  const effectiveTaxRate =
    taxableBase > 0 && Number(row.taxAmount) > 0
      ? Number((Number(row.taxAmount) / taxableBase).toFixed(4))
      : 0;
  const fullName = `${row.firstname} ${row.lastname}`.trim();

  return {
    id: row.id,
    receiptNo: row.receiptNo,
    customerName: row.customerName,
    customerPhone: row.customerPhone ?? undefined,
    saleDate: row.saleDate,
    subtotal: Number(subtotal.toFixed(2)),
    taxRate: effectiveTaxRate,
    taxAmount: Number(row.taxAmount),
    discountAmount: Number(row.discountAmount),
    totalAmount: Number(row.totalAmount),
    amountPaid: Number(row.amountPaid),
    paymentMode: row.paymentMode as PaymentMode,
    status: row.status as SaleStatus,
    attendantName: fullName || row.username,
    notes: row.details?.trim() || undefined,
    storeName: store.storeName,
    storeAddress: store.storeAddress,
    storePhone: store.storePhone,
    storeEmail: store.storeEmail,
    currency: store.currency,
    items: mappedItems,
  };
}

export function refundSale(
  db: ExpoSqliteDrizzleDb,
  input: RefundSaleInput & { saleId: string; userId: string },
): SaleReceiptDetail {
  const restockItems = input.restockItems !== false;
  const cleanReason = input.reason?.trim() || "";

  db.transaction((tx) => {
    const existing = tx
      .select({
        id: sales.id,
        receiptNumber: sales.receiptNumber,
        status: sales.status,
        amountPaid: sales.amountPaid,
        totalAmount: sales.totalAmount,
        details: sales.details,
      })
      .from(sales)
      .where(or(eq(sales.id, input.saleId), eq(sales.receiptNumber, input.saleId)))
      .limit(1)
      .get();

    if (!existing) {
      throw new Error("Sale transaction not found.");
    }
    if (existing.status === "refunded") {
      throw new Error("This receipt has already been refunded.");
    }

    const nowIso = new Date().toISOString();
    const refundTag = cleanReason
      ? `Refunded: ${cleanReason}`
      : "Refunded via mobile POS";
    const nextDetails = existing.details?.trim()
      ? `${existing.details.trim()} · ${refundTag}`
      : refundTag;

    tx.update(sales)
      .set({
        status: "refunded",
        amountPaid: 0,
        details: nextDetails,
        updatedAt: nowIso,
      })
      .where(eq(sales.id, existing.id))
      .run();

    let restockedUnits = 0;

    if (restockItems) {
      const itemsToRestore = tx
        .select({
          productId: saleItems.productId,
          quantity: saleItems.quantity,
          categoryId: products.categoryId,
          currentStock: products.stockQuantity,
        })
        .from(saleItems)
        .innerJoin(products, eq(saleItems.productId, products.id))
        .where(eq(saleItems.salesId, existing.id))
        .all();

      for (const item of itemsToRestore) {
        const qty = Math.max(0, Math.trunc(Number(item.quantity)));
        if (qty <= 0) continue;
        restockedUnits += qty;

        tx.update(products)
          .set({
            stockQuantity: Number(item.currentStock) + qty,
            updatedAt: nowIso,
          })
          .where(eq(products.id, item.productId))
          .run();

        tx.insert(inventory)
          .values({
            id: generateId("inv"),
            userId: input.userId,
            productId: item.productId,
            productCategoryId: item.categoryId,
            quantity: qty,
            restockDate: nowIso.slice(0, 10),
            notes: `Restock from refund (${existing.receiptNumber})`,
          })
          .run();
      }
    }

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "sale",
        entityId: existing.id,
        action: "update",
        oldValues: JSON.stringify({
          status: existing.status,
          amountPaid: Number(existing.amountPaid),
        }),
        newValues: JSON.stringify({
          status: "refunded",
          amountPaid: 0,
          restockItems,
          restockedUnits,
          reason: cleanReason || undefined,
        }),
      })
      .run();
  });

  const updated = getSaleReceipt(db, input.saleId);
  if (!updated) {
    throw new Error("Sale refunded, but failed to reload receipt.");
  }
  return updated;
}

export function getSalesReport(
  db: ExpoSqliteDrizzleDb,
  dateRange: SalesDateRange = "30d",
): SalesReportData {
  const store = getStoreProfile(db);
  const startDate = getDateRangeStartDate(dateRange);

  const saleRows = startDate
    ? db
        .select({
          id: sales.id,
          totalAmount: sales.totalAmount,
          discountAmount: sales.discountAmount,
          taxAmount: sales.taxAmount,
          paymentMode: sales.paymentMode,
          status: sales.status,
        })
        .from(sales)
        .where(gte(sql`substr(${sales.date}, 1, 10)`, startDate))
        .all()
    : db
        .select({
          id: sales.id,
          totalAmount: sales.totalAmount,
          discountAmount: sales.discountAmount,
          taxAmount: sales.taxAmount,
          paymentMode: sales.paymentMode,
          status: sales.status,
        })
        .from(sales)
        .all();

  const completedSales = saleRows.filter((s) => s.status === "completed");
  const refundedSales = saleRows.filter((s) => s.status === "refunded");

  const grossRevenue = completedSales.reduce(
    (sum, s) => sum + Number(s.totalAmount),
    0,
  );
  const refundedAmount = refundedSales.reduce(
    (sum, s) => sum + Number(s.totalAmount),
    0,
  );
  const totalDiscount = completedSales.reduce(
    (sum, s) => sum + Number(s.discountAmount),
    0,
  );
  const totalTax = completedSales.reduce(
    (sum, s) => sum + Number(s.taxAmount),
    0,
  );
  const averageOrderValue =
    completedSales.length > 0 ? grossRevenue / completedSales.length : 0;

  const modes: PaymentMode[] = ["cash", "momo", "bank", "cheque"];
  const paymentBreakdown: PaymentBreakdownItem[] = modes.map((mode) => {
    const matching = completedSales.filter((s) => s.paymentMode === mode);
    const amount = matching.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    return {
      paymentMode: mode,
      count: matching.length,
      amount: Number(amount.toFixed(2)),
      sharePercent:
        grossRevenue > 0 ? Number(((amount / grossRevenue) * 100).toFixed(1)) : 0,
    };
  });

  const itemConditions = [eq(sales.status, "completed")];
  if (startDate) {
    itemConditions.push(gte(sql`substr(${sales.date}, 1, 10)`, startDate));
  }

  const lineRows = db
    .select({
      productId: saleItems.productId,
      productName: products.name,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      costPrice: products.costPrice,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.salesId, sales.id))
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(and(...itemConditions))
    .all();

  let estimatedCost = 0;
  let totalUnitsSold = 0;
  const productTotals = new Map<string, TopSellingProductItem>();

  for (const line of lineRows) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const cost = Number(line.costPrice) || 0;
    const revenue = qty * price;

    totalUnitsSold += qty;
    estimatedCost += qty * cost;

    const existing = productTotals.get(line.productId);
    if (existing) {
      existing.unitsSold += qty;
      existing.revenue = Number((existing.revenue + revenue).toFixed(2));
    } else {
      productTotals.set(line.productId, {
        productId: line.productId,
        productName: line.productName,
        unitsSold: qty,
        revenue: Number(revenue.toFixed(2)),
      });
    }
  }

  const netBeforeTax = Math.max(0, grossRevenue - totalTax);
  const grossProfit = netBeforeTax - estimatedCost;
  const profitMarginPercent =
    netBeforeTax > 0 ? (grossProfit / netBeforeTax) * 100 : 0;

  const topProducts = Array.from(productTotals.values())
    .sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold)
    .slice(0, 5);

  return {
    dateRange,
    currency: store.currency,
    completedCount: completedSales.length,
    refundedCount: refundedSales.length,
    grossRevenue: Number(grossRevenue.toFixed(2)),
    refundedAmount: Number(refundedAmount.toFixed(2)),
    totalDiscount: Number(totalDiscount.toFixed(2)),
    totalTax: Number(totalTax.toFixed(2)),
    estimatedCost: Number(estimatedCost.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    profitMarginPercent: Number(profitMarginPercent.toFixed(1)),
    averageOrderValue: Number(averageOrderValue.toFixed(2)),
    totalUnitsSold,
    paymentBreakdown,
    topProducts,
  };
}

export function createSale(
  db: ExpoSqliteDrizzleDb,
  input: CreateSaleInput & { userId: string },
): SaleReceiptDetail {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Add at least one item before completing the sale.");
  }

  const saleId = db.transaction((tx) => {
    const storeRow = tx
      .select({ taxRate: settings.taxRate })
      .from(settings)
      .limit(1)
      .get();
    const storeTaxRate = Number(storeRow?.taxRate ?? 0.01);

    const nowIso = new Date().toISOString();
    const dateStamp = nowIso.slice(0, 10).replace(/-/g, "");

    const resolvedItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      newStock: number;
    }> = [];

    let subtotal = 0;

    for (const rawItem of input.items) {
      const qty = Math.trunc(rawItem.quantity);
      if (!rawItem.productId || !Number.isFinite(qty) || qty <= 0) {
        throw new Error("Each sale item must have a positive quantity.");
      }

      const product = tx
        .select({
          id: products.id,
          name: products.name,
          unitPrice: products.unitPrice,
          stockQuantity: products.stockQuantity,
        })
        .from(products)
        .where(eq(products.id, rawItem.productId))
        .limit(1)
        .get();

      if (!product) {
        throw new Error(`Product ${rawItem.productId} not found.`);
      }

      if (Number(product.stockQuantity) < qty) {
        throw new Error(
          `Insufficient stock for ${product.name} (${product.stockQuantity} remaining).`,
        );
      }

      const unitPrice = Number(product.unitPrice);
      subtotal += Number((unitPrice * qty).toFixed(2));
      resolvedItems.push({
        productId: product.id,
        quantity: qty,
        unitPrice,
        newStock: Number(product.stockQuantity) - qty,
      });
    }

    const discountAmount = Math.max(
      0,
      Math.min(subtotal, Number(input.discountAmount ?? 0) || 0),
    );
    const applyTax = input.applyTax ?? false;
    const taxable = Math.max(0, subtotal - discountAmount);
    const taxAmount = applyTax ? Number((taxable * storeTaxRate).toFixed(2)) : 0;
    const totalAmount = Number((taxable + taxAmount).toFixed(2));

    const cleanCustomerName = input.customerName?.trim() || "Walk-in Customer";
    const cleanCustomerPhone = input.customerPhone?.trim() || null;

    const existingCustomer = tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(sql`LOWER(${customers.name})`, cleanCustomerName.toLowerCase()))
      .limit(1)
      .get();

    let customerId: string;
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      customerId = generateId("cust");
      tx.insert(customers)
        .values({
          id: customerId,
          userId: input.userId,
          name: cleanCustomerName,
          phonenumber: cleanCustomerPhone,
        })
        .run();
    }

    const newSaleId = generateId("sale");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const receiptNo = `RCP-${dateStamp}-${randomSuffix}`;
    const paymentMode: PaymentMode = input.paymentMode || "cash";

    tx.insert(sales)
      .values({
        id: newSaleId,
        customerId,
        userId: input.userId,
        receiptNumber: receiptNo,
        date: nowIso,
        details: input.notes?.trim() || "Mobile Quick POS",
        totalAmount,
        discountAmount,
        taxAmount,
        amountPaid: totalAmount,
        paymentMode,
        status: "completed",
      })
      .run();

    for (const item of resolvedItems) {
      tx.insert(saleItems)
        .values({
          id: generateId("si"),
          salesId: newSaleId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })
        .run();

      tx.update(products)
        .set({ stockQuantity: item.newStock, updatedAt: nowIso })
        .where(eq(products.id, item.productId))
        .run();
    }

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "sale",
        entityId: newSaleId,
        action: "create",
        newValues: JSON.stringify({
          receiptNo,
          totalAmount,
          paymentMode,
          itemCount: resolvedItems.length,
        }),
      })
      .run();

    return newSaleId;
  });

  const receipt = getSaleReceipt(db, saleId);
  if (!receipt) {
    throw new Error("Sale completed, but failed to load receipt.");
  }
  return receipt;
}

export function createProduct(
  db: ExpoSqliteDrizzleDb,
  input: CreateProductInput & { userId: string },
): ProductItem {
  const result = bulkCreateProducts(db, {
    items: [input],
    userId: input.userId,
  });
  return result.products[0];
}

export function bulkCreateProducts(
  db: ExpoSqliteDrizzleDb,
  input: { items: CreateProductInput[]; userId: string },
): BulkImportProductsResult {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Provide at least one product to create.");
  }

  return db.transaction((tx) => {
    const existingCategories = tx
      .select({
        id: productCategories.id,
        name: productCategories.name,
      })
      .from(productCategories)
      .all();

    const categoryMap = new Map<string, { id: string; name: string }>();
    for (const cat of existingCategories) {
      const key = cat.name.trim().toLowerCase();
      if (!categoryMap.has(key)) {
        categoryMap.set(key, { id: cat.id, name: cat.name });
      }
    }

    let newCategoriesCount = 0;
    const nowIso = new Date().toISOString();
    const createdProducts: ProductItem[] = [];

    for (const raw of input.items) {
      const name = raw.name?.trim();
      if (!name) {
        throw new Error("Every product must have a non-empty name.");
      }

      const costPrice = Number(raw.costPrice);
      const unitPrice = Number(raw.unitPrice);
      const stockQuantity = Math.max(0, Math.trunc(Number(raw.stockQuantity) || 0));
      const lowStockThreshold = Math.max(
        1,
        Math.trunc(Number(raw.lowStockThreshold ?? LOW_STOCK_THRESHOLD) || LOW_STOCK_THRESHOLD),
      );

      if (!Number.isFinite(costPrice) || costPrice < 0) {
        throw new Error(`Invalid cost price for "${name}".`);
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`Invalid selling price for "${name}".`);
      }

      const rawCategoryName = raw.categoryName?.trim() || "General";
      const catKey = rawCategoryName.toLowerCase();
      let category = categoryMap.get(catKey);

      if (!category) {
        const newCatId = generateId("cat");
        tx.insert(productCategories)
          .values({
            id: newCatId,
            userId: input.userId,
            name: rawCategoryName,
            description: "Added from mobile product catalog",
            isActive: 1,
            createdAt: nowIso,
            updatedAt: nowIso,
          })
          .run();
        category = { id: newCatId, name: rawCategoryName };
        categoryMap.set(catKey, category);
        newCategoriesCount += 1;
      }

      const barcode = raw.barcode?.trim() || "";
      const description = raw.description?.trim() || "";
      const isActive = raw.active !== false ? 1 : 0;
      const productId = generateId("prod");

      tx.insert(products)
        .values({
          id: productId,
          userId: input.userId,
          categoryId: category.id,
          name,
          barcode,
          description,
          costPrice: Number(costPrice.toFixed(2)),
          unitPrice: Number(unitPrice.toFixed(2)),
          stockQuantity,
          lowStockThreshold,
          isActive,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .run();

      if (stockQuantity > 0) {
        tx.insert(inventory)
          .values({
            id: generateId("inv"),
            userId: input.userId,
            productId,
            productCategoryId: category.id,
            quantity: stockQuantity,
            restockDate: nowIso.slice(0, 10),
            notes:
              input.items.length > 1
                ? "Opening stock (Bulk CSV/Excel import)"
                : "Opening stock (New product)",
          })
          .run();
      }

      createdProducts.push({
        id: productId,
        name,
        description,
        categoryId: category.id,
        categoryName: category.name,
        barcode,
        costPrice: Number(costPrice.toFixed(2)),
        unitPrice: Number(unitPrice.toFixed(2)),
        stockQuantity,
        lowStockThreshold,
        stockValue: Number((stockQuantity * Number(unitPrice.toFixed(2))).toFixed(2)),
        active: isActive === 1,
        updatedAt: nowIso,
      });
    }

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: createdProducts.length > 1 ? "products" : "product",
        entityId:
          createdProducts.length === 1
            ? createdProducts[0].id
            : `bulk-${createdProducts.length}`,
        action: "create",
        newValues: JSON.stringify({
          createdCount: createdProducts.length,
          newCategoriesCount,
          names: createdProducts.slice(0, 5).map((p) => p.name),
        }),
      })
      .run();

    return {
      createdCount: createdProducts.length,
      newCategoriesCount,
      products: createdProducts,
    };
  });
}

export function listAuditLogs(
  db: ExpoSqliteDrizzleDb,
  params?: AuditLogsQueryParams,
): AuditLogItem[] {
  const limit =
    typeof params?.limit === "number" && params.limit > 0
      ? Math.min(200, Math.trunc(params.limit))
      : 80;

  const conditions = [];
  if (params?.query?.trim()) {
    const pattern = `%${params.query.trim()}%`;
    conditions.push(
      or(
        like(auditLogs.entityType, pattern),
        like(auditLogs.entityId, pattern),
        like(auditLogs.newValues, pattern),
        like(users.username, pattern),
      ),
    );
  }

  if (params?.action && params.action !== "all") {
    conditions.push(
      eq(
        auditLogs.action,
        params.action as typeof auditLogs.$inferSelect.action,
      ),
    );
  }

  const baseQuery = db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      username: users.username,
      firstname: users.firstname,
      lastname: users.lastname,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      oldValues: auditLogs.oldValues,
      newValues: auditLogs.newValues,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id));

  const rows =
    conditions.length > 0
      ? baseQuery
          .where(and(...conditions))
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit)
          .all()
      : baseQuery.orderBy(desc(auditLogs.createdAt)).limit(limit).all();

  return rows.map((r) => {
    const fullName = [r.firstname, r.lastname].filter(Boolean).join(" ").trim();
    const username = r.username ?? "system";
    return {
      id: r.id,
      userId: r.userId,
      username,
      userFullName: fullName || username,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      oldValues: r.oldValues,
      newValues: r.newValues,
      createdAt: r.createdAt,
    };
  });
}

export function updateProduct(
  db: ExpoSqliteDrizzleDb,
  input: UpdateProductInput & { productId: string; userId: string },
): ProductItem {
  return db.transaction((tx) => {
    const existing = tx
      .select({
        id: products.id,
        userId: products.userId,
        categoryId: products.categoryId,
        name: products.name,
        description: products.description,
        barcode: products.barcode,
        costPrice: products.costPrice,
        unitPrice: products.unitPrice,
        lowStockThreshold: products.lowStockThreshold,
        isActive: products.isActive,
      })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1)
      .get();

    if (!existing) {
      throw new Error("Product not found.");
    }

    const nextName =
      input.name !== undefined ? input.name.trim() : existing.name;
    if (!nextName) {
      throw new Error("Product name cannot be empty.");
    }

    const nextCostPrice =
      input.costPrice !== undefined
        ? Number(input.costPrice)
        : Number(existing.costPrice);
    if (!Number.isFinite(nextCostPrice) || nextCostPrice < 0) {
      throw new Error("Cost price must be 0 or greater.");
    }

    const nextUnitPrice =
      input.unitPrice !== undefined
        ? Number(input.unitPrice)
        : Number(existing.unitPrice);
    if (!Number.isFinite(nextUnitPrice) || nextUnitPrice < 0) {
      throw new Error("Selling price must be 0 or greater.");
    }

    const nextThreshold =
      input.lowStockThreshold !== undefined
        ? Math.trunc(Number(input.lowStockThreshold))
        : Number(existing.lowStockThreshold);
    if (!Number.isFinite(nextThreshold) || nextThreshold < 1) {
      throw new Error("Low-stock alert threshold must be at least 1.");
    }

    const nextBarcode =
      input.barcode !== undefined
        ? input.barcode.trim()
        : existing.barcode || "";
    if (nextBarcode) {
      const dupBarcode = tx
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(
          and(
            eq(sql`TRIM(${products.barcode})`, nextBarcode),
            ne(products.id, existing.id),
          ),
        )
        .limit(1)
        .get();
      if (dupBarcode) {
        throw new Error(
          `Barcode "${nextBarcode}" is already assigned to "${dupBarcode.name}".`,
        );
      }
    }

    const nowIso = new Date().toISOString();
    let nextCategoryId = existing.categoryId;

    if (input.categoryName !== undefined) {
      const cleanCatName = input.categoryName.trim() || "General";
      const matchedCat = tx
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(eq(sql`LOWER(${productCategories.name})`, cleanCatName.toLowerCase()))
        .limit(1)
        .get();

      if (matchedCat) {
        nextCategoryId = matchedCat.id;
      } else {
        const newCatId = generateId("cat");
        tx.insert(productCategories)
          .values({
            id: newCatId,
            userId: input.userId,
            name: cleanCatName,
            description: "Added while editing product",
            isActive: 1,
            createdAt: nowIso,
            updatedAt: nowIso,
          })
          .run();
        nextCategoryId = newCatId;
      }
    }

    const nextDescription =
      input.description !== undefined
        ? input.description.trim()
        : existing.description || "";
    const nextIsActive =
      input.active !== undefined ? (input.active ? 1 : 0) : existing.isActive;

    const cleanCost = Number(nextCostPrice.toFixed(2));
    const cleanUnit = Number(nextUnitPrice.toFixed(2));

    tx.update(products)
      .set({
        name: nextName,
        categoryId: nextCategoryId,
        barcode: nextBarcode,
        description: nextDescription,
        costPrice: cleanCost,
        unitPrice: cleanUnit,
        lowStockThreshold: nextThreshold,
        isActive: nextIsActive,
        updatedAt: nowIso,
      })
      .where(eq(products.id, existing.id))
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "product",
        entityId: existing.id,
        action: "update",
        oldValues: JSON.stringify({
          name: existing.name,
          category_id: existing.categoryId,
          barcode: existing.barcode || "",
          cost_price: Number(existing.costPrice),
          unit_price: Number(existing.unitPrice),
          low_stock_threshold: existing.lowStockThreshold,
          is_active: existing.isActive,
        }),
        newValues: JSON.stringify({
          name: nextName,
          category_id: nextCategoryId,
          barcode: nextBarcode,
          cost_price: cleanCost,
          unit_price: cleanUnit,
          low_stock_threshold: nextThreshold,
          is_active: nextIsActive,
        }),
      })
      .run();

    const updated = tx
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
        barcode: products.barcode,
        costPrice: products.costPrice,
        unitPrice: products.unitPrice,
        stockQuantity: products.stockQuantity,
        lowStockThreshold: products.lowStockThreshold,
        isActive: products.isActive,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .innerJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(eq(products.id, existing.id))
      .limit(1)
      .get();

    if (!updated) {
      throw new Error("Unable to load updated product.");
    }

    return mapProductRow(updated);
  });
}

export function listCategoryDetails(
  db: ExpoSqliteDrizzleDb,
  query?: string,
): CategoryItem[] {
  const cleanQuery = query?.trim();
  const baseQuery = db
    .select({
      id: productCategories.id,
      name: productCategories.name,
      description: productCategories.description,
      isActive: productCategories.isActive,
      updatedAt: productCategories.updatedAt,
      productCount: sql<number>`COUNT(${products.id})`,
      totalUnits: sql<number>`COALESCE(SUM(${products.stockQuantity}), 0)`,
    })
    .from(productCategories)
    .leftJoin(products, eq(products.categoryId, productCategories.id));

  const rows = cleanQuery
    ? baseQuery
        .where(
          or(
            like(productCategories.name, `%${cleanQuery}%`),
            like(productCategories.description, `%${cleanQuery}%`),
          ),
        )
        .groupBy(productCategories.id)
        .orderBy(desc(productCategories.isActive), asc(productCategories.name))
        .all()
    : baseQuery
        .groupBy(productCategories.id)
        .orderBy(desc(productCategories.isActive), asc(productCategories.name))
        .all();

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description || "",
    isActive: r.isActive === 1,
    productCount: Number(r.productCount) || 0,
    totalUnits: Number(r.totalUnits) || 0,
    updatedAt: r.updatedAt,
  }));
}

export function createCategory(
  db: ExpoSqliteDrizzleDb,
  input: CreateCategoryInput & { userId: string },
): CategoryItem {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Category name is required.");
  }

  const description = input.description?.trim() || "";
  const isActive = input.isActive !== false ? 1 : 0;
  const nowIso = new Date().toISOString();

  const categoryId = db.transaction((tx) => {
    const duplicate = tx
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(eq(sql`LOWER(${productCategories.name})`, name.toLowerCase()))
      .limit(1)
      .get();

    if (duplicate) {
      throw new Error(`Category "${name}" already exists.`);
    }

    const id = generateId("cat");
    tx.insert(productCategories)
      .values({
        id,
        userId: input.userId,
        name,
        description,
        isActive,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "product_category",
        entityId: id,
        action: "create",
        newValues: JSON.stringify({
          name,
          description: description || undefined,
          is_active: isActive,
        }),
      })
      .run();

    return id;
  });

  const created = listCategoryDetails(db).find((c) => c.id === categoryId);
  if (!created) {
    throw new Error("Category created, but failed to reload details.");
  }
  return created;
}

export function updateCategory(
  db: ExpoSqliteDrizzleDb,
  input: UpdateCategoryInput & { categoryId: string; userId: string },
): CategoryItem {
  db.transaction((tx) => {
    const existing = tx
      .select({
        id: productCategories.id,
        name: productCategories.name,
        description: productCategories.description,
        isActive: productCategories.isActive,
      })
      .from(productCategories)
      .where(eq(productCategories.id, input.categoryId))
      .limit(1)
      .get();

    if (!existing) {
      throw new Error("Category not found.");
    }

    const nextName =
      input.name !== undefined ? input.name.trim() : existing.name;
    if (!nextName) {
      throw new Error("Category name cannot be empty.");
    }

    const duplicate = tx
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(
        and(
          eq(sql`LOWER(${productCategories.name})`, nextName.toLowerCase()),
          ne(productCategories.id, existing.id),
        ),
      )
      .limit(1)
      .get();

    if (duplicate) {
      throw new Error(`Another category named "${nextName}" already exists.`);
    }

    const nextDescription =
      input.description !== undefined
        ? input.description.trim()
        : existing.description || "";
    const nextIsActive =
      input.isActive !== undefined ? (input.isActive ? 1 : 0) : existing.isActive;
    const nowIso = new Date().toISOString();

    tx.update(productCategories)
      .set({
        name: nextName,
        description: nextDescription,
        isActive: nextIsActive,
        updatedAt: nowIso,
      })
      .where(eq(productCategories.id, existing.id))
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "product_category",
        entityId: existing.id,
        action: "update",
        oldValues: JSON.stringify({
          name: existing.name,
          description: existing.description || "",
          is_active: existing.isActive,
        }),
        newValues: JSON.stringify({
          name: nextName,
          description: nextDescription,
          is_active: nextIsActive,
        }),
      })
      .run();
  });

  const updated = listCategoryDetails(db).find((c) => c.id === input.categoryId);
  if (!updated) {
    throw new Error("Category updated, but failed to reload details.");
  }
  return updated;
}

export function listRestockLogs(
  db: ExpoSqliteDrizzleDb,
  params?: RestockQueryParams,
): RestockLogItem[] {
  const limit =
    typeof params?.limit === "number" && params.limit > 0
      ? Math.min(200, Math.trunc(params.limit))
      : 100;

  const conditions = [];
  if (params?.productId?.trim()) {
    conditions.push(eq(inventory.productId, params.productId.trim()));
  }

  if (params?.query?.trim()) {
    const pattern = `%${params.query.trim()}%`;
    conditions.push(
      or(
        like(products.name, pattern),
        like(productCategories.name, pattern),
        like(inventory.notes, pattern),
        like(users.username, pattern),
      ),
    );
  }

  const baseQuery = db
    .select({
      id: inventory.id,
      productId: inventory.productId,
      productName: products.name,
      categoryName: productCategories.name,
      quantity: inventory.quantity,
      restockDate: inventory.restockDate,
      notes: inventory.notes,
      firstname: users.firstname,
      lastname: users.lastname,
      username: users.username,
      createdAt: inventory.createdAt,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(
      productCategories,
      eq(inventory.productCategoryId, productCategories.id),
    )
    .leftJoin(users, eq(inventory.userId, users.id));

  const rows =
    conditions.length > 0
      ? baseQuery
          .where(and(...conditions))
          .orderBy(desc(inventory.restockDate), desc(inventory.createdAt))
          .limit(limit)
          .all()
      : baseQuery
          .orderBy(desc(inventory.restockDate), desc(inventory.createdAt))
          .limit(limit)
          .all();

  return rows.map((r) => {
    const fullName = [r.firstname, r.lastname].filter(Boolean).join(" ").trim();
    return {
      id: r.id,
      productId: r.productId,
      productName: r.productName,
      categoryName: r.categoryName,
      quantity: Number(r.quantity) || 0,
      restockDate: r.restockDate,
      notes: r.notes || "",
      userName: fullName || r.username || "Staff",
      createdAt: r.createdAt,
    };
  });
}

export function recordRestock(
  db: ExpoSqliteDrizzleDb,
  input: CreateRestockInput & { userId: string },
): RestockLogItem {
  const quantity = Math.trunc(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Restock quantity must be a positive whole number.");
  }

  const cleanDate = input.restockDate?.trim() || new Date().toISOString().slice(0, 10);
  const cleanNotes = input.notes?.trim() || "Supplier delivery restock";
  const nowIso = new Date().toISOString();

  const invId = db.transaction((tx) => {
    const product = tx
      .select({
        id: products.id,
        categoryId: products.categoryId,
        stockQuantity: products.stockQuantity,
        name: products.name,
      })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1)
      .get();

    if (!product) {
      throw new Error("Product not found.");
    }

    const oldQty = Number(product.stockQuantity) || 0;
    const nextQty = oldQty + quantity;

    tx.update(products)
      .set({ stockQuantity: nextQty, updatedAt: nowIso })
      .where(eq(products.id, product.id))
      .run();

    const newInvId = generateId("inv");
    tx.insert(inventory)
      .values({
        id: newInvId,
        userId: input.userId,
        productId: product.id,
        productCategoryId: product.categoryId,
        quantity,
        restockDate: cleanDate,
        notes: cleanNotes,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "inventory",
        entityId: newInvId,
        action: "create",
        oldValues: JSON.stringify({
          product_name: product.name,
          stock_quantity: oldQty,
        }),
        newValues: JSON.stringify({
          product_name: product.name,
          added_quantity: quantity,
          stock_quantity: nextQty,
          restock_date: cleanDate,
          notes: cleanNotes,
        }),
      })
      .run();

    return newInvId;
  });

  const created = listRestockLogs(db, { productId: input.productId, limit: 25 }).find(
    (item) => item.id === invId,
  );
  if (!created) {
    throw new Error("Restock recorded, but failed to reload entry.");
  }
  return created;
}
