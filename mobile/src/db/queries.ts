import { and, asc, desc, eq, gt, gte, like, lt, lte, ne, or, sql } from "drizzle-orm";
import type { ExpoSqliteDrizzleDb } from "./client";
import { generateId, generateSessionToken, hashPassword, verifyPassword } from "./crypto";
import {
  auditLogs,
  broadcastMessages,
  customers,
  inventory,
  notifications,
  productCategories,
  products,
  saleItems,
  sales,
  settings,
  suppliers,
  supplierTransactions,
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
  type BroadcastChannel,
  type BroadcastMessageItem,
  type BroadcastRecipient,
  type BroadcastRecipientGroup,
  type BulkImportProductsResult,
  type CategoryItem,
  type ChangePasswordInput,
  type CreateCategoryInput,
  type CreateCustomerInput,
  type CreateEmployeeInput,
  type CreateProductInput,
  type CreateRestockInput,
  type CreateSaleInput,
  type CreateSupplierInput,
  type CreateSupplierTransactionInput,
  type CustomerDetailResponse,
  type CustomerItem,
  type DailyCashierBreakdown,
  type DailyReportData,
  type EmployeeDetailResponse,
  type EmployeeItem,
  type NotificationItem,
  type NotificationsQueryParams,
  type PaySupplierBalanceInput,
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
  type SendBroadcastInput,
  type SessionUser,
  type StockAlertItem,
  type StoreProfile,
  type SupplierDetailResponse,
  type SupplierItem,
  type SupplierTransactionSummary,
  type TodayDashboardData,
  type TopSellingProductItem,
  type UpdateBusinessSettingsInput,
  type UpdateCategoryInput,
  type UpdateCustomerInput,
  type UpdateEmployeeInput,
  type UpdateMyProfileInput,
  type UpdateProductInput,
  type UpdateSupplierInput,
  type UserSessionItem,
} from "@/types/domain";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface JoinedProductRow {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  barcode: string | null;
  photoUrl: string | null;
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
    photoUrl: row.photoUrl || "",
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
      photoUrl: products.photoUrl,
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
      photoUrl: products.photoUrl,
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
      photoUrl: products.photoUrl,
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
        photoUrl: products.photoUrl,
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

    tx.insert(notifications)
      .values({
        id: generateId("notif"),
        userId: input.userId,
        type: "refund",
        title: `Sale refunded: ${existing.receiptNumber}`,
        message: restockItems
          ? `Refund processed (${restockedUnits} unit${restockedUnits === 1 ? "" : "s"} returned to inventory).`
          : "Refund processed without restocking items.",
        isRead: 0,
        referenceType: "sale",
        referenceId: existing.id,
        createdAt: nowIso,
        updatedAt: nowIso,
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

      if (item.newStock <= LOW_STOCK_THRESHOLD) {
        const prodRow = tx
          .select({ name: products.name, lowStockThreshold: products.lowStockThreshold })
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1)
          .get();
        const threshold = Number(prodRow?.lowStockThreshold ?? LOW_STOCK_THRESHOLD);
        if (prodRow && item.newStock < threshold) {
          tx.insert(notifications)
            .values({
              id: generateId("notif"),
              userId: input.userId,
              type: "low_stock",
              title:
                item.newStock <= 0
                  ? `Out of stock: ${prodRow.name}`
                  : `Low stock: ${prodRow.name}`,
              message:
                item.newStock <= 0
                  ? `Stock reached 0 after receipt ${receiptNo}. Time to reorder.`
                  : `Only ${item.newStock} unit${item.newStock === 1 ? "" : "s"} left after receipt ${receiptNo}.`,
              isRead: 0,
              referenceType: "product",
              referenceId: item.productId,
              createdAt: nowIso,
              updatedAt: nowIso,
            })
            .run();
        }
      }
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
      const photoUrl = raw.photoUrl?.trim() || "";
      const description = raw.description?.trim() || "";
      const isActive = raw.active !== false ? 1 : 0;
      const productId = generateId("prod");

      tx.insert(products)
        .values({
          id: productId,
          userId: input.userId,
          categoryId: category.id,
          name,
          photoUrl,
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
        photoUrl,
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
        photoUrl: products.photoUrl,
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
    const nextPhotoUrl =
      input.photoUrl !== undefined
        ? input.photoUrl.trim()
        : existing.photoUrl || "";
    const nextIsActive =
      input.active !== undefined ? (input.active ? 1 : 0) : existing.isActive;

    const cleanCost = Number(nextCostPrice.toFixed(2));
    const cleanUnit = Number(nextUnitPrice.toFixed(2));

    tx.update(products)
      .set({
        name: nextName,
        categoryId: nextCategoryId,
        barcode: nextBarcode,
        photoUrl: nextPhotoUrl,
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
          photo_url: existing.photoUrl || "",
          cost_price: Number(existing.costPrice),
          unit_price: Number(existing.unitPrice),
          low_stock_threshold: existing.lowStockThreshold,
          is_active: existing.isActive,
        }),
        newValues: JSON.stringify({
          name: nextName,
          category_id: nextCategoryId,
          barcode: nextBarcode,
          photo_url: nextPhotoUrl,
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
        photoUrl: products.photoUrl,
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

export function listCustomers(
  db: ExpoSqliteDrizzleDb,
  query?: string,
): CustomerItem[] {
  const cleanQuery = query?.trim();
  const baseQuery = db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      phonenumber: customers.phonenumber,
      address: customers.address,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
      orderCount: sql<number>`COALESCE(SUM(CASE WHEN ${sales.status} = 'completed' THEN 1 ELSE 0 END), 0)`,
      totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${sales.status} = 'completed' THEN ${sales.totalAmount} ELSE 0 END), 0)`,
      lastOrderAt: sql<string | null>`MAX(${sales.date})`,
    })
    .from(customers)
    .leftJoin(sales, eq(sales.customerId, customers.id));

  const rows = cleanQuery
    ? baseQuery
        .where(
          or(
            like(customers.name, `%${cleanQuery}%`),
            like(customers.phonenumber, `%${cleanQuery}%`),
            like(customers.email, `%${cleanQuery}%`),
            like(customers.address, `%${cleanQuery}%`),
          ),
        )
        .groupBy(customers.id)
        .orderBy(desc(sql`MAX(${sales.date})`), asc(customers.name))
        .all()
    : baseQuery
        .groupBy(customers.id)
        .orderBy(desc(sql`MAX(${sales.date})`), asc(customers.name))
        .all();

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email || undefined,
    phonenumber: r.phonenumber || undefined,
    address: r.address || undefined,
    orderCount: Number(r.orderCount) || 0,
    totalSpent: Number((Number(r.totalSpent) || 0).toFixed(2)),
    lastOrderAt: r.lastOrderAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export function getCustomerDetail(
  db: ExpoSqliteDrizzleDb,
  customerId: string,
): CustomerDetailResponse | null {
  const customer = listCustomers(db).find((c) => c.id === customerId);
  if (!customer) return null;

  const saleRows = db
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
    .innerJoin(users, eq(sales.userId, users.id))
    .where(eq(sales.customerId, customerId))
    .orderBy(desc(sales.date))
    .limit(30)
    .all();

  const recentSales: SaleTransactionSummary[] = saleRows.map((r) => {
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

  return { customer, recentSales };
}

export function createCustomer(
  db: ExpoSqliteDrizzleDb,
  input: CreateCustomerInput & { userId: string },
): CustomerItem {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Customer name is required.");
  }

  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid customer email address.");
  }

  const phonenumber = input.phonenumber?.trim() || null;
  const address = input.address?.trim() || null;
  const nowIso = new Date().toISOString();

  const customerId = db.transaction((tx) => {
    const dup = tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(sql`LOWER(${customers.name})`, name.toLowerCase()))
      .limit(1)
      .get();

    if (dup) {
      throw new Error(`Customer "${name}" already exists.`);
    }

    const id = generateId("cust");
    tx.insert(customers)
      .values({
        id,
        userId: input.userId,
        name,
        email,
        phonenumber,
        address,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "customer",
        entityId: id,
        action: "create",
        newValues: JSON.stringify({
          name,
          phonenumber: phonenumber ?? undefined,
          email: email ?? undefined,
          address: address ?? undefined,
        }),
      })
      .run();

    return id;
  });

  const created = listCustomers(db).find((c) => c.id === customerId);
  if (!created) {
    throw new Error("Customer created, but failed to reload record.");
  }
  return created;
}

export function updateCustomer(
  db: ExpoSqliteDrizzleDb,
  input: UpdateCustomerInput & { customerId: string; userId: string },
): CustomerItem {
  db.transaction((tx) => {
    const existing = tx
      .select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        phonenumber: customers.phonenumber,
        address: customers.address,
      })
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .limit(1)
      .get();

    if (!existing) {
      throw new Error("Customer not found.");
    }

    const nextName =
      input.name !== undefined ? input.name.trim() : existing.name;
    if (!nextName) {
      throw new Error("Customer name cannot be empty.");
    }

    const dup = tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(sql`LOWER(${customers.name})`, nextName.toLowerCase()),
          ne(customers.id, existing.id),
        ),
      )
      .limit(1)
      .get();

    if (dup) {
      throw new Error(`Another customer named "${nextName}" already exists.`);
    }

    const nextEmail =
      input.email !== undefined ? input.email.trim() || null : existing.email;
    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      throw new Error("Enter a valid customer email address.");
    }

    const nextPhone =
      input.phonenumber !== undefined
        ? input.phonenumber.trim() || null
        : existing.phonenumber;
    const nextAddress =
      input.address !== undefined
        ? input.address.trim() || null
        : existing.address;
    const nowIso = new Date().toISOString();

    tx.update(customers)
      .set({
        name: nextName,
        email: nextEmail,
        phonenumber: nextPhone,
        address: nextAddress,
        updatedAt: nowIso,
      })
      .where(eq(customers.id, existing.id))
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "customer",
        entityId: existing.id,
        action: "update",
        oldValues: JSON.stringify({
          name: existing.name,
          phonenumber: existing.phonenumber ?? undefined,
          email: existing.email ?? undefined,
          address: existing.address ?? undefined,
        }),
        newValues: JSON.stringify({
          name: nextName,
          phonenumber: nextPhone ?? undefined,
          email: nextEmail ?? undefined,
          address: nextAddress ?? undefined,
        }),
      })
      .run();
  });

  const updated = listCustomers(db).find((c) => c.id === input.customerId);
  if (!updated) {
    throw new Error("Customer updated, but failed to reload record.");
  }
  return updated;
}

export function listSuppliers(
  db: ExpoSqliteDrizzleDb,
  query?: string,
): SupplierItem[] {
  const cleanQuery = query?.trim();
  const baseQuery = db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      companyName: suppliers.companyName,
      email: suppliers.email,
      phonenumber: suppliers.phonenumber,
      address: suppliers.address,
      isActive: suppliers.isActive,
      createdAt: suppliers.createdAt,
      updatedAt: suppliers.updatedAt,
      orderCount: sql<number>`COUNT(${supplierTransactions.id})`,
      totalPurchases: sql<number>`COALESCE(SUM(CASE WHEN ${supplierTransactions.status} != 'cancelled' THEN ${supplierTransactions.totalAmount} ELSE 0 END), 0)`,
      outstandingBalance: sql<number>`COALESCE(SUM(CASE WHEN ${supplierTransactions.status} != 'cancelled' THEN ${supplierTransactions.balance} ELSE 0 END), 0)`,
      lastOrderAt: sql<string | null>`MAX(${supplierTransactions.transactionDate})`,
    })
    .from(suppliers)
    .leftJoin(
      supplierTransactions,
      eq(supplierTransactions.supplierId, suppliers.id),
    );

  const rows = cleanQuery
    ? baseQuery
        .where(
          or(
            like(suppliers.companyName, `%${cleanQuery}%`),
            like(suppliers.name, `%${cleanQuery}%`),
            like(suppliers.phonenumber, `%${cleanQuery}%`),
            like(suppliers.email, `%${cleanQuery}%`),
            like(suppliers.address, `%${cleanQuery}%`),
          ),
        )
        .groupBy(suppliers.id)
        .orderBy(desc(suppliers.isActive), asc(suppliers.companyName), asc(suppliers.name))
        .all()
    : baseQuery
        .groupBy(suppliers.id)
        .orderBy(desc(suppliers.isActive), asc(suppliers.companyName), asc(suppliers.name))
        .all();

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    companyName: r.companyName,
    email: r.email || undefined,
    phonenumber: r.phonenumber || undefined,
    address: r.address || undefined,
    isActive: r.isActive === 1,
    orderCount: Number(r.orderCount) || 0,
    totalPurchases: Number((Number(r.totalPurchases) || 0).toFixed(2)),
    outstandingBalance: Number((Number(r.outstandingBalance) || 0).toFixed(2)),
    lastOrderAt: r.lastOrderAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export function getSupplierDetail(
  db: ExpoSqliteDrizzleDb,
  supplierId: string,
): SupplierDetailResponse | null {
  const supplier = listSuppliers(db).find((s) => s.id === supplierId);
  if (!supplier) return null;

  const txRows = db
    .select()
    .from(supplierTransactions)
    .where(eq(supplierTransactions.supplierId, supplierId))
    .orderBy(desc(supplierTransactions.transactionDate))
    .limit(30)
    .all();

  const transactions: SupplierTransactionSummary[] = txRows.map((t) => ({
    id: t.id,
    transactionNo: t.transactionNo,
    supplierId: t.supplierId,
    deliveredBy: t.deliveredBy ?? undefined,
    transactionDate: t.transactionDate,
    totalAmount: Number(t.totalAmount) || 0,
    amountPaid: Number(t.amountPaid) || 0,
    balance: Number(t.balance) || 0,
    paymentMode: t.paymentMode as PaymentMode,
    status: t.status as "completed" | "pending" | "cancelled",
    notes: t.notes || undefined,
  }));

  return { supplier, transactions };
}

export function createSupplier(
  db: ExpoSqliteDrizzleDb,
  input: CreateSupplierInput & { userId: string },
): SupplierItem {
  const name = input.name.trim();
  const companyName = input.companyName.trim();
  if (!companyName) {
    throw new Error("Supplier company name is required.");
  }
  if (!name) {
    throw new Error("Contact person name is required.");
  }

  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid supplier email address.");
  }

  const phonenumber = input.phonenumber?.trim() || null;
  const address = input.address?.trim() || null;
  const isActive = input.isActive !== false ? 1 : 0;
  const nowIso = new Date().toISOString();

  const supplierId = db.transaction((tx) => {
    const id = generateId("sup");
    tx.insert(suppliers)
      .values({
        id,
        userId: input.userId,
        name,
        companyName,
        email,
        phonenumber,
        address,
        isActive,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "supplier",
        entityId: id,
        action: "create",
        newValues: JSON.stringify({
          company_name: companyName,
          name,
          phonenumber: phonenumber ?? undefined,
          email: email ?? undefined,
          is_active: isActive,
        }),
      })
      .run();

    return id;
  });

  const created = listSuppliers(db).find((s) => s.id === supplierId);
  if (!created) {
    throw new Error("Supplier created, but failed to reload record.");
  }
  return created;
}

export function updateSupplier(
  db: ExpoSqliteDrizzleDb,
  input: UpdateSupplierInput & { supplierId: string; userId: string },
): SupplierItem {
  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, input.supplierId))
      .limit(1)
      .get();

    if (!existing) {
      throw new Error("Supplier not found.");
    }

    const nextCompany =
      input.companyName !== undefined
        ? input.companyName.trim()
        : existing.companyName;
    if (!nextCompany) {
      throw new Error("Supplier company name cannot be empty.");
    }

    const nextName =
      input.name !== undefined ? input.name.trim() : existing.name;
    if (!nextName) {
      throw new Error("Contact person name cannot be empty.");
    }

    const nextEmail =
      input.email !== undefined ? input.email.trim() || null : existing.email;
    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      throw new Error("Enter a valid supplier email address.");
    }

    const nextPhone =
      input.phonenumber !== undefined
        ? input.phonenumber.trim() || null
        : existing.phonenumber;
    const nextAddress =
      input.address !== undefined
        ? input.address.trim() || null
        : existing.address;
    const nextIsActive =
      input.isActive !== undefined ? (input.isActive ? 1 : 0) : existing.isActive;
    const nowIso = new Date().toISOString();

    tx.update(suppliers)
      .set({
        companyName: nextCompany,
        name: nextName,
        email: nextEmail,
        phonenumber: nextPhone,
        address: nextAddress,
        isActive: nextIsActive,
        updatedAt: nowIso,
      })
      .where(eq(suppliers.id, existing.id))
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "supplier",
        entityId: existing.id,
        action: "update",
        oldValues: JSON.stringify({
          company_name: existing.companyName,
          name: existing.name,
          is_active: existing.isActive,
        }),
        newValues: JSON.stringify({
          company_name: nextCompany,
          name: nextName,
          is_active: nextIsActive,
        }),
      })
      .run();
  });

  const updated = listSuppliers(db).find((s) => s.id === input.supplierId);
  if (!updated) {
    throw new Error("Supplier updated, but failed to reload record.");
  }
  return updated;
}

export function recordSupplierTransaction(
  db: ExpoSqliteDrizzleDb,
  input: CreateSupplierTransactionInput & { userId: string },
): SupplierTransactionSummary {
  const totalAmount = Number(input.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("Invoice total amount must be greater than 0.");
  }

  const amountPaid =
    input.amountPaid !== undefined && Number.isFinite(Number(input.amountPaid))
      ? Math.max(0, Number(input.amountPaid))
      : totalAmount;
  const cleanTotal = Number(totalAmount.toFixed(2));
  const cleanPaid = Number(Math.min(cleanTotal, amountPaid).toFixed(2));
  const balance = Number(Math.max(0, cleanTotal - cleanPaid).toFixed(2));
  const status: "completed" | "pending" = balance > 0 ? "pending" : "completed";
  const nowIso = new Date().toISOString();
  const txDate = input.transactionDate?.trim() || nowIso;

  const txId = db.transaction((tx) => {
    const supplier = tx
      .select({ id: suppliers.id, companyName: suppliers.companyName })
      .from(suppliers)
      .where(eq(suppliers.id, input.supplierId))
      .limit(1)
      .get();

    if (!supplier) {
      throw new Error("Supplier not found.");
    }

    const newId = generateId("stx");
    const txNo = `SUP-TXN-${Math.floor(1000 + Math.random() * 9000)}`;

    tx.insert(supplierTransactions)
      .values({
        id: newId,
        transactionNo: txNo,
        supplierId: supplier.id,
        userId: input.userId,
        deliveredBy: input.deliveredBy?.trim() || null,
        transactionDate: txDate,
        totalAmount: cleanTotal,
        amountPaid: cleanPaid,
        balance,
        paymentMode: input.paymentMode || "cash",
        status,
        notes: input.notes?.trim() || "Supplier stock delivery",
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "supplier_transaction",
        entityId: newId,
        action: "create",
        newValues: JSON.stringify({
          transaction_no: txNo,
          supplier: supplier.companyName,
          total_amount: cleanTotal,
          amount_paid: cleanPaid,
          balance,
        }),
      })
      .run();

    return newId;
  });

  const row = db
    .select()
    .from(supplierTransactions)
    .where(eq(supplierTransactions.id, txId))
    .limit(1)
    .get();

  if (!row) {
    throw new Error("Supplier transaction recorded, but failed to reload entry.");
  }

  return {
    id: row.id,
    transactionNo: row.transactionNo,
    supplierId: row.supplierId,
    deliveredBy: row.deliveredBy ?? undefined,
    transactionDate: row.transactionDate,
    totalAmount: Number(row.totalAmount) || 0,
    amountPaid: Number(row.amountPaid) || 0,
    balance: Number(row.balance) || 0,
    paymentMode: row.paymentMode as PaymentMode,
    status: row.status as "completed" | "pending" | "cancelled",
    notes: row.notes || undefined,
  };
}

export function paySupplierTransactionBalance(
  db: ExpoSqliteDrizzleDb,
  input: PaySupplierBalanceInput & { userId: string },
): SupplierTransactionSummary {
  const paymentAmount = Number(input.paymentAmount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than 0.");
  }

  const nowIso = new Date().toISOString();

  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(supplierTransactions)
      .where(eq(supplierTransactions.id, input.transactionId))
      .limit(1)
      .get();

    if (!existing) {
      throw new Error("Supplier transaction not found.");
    }
    if (existing.status === "cancelled") {
      throw new Error("Cannot record payment for a cancelled transaction.");
    }

    const total = Number(existing.totalAmount) || 0;
    const prevPaid = Number(existing.amountPaid) || 0;
    const prevBalance = Math.max(0, Number(existing.balance) || 0);
    if (prevBalance <= 0) {
      throw new Error("This delivery invoice has already been paid in full.");
    }

    const applied = Number(Math.min(prevBalance, paymentAmount).toFixed(2));
    const nextPaid = Number(Math.min(total, prevPaid + applied).toFixed(2));
    const nextBalance = Number(Math.max(0, total - nextPaid).toFixed(2));
    const nextStatus = nextBalance <= 0 ? "completed" : "pending";
    const nextMode = input.paymentMode || (existing.paymentMode as PaymentMode);

    const paymentNote = input.notes?.trim();
    const nextNotes = paymentNote
      ? existing.notes?.trim()
        ? `${existing.notes.trim()} · ${paymentNote}`
        : paymentNote
      : existing.notes || "";

    tx.update(supplierTransactions)
      .set({
        amountPaid: nextPaid,
        balance: nextBalance,
        paymentMode: nextMode,
        status: nextStatus,
        notes: nextNotes,
        updatedAt: nowIso,
      })
      .where(eq(supplierTransactions.id, existing.id))
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "supplier_transaction",
        entityId: existing.id,
        action: "update",
        oldValues: JSON.stringify({
          amount_paid: prevPaid,
          balance: prevBalance,
          status: existing.status,
        }),
        newValues: JSON.stringify({
          payment_added: applied,
          amount_paid: nextPaid,
          balance: nextBalance,
          status: nextStatus,
          payment_mode: nextMode,
        }),
      })
      .run();
  });

  const updated = db
    .select()
    .from(supplierTransactions)
    .where(eq(supplierTransactions.id, input.transactionId))
    .limit(1)
    .get();

  if (!updated) {
    throw new Error("Failed to reload updated supplier transaction.");
  }

  return {
    id: updated.id,
    transactionNo: updated.transactionNo,
    supplierId: updated.supplierId,
    deliveredBy: updated.deliveredBy ?? undefined,
    transactionDate: updated.transactionDate,
    totalAmount: Number(updated.totalAmount) || 0,
    amountPaid: Number(updated.amountPaid) || 0,
    balance: Number(updated.balance) || 0,
    paymentMode: updated.paymentMode as PaymentMode,
    status: updated.status as "completed" | "pending" | "cancelled",
    notes: updated.notes || undefined,
  };
}

export function listEmployees(
  db: ExpoSqliteDrizzleDb,
  query?: string,
): EmployeeItem[] {
  const cleanQuery = query?.trim().toLowerCase() ?? "";
  const userRows = db
    .select()
    .from(users)
    .orderBy(asc(users.role), asc(users.firstname), asc(users.username))
    .all();

  const saleRows = db
    .select({
      userId: sales.userId,
      status: sales.status,
      totalAmount: sales.totalAmount,
    })
    .from(sales)
    .all();

  const statsMap = new Map<
    string,
    { completed: number; refunded: number; revenue: number }
  >();

  for (const row of saleRows) {
    const cur = statsMap.get(row.userId) ?? {
      completed: 0,
      refunded: 0,
      revenue: 0,
    };
    if (row.status === "completed") {
      cur.completed += 1;
      cur.revenue += Number(row.totalAmount) || 0;
    } else if (row.status === "refunded") {
      cur.refunded += 1;
    }
    statsMap.set(row.userId, cur);
  }

  const nowMs = Date.now();
  const mapped: EmployeeItem[] = userRows.map((u) => {
    const fullName =
      [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || u.username;
    const stats = statsMap.get(u.id) ?? {
      completed: 0,
      refunded: 0,
      revenue: 0,
    };
    const isLocked =
      Boolean(u.lockedUntil) && new Date(u.lockedUntil!).getTime() > nowMs;
    const revenue = Number(stats.revenue.toFixed(2));
    const avg =
      stats.completed > 0
        ? Number((revenue / stats.completed).toFixed(2))
        : 0;

    return {
      id: u.id,
      username: u.username,
      email: u.email,
      firstname: u.firstname,
      lastname: u.lastname,
      fullName,
      phonenumber: u.phonenumber ?? undefined,
      role: u.role,
      isLocked,
      lastLoginAt: u.lastLoginAt,
      completedSalesCount: stats.completed,
      refundedSalesCount: stats.refunded,
      totalRevenue: revenue,
      averageTicket: avg,
      createdAt: u.createdAt,
    };
  });

  if (!cleanQuery) return mapped;
  return mapped.filter(
    (e) =>
      e.fullName.toLowerCase().includes(cleanQuery) ||
      e.username.toLowerCase().includes(cleanQuery) ||
      e.email.toLowerCase().includes(cleanQuery) ||
      (e.phonenumber?.toLowerCase().includes(cleanQuery) ?? false),
  );
}

export function getEmployeeDetail(
  db: ExpoSqliteDrizzleDb,
  employeeId: string,
): EmployeeDetailResponse | null {
  const employee = listEmployees(db).find((e) => e.id === employeeId);
  if (!employee) return null;

  const saleRows = db
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
    .innerJoin(users, eq(sales.userId, users.id))
    .where(eq(sales.userId, employeeId))
    .orderBy(desc(sales.date))
    .limit(40)
    .all();

  const completedSales = saleRows.filter((r) => r.status === "completed");
  const grossRevenue = completedSales.reduce(
    (sum, s) => sum + (Number(s.totalAmount) || 0),
    0,
  );
  const modes: PaymentMode[] = ["cash", "momo", "bank", "cheque"];
  const paymentBreakdown: PaymentBreakdownItem[] = modes.map((mode) => {
    const matching = completedSales.filter((s) => s.paymentMode === mode);
    const amount = matching.reduce(
      (sum, s) => sum + (Number(s.totalAmount) || 0),
      0,
    );
    return {
      paymentMode: mode,
      count: matching.length,
      amount: Number(amount.toFixed(2)),
      sharePercent:
        grossRevenue > 0 ? Number(((amount / grossRevenue) * 100).toFixed(1)) : 0,
    };
  });

  const recentSales: SaleTransactionSummary[] = saleRows.map((r) => ({
    id: r.id,
    receiptNo: r.receiptNo,
    customerName: r.customerName,
    customerPhone: r.customerPhone ?? undefined,
    cashierName: employee.fullName,
    saleDate: r.saleDate,
    totalAmount: Number(r.totalAmount),
    amountPaid: Number(r.amountPaid),
    discount: Number(r.discount),
    tax: Number(r.tax),
    paymentMode: r.paymentMode as PaymentMode,
    status: r.status as SaleStatus,
    itemCount: Number(r.itemCount),
  }));

  return { employee, paymentBreakdown, recentSales };
}

export async function createEmployee(
  db: ExpoSqliteDrizzleDb,
  input: CreateEmployeeInput & { actorUserId: string },
): Promise<EmployeeItem> {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const firstname = input.firstname.trim();
  const lastname = input.lastname.trim();
  const phonenumber = input.phonenumber?.trim() || null;

  if (!username || username.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    throw new Error(
      "Username may only contain letters, numbers, dots, underscores, or hyphens.",
    );
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (!firstname) {
    throw new Error("First name is required.");
  }
  if (!input.password || input.password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const passwordHash = await hashPassword(input.password);
  const nowIso = new Date().toISOString();

  const employeeId = db.transaction((tx) => {
    const dupUsername = tx
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`LOWER(${users.username})`, username))
      .limit(1)
      .get();
    if (dupUsername) {
      throw new Error(`Username "@${username}" is already taken.`);
    }

    const dupEmail = tx
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`LOWER(${users.email})`, email))
      .limit(1)
      .get();
    if (dupEmail) {
      throw new Error(`Email "${email}" is already registered.`);
    }

    const id = generateId("user");
    tx.insert(users)
      .values({
        id,
        username,
        email,
        passwordHash,
        firstname,
        lastname,
        phonenumber,
        role: input.role,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.actorUserId,
        entityType: "employee",
        entityId: id,
        action: "create",
        newValues: JSON.stringify({
          username,
          email,
          role: input.role,
          name: `${firstname} ${lastname}`.trim(),
        }),
      })
      .run();

    return id;
  });

  const created = listEmployees(db).find((e) => e.id === employeeId);
  if (!created) {
    throw new Error("Team member created, but failed to reload profile.");
  }
  return created;
}

export async function updateEmployee(
  db: ExpoSqliteDrizzleDb,
  input: UpdateEmployeeInput & { employeeId: string; actorUserId: string },
): Promise<EmployeeItem> {
  const newPasswordHash = input.password?.trim()
    ? await hashPassword(input.password.trim())
    : null;
  if (input.password !== undefined && input.password.trim().length > 0 && input.password.trim().length < 6) {
    throw new Error("New password must be at least 6 characters.");
  }

  const nowIso = new Date().toISOString();

  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(users)
      .where(eq(users.id, input.employeeId))
      .limit(1)
      .get();
    if (!existing) {
      throw new Error("Team member not found.");
    }

    const nextFirstname =
      input.firstname !== undefined
        ? input.firstname.trim()
        : existing.firstname;
    const nextLastname =
      input.lastname !== undefined ? input.lastname.trim() : existing.lastname;
    if (!nextFirstname) {
      throw new Error("First name cannot be empty.");
    }

    const nextEmail =
      input.email !== undefined
        ? input.email.trim().toLowerCase()
        : existing.email;
    if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      throw new Error("Enter a valid email address.");
    }

    const dupEmail = tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(sql`LOWER(${users.email})`, nextEmail),
          ne(users.id, existing.id),
        ),
      )
      .limit(1)
      .get();
    if (dupEmail) {
      throw new Error(`Email "${nextEmail}" belongs to another user.`);
    }

    const nextPhone =
      input.phonenumber !== undefined
        ? input.phonenumber.trim() || null
        : existing.phonenumber;
    const nextRole = input.role ?? existing.role;

    tx.update(users)
      .set({
        firstname: nextFirstname,
        lastname: nextLastname,
        email: nextEmail,
        phonenumber: nextPhone,
        role: nextRole,
        ...(newPasswordHash ? { passwordHash: newPasswordHash } : {}),
        updatedAt: nowIso,
      })
      .where(eq(users.id, existing.id))
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.actorUserId,
        entityType: "employee",
        entityId: existing.id,
        action: "update",
        oldValues: JSON.stringify({
          name: `${existing.firstname} ${existing.lastname}`.trim(),
          email: existing.email,
          role: existing.role,
        }),
        newValues: JSON.stringify({
          name: `${nextFirstname} ${nextLastname}`.trim(),
          email: nextEmail,
          role: nextRole,
          passwordChanged: Boolean(newPasswordHash),
        }),
      })
      .run();
  });

  const updated = listEmployees(db).find((e) => e.id === input.employeeId);
  if (!updated) {
    throw new Error("Team member updated, but failed to reload profile.");
  }
  return updated;
}

export function getDailyReport(
  db: ExpoSqliteDrizzleDb,
  dateStr?: string,
): DailyReportData {
  const store = getStoreProfile(db);
  const targetDate = (dateStr?.trim() || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const saleRows = db
    .select({
      id: sales.id,
      userId: sales.userId,
      firstname: users.firstname,
      lastname: users.lastname,
      username: users.username,
      totalAmount: sales.totalAmount,
      discountAmount: sales.discountAmount,
      taxAmount: sales.taxAmount,
      paymentMode: sales.paymentMode,
      status: sales.status,
    })
    .from(sales)
    .innerJoin(users, eq(sales.userId, users.id))
    .where(eq(sql`substr(${sales.date}, 1, 10)`, targetDate))
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

  const cashierMap = new Map<string, DailyCashierBreakdown>();
  for (const s of completedSales) {
    const name = `${s.firstname} ${s.lastname}`.trim() || s.username;
    const cur = cashierMap.get(s.userId);
    const amt = Number(s.totalAmount) || 0;
    if (cur) {
      cur.salesCount += 1;
      cur.revenue = Number((cur.revenue + amt).toFixed(2));
    } else {
      cashierMap.set(s.userId, {
        userId: s.userId,
        cashierName: name,
        salesCount: 1,
        revenue: Number(amt.toFixed(2)),
      });
    }
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
    .where(
      and(
        eq(sales.status, "completed"),
        eq(sql`substr(${sales.date}, 1, 10)`, targetDate),
      ),
    )
    .all();

  let estimatedCost = 0;
  let totalUnitsSold = 0;
  const productTotals = new Map<string, TopSellingProductItem>();

  for (const line of lineRows) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const cost = Number(line.costPrice) || 0;
    const rev = qty * price;
    totalUnitsSold += qty;
    estimatedCost += qty * cost;

    const existing = productTotals.get(line.productId);
    if (existing) {
      existing.unitsSold += qty;
      existing.revenue = Number((existing.revenue + rev).toFixed(2));
    } else {
      productTotals.set(line.productId, {
        productId: line.productId,
        productName: line.productName,
        unitsSold: qty,
        revenue: Number(rev.toFixed(2)),
      });
    }
  }

  const netBeforeTax = Math.max(0, grossRevenue - totalTax);
  const grossProfit = netBeforeTax - estimatedCost;
  const profitMarginPercent =
    netBeforeTax > 0 ? (grossProfit / netBeforeTax) * 100 : 0;

  return {
    date: targetDate,
    currency: store.currency,
    storeName: store.storeName,
    totalTransactions: saleRows.length,
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
    topProducts: Array.from(productTotals.values())
      .sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold)
      .slice(0, 5),
    cashierBreakdown: Array.from(cashierMap.values()).sort(
      (a, b) => b.revenue - a.revenue,
    ),
  };
}

// ---------------------------------------------------------------------------
// Phase 7 — Notifications, Broadcast Messages & Account Security
// ---------------------------------------------------------------------------

function mapNotificationRow(
  row: typeof notifications.$inferSelect,
): NotificationItem {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: row.isRead === 1,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listNotifications(
  db: ExpoSqliteDrizzleDb,
  params: NotificationsQueryParams & { userId: string },
): NotificationItem[] {
  const limit =
    typeof params.limit === "number" && params.limit > 0
      ? Math.min(200, Math.trunc(params.limit))
      : 100;

  const conditions = [eq(notifications.userId, params.userId)];
  if (params.unreadOnly) {
    conditions.push(eq(notifications.isRead, 0));
  }

  const rows = db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .all();

  return rows.map(mapNotificationRow);
}

export function getUnreadNotificationCount(
  db: ExpoSqliteDrizzleDb,
  userId: string,
): number {
  const row = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)))
    .get();
  return Number(row?.cnt ?? 0);
}

export function markNotificationRead(
  db: ExpoSqliteDrizzleDb,
  input: { id: string; userId: string },
): NotificationItem {
  const existing = db
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.id, input.id), eq(notifications.userId, input.userId)),
    )
    .limit(1)
    .get();

  if (!existing) {
    throw new Error("Notification not found.");
  }

  if (existing.isRead === 1) {
    return mapNotificationRow(existing);
  }

  const nowIso = new Date().toISOString();
  db.update(notifications)
    .set({ isRead: 1, updatedAt: nowIso })
    .where(eq(notifications.id, existing.id))
    .run();

  return {
    ...mapNotificationRow(existing),
    isRead: true,
    updatedAt: nowIso,
  };
}

export function markAllNotificationsRead(
  db: ExpoSqliteDrizzleDb,
  userId: string,
): { updatedCount: number } {
  const nowIso = new Date().toISOString();
  const unread = db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)))
    .all();

  if (unread.length === 0) {
    return { updatedCount: 0 };
  }

  db.update(notifications)
    .set({ isRead: 1, updatedAt: nowIso })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)))
    .run();

  return { updatedCount: unread.length };
}

export function deleteNotificationById(
  db: ExpoSqliteDrizzleDb,
  input: { id: string; userId: string },
): void {
  const existing = db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(eq(notifications.id, input.id), eq(notifications.userId, input.userId)),
    )
    .limit(1)
    .get();

  if (!existing) {
    throw new Error("Notification not found.");
  }

  db.delete(notifications).where(eq(notifications.id, existing.id)).run();
}

export function clearAllNotifications(
  db: ExpoSqliteDrizzleDb,
  userId: string,
): { deletedCount: number } {
  const existing = db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .all();

  if (existing.length === 0) {
    return { deletedCount: 0 };
  }

  db.transaction((tx) => {
    tx.delete(notifications).where(eq(notifications.userId, userId)).run();
    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId,
        entityType: "notifications",
        entityId: userId,
        action: "delete",
        oldValues: JSON.stringify({ clearedCount: existing.length }),
      })
      .run();
  });

  return { deletedCount: existing.length };
}

export function listBroadcastRecipients(
  db: ExpoSqliteDrizzleDb,
  group: BroadcastRecipientGroup,
): BroadcastRecipient[] {
  if (group === "employees") {
    const rows = db
      .select({
        id: users.id,
        username: users.username,
        firstname: users.firstname,
        lastname: users.lastname,
        email: users.email,
        phonenumber: users.phonenumber,
        role: users.role,
      })
      .from(users)
      .orderBy(asc(users.firstname))
      .all();

    return rows.map((r) => {
      const email = r.email?.trim() || null;
      const phone = r.phonenumber?.trim() || null;
      const name =
        [r.firstname, r.lastname].filter(Boolean).join(" ").trim() || r.username;
      return {
        id: r.id,
        name,
        email,
        phonenumber: phone,
        subtitle: r.role === "admin" ? "Administrator" : "Cashier / Staff",
        hasValidEmail: Boolean(email && email.includes("@")),
        hasValidPhone: Boolean(phone && phone.replace(/\D/g, "").length >= 5),
        canReceiveInApp: true,
      };
    });
  }

  if (group === "customers") {
    const rows = db
      .select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        phonenumber: customers.phonenumber,
      })
      .from(customers)
      .orderBy(asc(customers.name))
      .all();

    return rows
      .filter((r) => r.id !== "cust-walkin")
      .map((r) => {
        const email = r.email?.trim() || null;
        const phone = r.phonenumber?.trim() || null;
        return {
          id: r.id,
          name: r.name,
          email,
          phonenumber: phone,
          subtitle: phone || email || "Customer",
          hasValidEmail: Boolean(email && email.includes("@")),
          hasValidPhone: Boolean(phone && phone.replace(/\D/g, "").length >= 5),
          canReceiveInApp: false,
        };
      });
  }

  const rows = db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      companyName: suppliers.companyName,
      email: suppliers.email,
      phonenumber: suppliers.phonenumber,
    })
    .from(suppliers)
    .where(eq(suppliers.isActive, 1))
    .orderBy(asc(suppliers.name))
    .all();

  return rows.map((r) => {
    const email = r.email?.trim() || null;
    const phone = r.phonenumber?.trim() || null;
    return {
      id: r.id,
      name: r.companyName ? `${r.name} (${r.companyName})` : r.name,
      email,
      phonenumber: phone,
      subtitle: r.companyName || phone || email || "Supplier",
      hasValidEmail: Boolean(email && email.includes("@")),
      hasValidPhone: Boolean(phone && phone.replace(/\D/g, "").length >= 5),
      canReceiveInApp: false,
    };
  });
}

export function listBroadcastMessages(
  db: ExpoSqliteDrizzleDb,
): BroadcastMessageItem[] {
  const rows = db
    .select()
    .from(broadcastMessages)
    .orderBy(desc(broadcastMessages.createdAt))
    .limit(80)
    .all();

  return rows.map((r) => ({
    id: r.id,
    senderId: r.senderId,
    senderName: r.senderName,
    recipientGroup: r.recipientGroup,
    channel: r.channel,
    subject: r.subject,
    content: r.content,
    recipientCount: Number(r.recipientCount),
    status: r.status,
    createdAt: r.createdAt,
  }));
}

export function sendBroadcastMessage(
  db: ExpoSqliteDrizzleDb,
  input: SendBroadcastInput & { senderId: string },
): BroadcastMessageItem {
  const cleanContent = input.content?.trim() ?? "";
  const cleanSubject = input.subject?.trim() || "";

  if (!cleanContent) {
    throw new Error("Message content cannot be empty.");
  }

  if (input.channel === "email" && !cleanSubject) {
    throw new Error("An email subject line is required for email broadcasts.");
  }

  if (input.channel === "in_app" && input.recipientGroup !== "employees") {
    throw new Error("In-app notifications can only be sent to team employees.");
  }

  const sender = db
    .select({
      id: users.id,
      username: users.username,
      firstname: users.firstname,
      lastname: users.lastname,
    })
    .from(users)
    .where(eq(users.id, input.senderId))
    .limit(1)
    .get();

  if (!sender) {
    throw new Error("Sender account not found.");
  }

  let candidates = listBroadcastRecipients(db, input.recipientGroup);
  if (input.recipientIds && input.recipientIds.length > 0) {
    const allowed = new Set(input.recipientIds);
    candidates = candidates.filter((c) => allowed.has(c.id));
  }

  if (candidates.length === 0) {
    throw new Error(`No recipients available in ${input.recipientGroup}.`);
  }

  const eligible = candidates.filter((r) => {
    if (input.channel === "email") return r.hasValidEmail;
    if (input.channel === "sms") return r.hasValidPhone;
    return r.canReceiveInApp;
  });

  if (eligible.length === 0) {
    const requirement =
      input.channel === "email"
        ? "valid email addresses"
        : input.channel === "sms"
          ? "valid phone numbers"
          : "active team accounts";
    throw new Error(`None of the selected recipients have ${requirement}.`);
  }

  const senderName =
    [sender.firstname, sender.lastname].filter(Boolean).join(" ").trim() ||
    sender.username;
  const nowIso = new Date().toISOString();
  const broadcastId = generateId("bcast");
  // In-app broadcasts deliver immediately into local employee notification inboxes;
  // SMS/Email are queued locally until remote gateway sync is connected.
  const status: BroadcastMessageItem["status"] =
    input.channel === "in_app" ? "sent" : "queued";

  db.transaction((tx) => {
    tx.insert(broadcastMessages)
      .values({
        id: broadcastId,
        senderId: sender.id,
        senderName,
        recipientGroup: input.recipientGroup,
        channel: input.channel as BroadcastChannel,
        subject: cleanSubject || null,
        content: cleanContent,
        recipientCount: eligible.length,
        status,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    if (input.channel === "in_app") {
      for (const emp of eligible) {
        tx.insert(notifications)
          .values({
            id: generateId("notif"),
            userId: emp.id,
            type: "employee",
            title: cleanSubject || `Team announcement from ${senderName}`,
            message: cleanContent,
            isRead: 0,
            referenceType: "broadcast",
            referenceId: broadcastId,
            createdAt: nowIso,
            updatedAt: nowIso,
          })
          .run();
      }
    }

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: sender.id,
        entityType: "broadcast_message",
        entityId: broadcastId,
        action: "create",
        newValues: JSON.stringify({
          channel: input.channel,
          recipientGroup: input.recipientGroup,
          recipientCount: eligible.length,
          status,
        }),
      })
      .run();
  });

  return {
    id: broadcastId,
    senderId: sender.id,
    senderName,
    recipientGroup: input.recipientGroup,
    channel: input.channel,
    subject: cleanSubject || null,
    content: cleanContent,
    recipientCount: eligible.length,
    status,
    createdAt: nowIso,
  };
}

export function listUserSessions(
  db: ExpoSqliteDrizzleDb,
  input: { userId: string; currentToken?: string | null },
): UserSessionItem[] {
  const rows = db
    .select()
    .from(userSessions)
    .where(eq(userSessions.userId, input.userId))
    .orderBy(desc(userSessions.isActive), desc(userSessions.createdAt))
    .limit(25)
    .all();

  const nowMs = Date.now();
  return rows.map((row) => {
    const notExpired = new Date(row.expiresAt).getTime() > nowMs;
    const isActive = row.isActive === 1 && notExpired;
    return {
      id: row.id,
      deviceName: row.deviceName?.trim() || "Inventory Pro Mobile",
      deviceType: row.deviceType?.trim() || "mobile",
      operatingSystem: row.operatingSystem?.trim() || "expo",
      isActive,
      isCurrent: Boolean(input.currentToken && row.token === input.currentToken),
      lastActivityAt: row.lastActivityAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  });
}

export function revokeUserSession(
  db: ExpoSqliteDrizzleDb,
  input: { sessionId: string; userId: string; currentToken?: string | null },
): void {
  const target = db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.id, input.sessionId),
        eq(userSessions.userId, input.userId),
      ),
    )
    .limit(1)
    .get();

  if (!target) {
    throw new Error("Session not found.");
  }
  if (input.currentToken && target.token === input.currentToken) {
    throw new Error("Use Sign Out on the Account tab to end your current session.");
  }
  if (target.isActive === 0) {
    return;
  }

  db.transaction((tx) => {
    tx.update(userSessions)
      .set({ isActive: 0 })
      .where(eq(userSessions.id, target.id))
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "user_session",
        entityId: target.id,
        action: "logout",
        newValues: JSON.stringify({
          revokedDevice: target.deviceName || "Inventory Pro Mobile",
        }),
      })
      .run();
  });
}

export function revokeOtherUserSessions(
  db: ExpoSqliteDrizzleDb,
  input: { userId: string; currentToken: string },
): { revokedCount: number } {
  const activeSessions = db
    .select({ id: userSessions.id, token: userSessions.token })
    .from(userSessions)
    .where(and(eq(userSessions.userId, input.userId), eq(userSessions.isActive, 1)))
    .all();

  const others = activeSessions.filter((s) => s.token !== input.currentToken);
  if (others.length === 0) {
    return { revokedCount: 0 };
  }

  db.transaction((tx) => {
    for (const s of others) {
      tx.update(userSessions)
        .set({ isActive: 0 })
        .where(eq(userSessions.id, s.id))
        .run();
    }

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: input.userId,
        entityType: "user_session",
        entityId: input.userId,
        action: "logout",
        newValues: JSON.stringify({
          revokedOtherSessionsCount: others.length,
        }),
      })
      .run();
  });

  return { revokedCount: others.length };
}

export function updateOwnProfile(
  db: ExpoSqliteDrizzleDb,
  input: UpdateMyProfileInput & { userId: string },
): SessionUser {
  const firstname = input.firstname.trim();
  const lastname = input.lastname.trim();
  const email = input.email.trim().toLowerCase();
  const phonenumber = input.phonenumber?.trim() || null;

  if (!firstname) {
    throw new Error("First name is required.");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  const nowIso = new Date().toISOString();

  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)
      .get();

    if (!existing) {
      throw new Error("User account not found.");
    }

    const dupEmail = tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(sql`LOWER(${users.email})`, email), ne(users.id, existing.id)))
      .limit(1)
      .get();

    if (dupEmail) {
      throw new Error(`Email "${email}" is already used by another account.`);
    }

    tx.update(users)
      .set({
        firstname,
        lastname,
        email,
        phonenumber,
        updatedAt: nowIso,
      })
      .where(eq(users.id, existing.id))
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: existing.id,
        entityType: "user",
        entityId: existing.id,
        action: "update",
        oldValues: JSON.stringify({
          firstname: existing.firstname,
          lastname: existing.lastname,
          email: existing.email,
          phonenumber: existing.phonenumber,
        }),
        newValues: JSON.stringify({
          firstname,
          lastname,
          email,
          phonenumber,
        }),
      })
      .run();
  });

  const updated = db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1)
    .get();
  if (!updated) {
    throw new Error("Profile updated, but failed to reload account.");
  }
  return mapSessionUser(updated);
}

export async function changeOwnPassword(
  db: ExpoSqliteDrizzleDb,
  input: ChangePasswordInput & { userId: string },
): Promise<void> {
  if (!input.currentPassword) {
    throw new Error("Enter your current password.");
  }
  if (!input.newPassword || input.newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters.");
  }
  if (input.currentPassword === input.newPassword) {
    throw new Error("New password must be different from your current password.");
  }

  const user = db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1)
    .get();
  if (!user) {
    throw new Error("User account not found.");
  }

  const currentMatches = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );
  if (!currentMatches) {
    throw new Error("Current password is incorrect.");
  }

  const nextPasswordHash = await hashPassword(input.newPassword);
  const nowIso = new Date().toISOString();

  db.transaction((tx) => {
    tx.update(users)
      .set({
        passwordHash: nextPasswordHash,
        updatedAt: nowIso,
      })
      .where(eq(users.id, user.id))
      .run();

    tx.insert(notifications)
      .values({
        id: generateId("notif"),
        userId: user.id,
        type: "security",
        title: "Account password changed",
        message: "Your sign-in password was updated on this device.",
        isRead: 0,
        referenceType: "security",
        referenceId: user.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    tx.insert(auditLogs)
      .values({
        id: generateId("aud"),
        userId: user.id,
        entityType: "user",
        entityId: user.id,
        action: "update",
        newValues: JSON.stringify({ passwordChanged: true }),
      })
      .run();
  });
}


