import crypto from "node:crypto";
import type { Database as SqliteDatabase } from "better-sqlite3";
import {
  LOW_STOCK_THRESHOLD,
  type AdjustStockInput,
  type CreateSaleInput,
  type PaymentMode,
  type ProductDetailResponse,
  type ProductItem,
  type ProductQueryParams,
  type ProductSaleRecord,
  type ReceiptLineItem,
  type SaleReceiptDetail,
  type SaleStatus,
  type SalesQueryParams,
  type SaleTransactionSummary,
  type StockAlertItem,
  type StoreProfile,
  type TodayDashboardData,
} from "@/types/domain";

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
  category_name: string;
  barcode: string | null;
  cost_price: number;
  unit_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: number;
  updated_at: string;
}

function mapProductRow(row: ProductRow): ProductItem {
  const unitPrice = Number(row.unit_price) || 0;
  const stockQuantity = Number(row.stock_quantity) || 0;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    categoryId: row.category_id,
    categoryName: row.category_name,
    barcode: row.barcode || "",
    costPrice: Number(row.cost_price) || 0,
    unitPrice,
    stockQuantity,
    lowStockThreshold: Number(row.low_stock_threshold) || LOW_STOCK_THRESHOLD,
    stockValue: Number((stockQuantity * unitPrice).toFixed(2)),
    active: row.is_active === 1,
    updatedAt: row.updated_at,
  };
}

export function getStoreProfile(db: SqliteDatabase): StoreProfile {
  const row = db
    .prepare(
      `SELECT business_name, business_address, business_phone, business_email, currency, tax_rate, stock_alert_threshold
       FROM settings LIMIT 1`,
    )
    .get() as
    | {
        business_name: string;
        business_address: string;
        business_phone: string;
        business_email: string;
        currency: string;
        tax_rate: number;
        stock_alert_threshold: number;
      }
    | undefined;

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
    storeName: row.business_name,
    storeAddress: row.business_address,
    storePhone: row.business_phone,
    storeEmail: row.business_email,
    currency: row.currency || "GHS",
    taxRate: Number(row.tax_rate) || 0,
    stockAlertThreshold: Number(row.stock_alert_threshold) || LOW_STOCK_THRESHOLD,
  };
}

export function getTodayDashboard(db: SqliteDatabase): TodayDashboardData {
  const todayUtcDate = new Date().toISOString().slice(0, 10);
  const yestDate = new Date();
  yestDate.setUTCDate(yestDate.getUTCDate() - 1);
  const yesterdayUtcDate = yestDate.toISOString().slice(0, 10);

  const todayStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(total_amount), 0) AS revenue,
         COUNT(*) AS orders
       FROM sales
       WHERE status = 'completed' AND substr(date, 1, 10) = ?`,
    )
    .get(todayUtcDate) as { revenue: number; orders: number };

  const yesterdayStats = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS revenue
       FROM sales
       WHERE status = 'completed' AND substr(date, 1, 10) = ?`,
    )
    .get(yesterdayUtcDate) as { revenue: number };

  const todayRevenue = Number(todayStats.revenue) || 0;
  const todayOrders = Number(todayStats.orders) || 0;
  const todayAov = todayOrders > 0 ? todayRevenue / todayOrders : 0;
  const yesterdayRevenue = Number(yesterdayStats.revenue) || 0;
  const todayVsYesterdayRevenueDelta =
    yesterdayRevenue > 0
      ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
      : 0;

  const productRows = db
    .prepare(
      `SELECT p.*, pc.name AS category_name
       FROM products p
       JOIN product_categories pc ON p.category_id = pc.id
       WHERE p.is_active = 1`,
    )
    .all() as unknown as ProductRow[];

  const totalInventoryValuation = productRows.reduce(
    (sum, p) => sum + p.stock_quantity * p.unit_price,
    0,
  );
  const totalStockUnits = productRows.reduce((sum, p) => sum + p.stock_quantity, 0);

  const lowStockAlerts: StockAlertItem[] = productRows
    .filter((p) => p.stock_quantity < (p.low_stock_threshold || LOW_STOCK_THRESHOLD))
    .map((p) => {
      const threshold = p.low_stock_threshold || LOW_STOCK_THRESHOLD;
      return {
        id: p.id,
        name: p.name,
        categoryName: p.category_name,
        barcode: p.barcode || "",
        stock: p.stock_quantity,
        threshold,
        costPrice: p.cost_price,
        sellingPrice: p.unit_price,
        severity: p.stock_quantity <= 0 ? ("critical" as const) : ("warning" as const),
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

export function listCategories(db: SqliteDatabase): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT pc.name AS name
       FROM product_categories pc
       WHERE pc.is_active = 1
       ORDER BY pc.name ASC`,
    )
    .all() as Array<{ name: string }>;
  return ["All", ...rows.map((r) => r.name)];
}

export function listProducts(db: SqliteDatabase, params?: ProductQueryParams): ProductItem[] {
  const whereClauses: string[] = [];
  const bindValues: Array<string | number> = [];

  if (params?.query?.trim()) {
    const pattern = `%${params.query.trim()}%`;
    whereClauses.push("(p.name LIKE ? OR p.barcode LIKE ? OR pc.name LIKE ?)");
    bindValues.push(pattern, pattern, pattern);
  }

  if (params?.category && params.category !== "All") {
    whereClauses.push("pc.name = ?");
    bindValues.push(params.category);
  }

  if (params?.stockStatus === "out_of_stock") {
    whereClauses.push("p.stock_quantity <= 0");
  } else if (params?.stockStatus === "low_stock") {
    whereClauses.push("p.stock_quantity > 0 AND p.stock_quantity < p.low_stock_threshold");
  } else if (params?.stockStatus === "in_stock") {
    whereClauses.push("p.stock_quantity >= p.low_stock_threshold");
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT p.*, pc.name AS category_name
       FROM products p
       JOIN product_categories pc ON p.category_id = pc.id
       ${whereSql}
       ORDER BY p.is_active DESC, p.stock_quantity ASC, p.name ASC`,
    )
    .all(...bindValues) as unknown as ProductRow[];

  return rows.map(mapProductRow);
}

export function getProductDetail(
  db: SqliteDatabase,
  productId: string,
): ProductDetailResponse | null {
  const row = db
    .prepare(
      `SELECT p.*, pc.name AS category_name
       FROM products p
       JOIN product_categories pc ON p.category_id = pc.id
       WHERE p.id = ?`,
    )
    .get(productId) as ProductRow | undefined;

  if (!row) return null;

  const recentSales = db
    .prepare(
      `SELECT
         si.id AS id,
         s.id AS saleId,
         s.receipt_number AS receiptNo,
         c.name AS customerName,
         si.quantity AS quantity,
         si.unit_price AS unitPrice,
         (si.quantity * si.unit_price) AS subtotal,
         s.date AS saleDate,
         s.payment_mode AS paymentMode
       FROM sale_items si
       JOIN sales s ON si.sales_id = s.id
       JOIN customers c ON s.customer_id = c.id
       WHERE si.product_id = ?
       ORDER BY s.date DESC
       LIMIT 15`,
    )
    .all(productId) as unknown as ProductSaleRecord[];

  return {
    product: mapProductRow(row),
    recentSales,
  };
}

export function findProductByBarcode(
  db: SqliteDatabase,
  barcode: string,
): ProductItem | null {
  const clean = barcode.trim();
  if (!clean) return null;

  const row = db
    .prepare(
      `SELECT p.*, pc.name AS category_name
       FROM products p
       JOIN product_categories pc ON p.category_id = pc.id
       WHERE TRIM(p.barcode) = ?
       LIMIT 1`,
    )
    .get(clean) as ProductRow | undefined;

  return row ? mapProductRow(row) : null;
}

export function adjustProductStock(
  db: SqliteDatabase,
  input: AdjustStockInput & { productId: string; userId: string },
): ProductItem {
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db
      .prepare(
        `SELECT p.*, pc.name AS category_name
         FROM products p
         JOIN product_categories pc ON p.category_id = pc.id
         WHERE p.id = ?`,
      )
      .get(input.productId) as ProductRow | undefined;

    if (!existing) {
      throw new Error("PRODUCT_NOT_FOUND");
    }

    const oldQty = Number(existing.stock_quantity);
    let nextQty = oldQty;
    if (typeof input.setQuantity === "number" && Number.isFinite(input.setQuantity)) {
      nextQty = Math.trunc(input.setQuantity);
    } else if (typeof input.delta === "number" && Number.isFinite(input.delta)) {
      nextQty = oldQty + Math.trunc(input.delta);
    } else {
      throw new Error("INVALID_ADJUSTMENT");
    }

    if (nextQty < 0) {
      throw new Error("NEGATIVE_STOCK");
    }

    const delta = nextQty - oldQty;
    const nowIso = new Date().toISOString();

    db.prepare(
      `UPDATE products
       SET stock_quantity = ?, updated_at = ?
       WHERE id = ?`,
    ).run(nextQty, nowIso, existing.id);

    db.prepare(
      `INSERT INTO inventory (id, user_id, product_id, product_category_id, quantity, restock_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `inv-${crypto.randomUUID()}`,
      input.userId,
      existing.id,
      existing.category_id,
      delta,
      nowIso.slice(0, 10),
      input.reason?.trim() || "Mobile stock adjustment",
    );

    db.prepare(
      `INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, old_values, new_values)
       VALUES (?, ?, 'product', ?, 'update', ?, ?)`,
    ).run(
      `aud-${crypto.randomUUID()}`,
      input.userId,
      existing.id,
      JSON.stringify({ stock_quantity: oldQty }),
      JSON.stringify({ stock_quantity: nextQty, reason: input.reason || "Mobile adjustment" }),
    );

    db.exec("COMMIT");

    const updated = db
      .prepare(
        `SELECT p.*, pc.name AS category_name
         FROM products p
         JOIN product_categories pc ON p.category_id = pc.id
         WHERE p.id = ?`,
      )
      .get(existing.id) as unknown as ProductRow;

    return mapProductRow(updated);
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function listSales(
  db: SqliteDatabase,
  params?: SalesQueryParams,
): SaleTransactionSummary[] {
  const whereClauses: string[] = [];
  const bindValues: string[] = [];

  if (params?.query?.trim()) {
    const pattern = `%${params.query.trim()}%`;
    whereClauses.push("(s.receipt_number LIKE ? OR c.name LIKE ? OR u.username LIKE ?)");
    bindValues.push(pattern, pattern, pattern);
  }

  if (params?.paymentMode && params.paymentMode !== "all") {
    whereClauses.push("s.payment_mode = ?");
    bindValues.push(params.paymentMode);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT
         s.id,
         s.receipt_number AS receiptNo,
         c.name AS customerName,
         c.phonenumber AS customerPhone,
         TRIM(u.firstname || ' ' || u.lastname) AS cashierFullName,
         u.username AS cashierUsername,
         s.date AS saleDate,
         s.total_amount AS totalAmount,
         s.amount_paid AS amountPaid,
         s.discount_amount AS discount,
         s.tax_amount AS tax,
         s.payment_mode AS paymentMode,
         s.status AS status,
         (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si WHERE si.sales_id = s.id) AS itemCount
       FROM sales s
       JOIN customers c ON s.customer_id = c.id
       JOIN users u ON s.user_id = u.id
       ${whereSql}
       ORDER BY s.date DESC`,
    )
    .all(...bindValues) as Array<{
    id: string;
    receiptNo: string;
    customerName: string;
    customerPhone: string | null;
    cashierFullName: string;
    cashierUsername: string;
    saleDate: string;
    totalAmount: number;
    amountPaid: number;
    discount: number;
    tax: number;
    paymentMode: PaymentMode;
    status: SaleStatus;
    itemCount: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    receiptNo: r.receiptNo,
    customerName: r.customerName,
    customerPhone: r.customerPhone ?? undefined,
    cashierName: r.cashierFullName || r.cashierUsername,
    saleDate: r.saleDate,
    totalAmount: Number(r.totalAmount),
    amountPaid: Number(r.amountPaid),
    discount: Number(r.discount),
    tax: Number(r.tax),
    paymentMode: r.paymentMode,
    status: r.status,
    itemCount: Number(r.itemCount),
  }));
}

export function getSaleReceipt(
  db: SqliteDatabase,
  saleId: string,
): SaleReceiptDetail | null {
  const row = db
    .prepare(
      `SELECT
         s.id,
         s.receipt_number AS receiptNo,
         c.name AS customerName,
         c.phonenumber AS customerPhone,
         s.date AS saleDate,
         s.total_amount AS totalAmount,
         s.amount_paid AS amountPaid,
         s.discount_amount AS discountAmount,
         s.tax_amount AS taxAmount,
         s.payment_mode AS paymentMode,
         s.status AS status,
         TRIM(u.firstname || ' ' || u.lastname) AS attendantFullName,
         u.username AS attendantUsername
       FROM sales s
       JOIN customers c ON s.customer_id = c.id
       JOIN users u ON s.user_id = u.id
       WHERE s.id = ? OR s.receipt_number = ?
       LIMIT 1`,
    )
    .get(saleId, saleId) as
    | {
        id: string;
        receiptNo: string;
        customerName: string;
        customerPhone: string | null;
        saleDate: string;
        totalAmount: number;
        amountPaid: number;
        discountAmount: number;
        taxAmount: number;
        paymentMode: PaymentMode;
        status: SaleStatus;
        attendantFullName: string;
        attendantUsername: string;
      }
    | undefined;

  if (!row) return null;

  const items = db
    .prepare(
      `SELECT
         si.id,
         si.product_id AS productId,
         p.name AS productName,
         si.quantity,
         si.unit_price AS unitPrice,
         (si.quantity * si.unit_price) AS subtotal
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sales_id = ?`,
    )
    .all(row.id) as unknown as ReceiptLineItem[];

  const store = getStoreProfile(db);
  const subtotal = items.reduce((sum, i) => sum + Number(i.subtotal), 0);
  const taxableBase = Math.max(0, subtotal - Number(row.discountAmount));
  const effectiveTaxRate =
    taxableBase > 0 && Number(row.taxAmount) > 0
      ? Number((Number(row.taxAmount) / taxableBase).toFixed(4))
      : 0;

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
    paymentMode: row.paymentMode,
    status: row.status,
    attendantName: row.attendantFullName || row.attendantUsername,
    storeName: store.storeName,
    storeAddress: store.storeAddress,
    storePhone: store.storePhone,
    storeEmail: store.storeEmail,
    currency: store.currency,
    items: items.map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      subtotal: Number(Number(i.subtotal).toFixed(2)),
    })),
  };
}

export function createSale(
  db: SqliteDatabase,
  input: CreateSaleInput & { userId: string },
): SaleReceiptDetail {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("EMPTY_ITEMS");
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const store = getStoreProfile(db);
    const now = new Date();
    const nowIso = now.toISOString();
    const dateStamp = nowIso.slice(0, 10).replace(/-/g, "");

    const resolvedItems: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      newStock: number;
    }> = [];

    let subtotal = 0;

    for (const rawItem of input.items) {
      const qty = Math.trunc(rawItem.quantity);
      if (!rawItem.productId || !Number.isFinite(qty) || qty <= 0) {
        throw new Error("INVALID_ITEM_QUANTITY");
      }

      const product = db
        .prepare(
          `SELECT id, name, unit_price, stock_quantity, is_active
           FROM products WHERE id = ?`,
        )
        .get(rawItem.productId) as
        | {
            id: string;
            name: string;
            unit_price: number;
            stock_quantity: number;
            is_active: number;
          }
        | undefined;

      if (!product) {
        throw new Error(`PRODUCT_NOT_FOUND:${rawItem.productId}`);
      }

      if (product.stock_quantity < qty) {
        throw new Error(`INSUFFICIENT_STOCK:${product.name}:${product.stock_quantity}`);
      }

      const lineSubtotal = Number((product.unit_price * qty).toFixed(2));
      subtotal += lineSubtotal;
      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitPrice: Number(product.unit_price),
        subtotal: lineSubtotal,
        newStock: product.stock_quantity - qty,
      });
    }

    const discountAmount = Math.max(
      0,
      Math.min(subtotal, Number(input.discountAmount ?? 0) || 0),
    );
    const applyTax = input.applyTax ?? false;
    const taxable = Math.max(0, subtotal - discountAmount);
    const taxAmount = applyTax ? Number((taxable * store.taxRate).toFixed(2)) : 0;
    const totalAmount = Number((taxable + taxAmount).toFixed(2));
    const amountPaid = totalAmount;

    const cleanCustomerName = input.customerName?.trim() || "Walk-in Customer";
    const cleanCustomerPhone = input.customerPhone?.trim() || null;

    let customerId: string;
    const existingCustomer = db
      .prepare("SELECT id FROM customers WHERE LOWER(name) = LOWER(?) LIMIT 1")
      .get(cleanCustomerName) as { id: string } | undefined;

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      customerId = `cust-${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO customers (id, user_id, name, phonenumber) VALUES (?, ?, ?, ?)`,
      ).run(customerId, input.userId, cleanCustomerName, cleanCustomerPhone);
    }

    const saleId = `sale-${crypto.randomUUID()}`;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const receiptNo = `RCP-${dateStamp}-${randomSuffix}`;
    const paymentMode: PaymentMode = input.paymentMode || "cash";

    db.prepare(
      `INSERT INTO sales (
        id, customer_id, user_id, receipt_number, date, details,
        total_amount, discount_amount, tax_amount, amount_paid, payment_mode, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
    ).run(
      saleId,
      customerId,
      input.userId,
      receiptNo,
      nowIso,
      input.notes?.trim() || "Mobile Quick POS",
      totalAmount,
      discountAmount,
      taxAmount,
      amountPaid,
      paymentMode,
    );

    const insertSaleItem = db.prepare(
      `INSERT INTO sale_items (id, sales_id, product_id, quantity, unit_price)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const updateProductStock = db.prepare(
      `UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?`,
    );

    for (const item of resolvedItems) {
      insertSaleItem.run(
        `si-${crypto.randomUUID()}`,
        saleId,
        item.productId,
        item.quantity,
        item.unitPrice,
      );
      updateProductStock.run(item.newStock, nowIso, item.productId);
    }

    db.prepare(
      `INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, new_values)
       VALUES (?, ?, 'sale', ?, 'create', ?)`,
    ).run(
      `aud-${crypto.randomUUID()}`,
      input.userId,
      saleId,
      JSON.stringify({ receiptNo, totalAmount, paymentMode, itemCount: resolvedItems.length }),
    );

    db.exec("COMMIT");

    const receipt = getSaleReceipt(db, saleId);
    if (!receipt) {
      throw new Error("SALE_READBACK_FAILED");
    }
    return receipt;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
