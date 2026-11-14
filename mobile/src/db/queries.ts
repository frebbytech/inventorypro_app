import { and, asc, desc, eq, gt, like, lt, lte, or, sql } from "drizzle-orm";
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
  type AuthLoginResponse,
  type AuthSessionResponse,
  type CreateSaleInput,
  type PaymentMode,
  type ProductDetailResponse,
  type ProductItem,
  type ProductQueryParams,
  type ProductSaleRecord,
  type SaleReceiptDetail,
  type SalesQueryParams,
  type SaleStatus,
  type SaleTransactionSummary,
  type SessionUser,
  type StockAlertItem,
  type StoreProfile,
  type TodayDashboardData,
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

  const lowStockAlerts: StockAlertItem[] = productRows
    .filter(
      (p) => Number(p.stockQuantity) < (Number(p.lowStockThreshold) || LOW_STOCK_THRESHOLD),
    )
    .map((p) => {
      const threshold = Number(p.lowStockThreshold) || LOW_STOCK_THRESHOLD;
      const stock = Number(p.stockQuantity);
      return {
        id: p.id,
        name: p.name,
        categoryName: p.categoryName,
        barcode: p.barcode || "",
        stock,
        threshold,
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

  if (params?.stockStatus === "out_of_stock") {
    conditions.push(lte(products.stockQuantity, 0));
  } else if (params?.stockStatus === "low_stock") {
    conditions.push(
      and(
        gt(products.stockQuantity, 0),
        lt(products.stockQuantity, products.lowStockThreshold),
      ),
    );
  } else if (params?.stockStatus === "in_stock") {
    conditions.push(sql`${products.stockQuantity} >= ${products.lowStockThreshold}`);
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
    storeName: store.storeName,
    storeAddress: store.storeAddress,
    storePhone: store.storePhone,
    storeEmail: store.storeEmail,
    currency: store.currency,
    items: mappedItems,
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
