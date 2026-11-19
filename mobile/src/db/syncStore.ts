import { asc, eq, inArray } from "drizzle-orm";
import type { ExpoSqliteDrizzleDb } from "./client";
import { generateId } from "./crypto";
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
  syncMeta,
  syncOutbox,
  users,
} from "./schema";
import type {
  PaymentMode,
  SaleStatus,
  SyncBootstrapResponse,
  SyncEventDto,
  SyncMergePayload,
  SyncOutboxItem,
} from "@/types/domain";

export interface LocalDataSummary {
  categoriesCount: number;
  productsCount: number;
  customersCount: number;
  suppliersCount: number;
  salesCount: number;
  restocksCount: number;
  hasData: boolean;
}

export function getLocalDataSummary(db: ExpoSqliteDrizzleDb): LocalDataSummary {
  const cats = db.select({ id: productCategories.id }).from(productCategories).all();
  const prods = db.select({ id: products.id }).from(products).all();
  const custs = db.select({ id: customers.id }).from(customers).all();
  const sups = db.select({ id: suppliers.id }).from(suppliers).all();
  const sls = db.select({ id: sales.id }).from(sales).all();
  const rsts = db.select({ id: inventory.id }).from(inventory).all();

  const hasData = prods.length > 0 || sls.length > 0 || custs.length > 0 || sups.length > 0;

  return {
    categoriesCount: cats.length,
    productsCount: prods.length,
    customersCount: custs.length,
    suppliersCount: sups.length,
    salesCount: sls.length,
    restocksCount: rsts.length,
    hasData,
  };
}

export function exportLocalDataForMerge(db: ExpoSqliteDrizzleDb): SyncMergePayload {
  const catRows = db.select().from(productCategories).all();
  const catNameById = new Map(catRows.map((c) => [c.id, c.name]));

  const custRows = db.select().from(customers).all();
  const supRows = db.select().from(suppliers).all();
  const prodRows = db.select().from(products).all();
  const prodNameById = new Map(prodRows.map((p) => [p.id, p.name]));

  const restockRows = db.select().from(inventory).all();
  const saleRows = db.select().from(sales).all();
  const itemRows = db.select().from(saleItems).all();

  const itemsBySale = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsBySale.get(item.salesId) ?? [];
    list.push(item);
    itemsBySale.set(item.salesId, list);
  }

  const customerById = new Map(custRows.map((c) => [c.id, c]));

  return {
    categories: catRows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? undefined,
      isActive: c.isActive === 1,
    })),
    customers: custRows.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email ?? undefined,
      phonenumber: c.phonenumber ?? undefined,
      address: c.address ?? undefined,
    })),
    suppliers: supRows.map((s) => ({
      id: s.id,
      name: s.name,
      companyName: s.companyName || s.name,
      email: s.email ?? undefined,
      phonenumber: s.phonenumber ?? undefined,
      address: s.address ?? undefined,
      isActive: s.isActive === 1,
    })),
    products: prodRows.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      categoryName: catNameById.get(p.categoryId) || "General",
      name: p.name,
      description: p.description ?? "",
      barcode: p.barcode ?? "",
      costPrice: Number(p.costPrice) || 0,
      unitPrice: Number(p.unitPrice) || 0,
      stockQuantity: Math.max(0, Math.trunc(Number(p.stockQuantity) || 0)),
      lowStockThreshold: Math.max(1, Math.trunc(Number(p.lowStockThreshold) || 5)),
      active: p.isActive === 1,
    })),
    restocks: restockRows
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => ({
        id: r.id,
        productId: r.productId,
        productName: prodNameById.get(r.productId),
        quantity: Number(r.quantity),
        restockDate: r.restockDate,
        createdAt: r.createdAt,
      })),
    sales: saleRows.map((s) => {
      const cust = customerById.get(s.customerId);
      const items = itemsBySale.get(s.id) ?? [];
      const subtotal = items.reduce(
        (sum, it) => sum + Number(it.quantity) * Number(it.unitPrice),
        0,
      );
      return {
        id: s.id,
        receiptNo: s.receiptNumber,
        customerId: s.customerId,
        customerName: cust?.name || "Walk-in Customer",
        customerPhone: cust?.phonenumber ?? undefined,
        saleDate: s.date,
        subtotal: Number(subtotal.toFixed(2)),
        taxRate: 0,
        taxAmount: Number(s.taxAmount) || 0,
        discountAmount: Number(s.discountAmount) || 0,
        totalAmount: Number(s.totalAmount) || 0,
        amountPaid: Number(s.amountPaid) || 0,
        paymentMode: (s.paymentMode || "cash") as PaymentMode,
        status: (s.status || "completed") as SaleStatus,
        notes: s.details ?? undefined,
        items: items.map((it) => ({
          productId: it.productId,
          productName: prodNameById.get(it.productId),
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
      };
    }),
  };
}

export function replaceLocalSnapshotWithCloud(
  db: ExpoSqliteDrizzleDb,
  snapshot: SyncBootstrapResponse,
): void {
  const nowIso = new Date().toISOString();

  db.transaction((tx) => {
    // Clear transactional cache tables before hydrating tenant snapshot
    tx.delete(saleItems).run();
    tx.delete(sales).run();
    tx.delete(inventory).run();
    tx.delete(products).run();
    tx.delete(productCategories).run();
    tx.delete(customers).run();
    tx.delete(supplierTransactions).run();
    tx.delete(suppliers).run();
    tx.delete(notifications).run();
    tx.delete(broadcastMessages).run();
    tx.delete(auditLogs).run();
    tx.delete(settings).run();
    tx.delete(syncOutbox).run();

    // Ensure authenticated cloud user exists locally for FK references
    const existingUser = tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, snapshot.user.id))
      .limit(1)
      .get();

    if (existingUser) {
      tx.update(users)
        .set({
          username: snapshot.user.username,
          email: snapshot.user.email || `${snapshot.user.username}@local`,
          firstname: snapshot.user.firstname || "",
          lastname: snapshot.user.lastname || "",
          phonenumber: snapshot.user.phonenumber ?? null,
          role: snapshot.user.role,
          lastLoginAt: snapshot.user.lastLoginAt ?? nowIso,
          updatedAt: nowIso,
        })
        .where(eq(users.id, snapshot.user.id))
        .run();
    } else {
      // Remove any colliding username/email local seed user first so insert succeeds cleanly
      tx.delete(users).run();
      tx.insert(users)
        .values({
          id: snapshot.user.id,
          username: snapshot.user.username,
          email: snapshot.user.email || `${snapshot.user.username}@local`,
          passwordHash: "synced-cloud-account",
          firstname: snapshot.user.firstname || "",
          lastname: snapshot.user.lastname || "",
          phonenumber: snapshot.user.phonenumber ?? null,
          role: snapshot.user.role,
          lastLoginAt: snapshot.user.lastLoginAt ?? nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .run();
    }

    const ownerId = snapshot.user.id;

    // Store settings
    tx.insert(settings)
      .values({
        id: `settings-${snapshot.tenant.id}`,
        userId: ownerId,
        businessName: snapshot.store.storeName || snapshot.tenant.name || "Inventory Pro",
        businessAddress: snapshot.store.storeAddress || "",
        businessPhone: snapshot.store.storePhone || "",
        businessEmail: snapshot.store.storeEmail || "",
        currency: snapshot.store.currency || "GHS",
        taxRate: Number(snapshot.store.taxRate ?? 0),
        stockAlertThreshold: Math.max(
          1,
          Math.trunc(Number(snapshot.store.stockAlertThreshold ?? 5)),
        ),
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    // Categories
    const knownCategoryIds = new Set<string>();
    const categoryIdByName = new Map<string, string>();
    const usedCatNames = new Set<string>();

    for (const c of snapshot.categories) {
      const cleanName = c.name.trim() || `Category-${c.id.slice(0, 6)}`;
      if (usedCatNames.has(cleanName.toLowerCase())) continue;
      usedCatNames.add(cleanName.toLowerCase());
      knownCategoryIds.add(c.id);
      categoryIdByName.set(cleanName.toLowerCase(), c.id);
      tx.insert(productCategories)
        .values({
          id: c.id,
          userId: ownerId,
          name: cleanName,
          description: c.description || null,
          isActive: c.isActive ? 1 : 0,
          createdAt: c.updatedAt || nowIso,
          updatedAt: c.updatedAt || nowIso,
        })
        .run();
    }

    let fallbackCategoryId = categoryIdByName.get("general");
    if (!fallbackCategoryId) {
      fallbackCategoryId =
        snapshot.categories[0]?.id || `cat-general-${snapshot.tenant.id}`;
      if (!knownCategoryIds.has(fallbackCategoryId)) {
        knownCategoryIds.add(fallbackCategoryId);
        tx.insert(productCategories)
          .values({
            id: fallbackCategoryId,
            userId: ownerId,
            name: "General",
            description: "Default category",
            isActive: 1,
            createdAt: nowIso,
            updatedAt: nowIso,
          })
          .run();
      }
    }

    // Customers
    const knownCustomerIds = new Set<string>();
    for (const c of snapshot.customers) {
      knownCustomerIds.add(c.id);
      tx.insert(customers)
        .values({
          id: c.id,
          userId: ownerId,
          name: c.name || "Walk-in Customer",
          email: c.email ?? null,
          address: c.address ?? null,
          phonenumber: c.phonenumber ?? null,
          createdAt: c.createdAt || nowIso,
          updatedAt: c.updatedAt || nowIso,
        })
        .run();
    }

    // Suppliers
    for (const s of snapshot.suppliers) {
      tx.insert(suppliers)
        .values({
          id: s.id,
          userId: ownerId,
          name: s.name || "Supplier",
          companyName: s.companyName || s.name || "",
          email: s.email ?? null,
          address: s.address ?? null,
          phonenumber: s.phonenumber ?? null,
          isActive: s.isActive ? 1 : 0,
          createdAt: s.createdAt || nowIso,
          updatedAt: s.updatedAt || nowIso,
        })
        .run();
    }

    // Products
    const knownProductIds = new Set<string>();
    const productCategoryByProductId = new Map<string, string>();
    for (const p of snapshot.products) {
      let resolvedCategoryId = knownCategoryIds.has(p.categoryId)
        ? p.categoryId
        : categoryIdByName.get((p.categoryName || "").trim().toLowerCase()) ||
          fallbackCategoryId;

      if (!resolvedCategoryId) {
        resolvedCategoryId = fallbackCategoryId;
      }

      knownProductIds.add(p.id);
      productCategoryByProductId.set(p.id, resolvedCategoryId);
      tx.insert(products)
        .values({
          id: p.id,
          userId: ownerId,
          categoryId: resolvedCategoryId,
          name: p.name,
          photoUrl: "",
          barcode: p.barcode || "",
          description: p.description || "",
          costPrice: Math.max(0, Number(p.costPrice) || 0),
          unitPrice: Math.max(0, Number(p.unitPrice) || 0),
          stockQuantity: Math.max(0, Math.trunc(Number(p.stockQuantity) || 0)),
          lowStockThreshold: Math.max(
            1,
            Math.trunc(Number(p.lowStockThreshold) || 5),
          ),
          isActive: p.active ? 1 : 0,
          createdAt: p.updatedAt || nowIso,
          updatedAt: p.updatedAt || nowIso,
        })
        .run();
    }

    // Restocks
    for (const r of snapshot.restocks) {
      if (!knownProductIds.has(r.productId)) continue;
      const catId = productCategoryByProductId.get(r.productId) || fallbackCategoryId;
      tx.insert(inventory)
        .values({
          id: r.id,
          userId: ownerId,
          productId: r.productId,
          productCategoryId: catId,
          quantity: Math.trunc(Number(r.quantity) || 0),
          restockDate: (r.restockDate || nowIso).slice(0, 10),
          notes: r.notes || "",
          createdAt: r.createdAt || nowIso,
          updatedAt: r.createdAt || nowIso,
        })
        .run();
    }

    // Sales
    const knownSaleIds = new Set<string>();
    const usedReceipts = new Set<string>();
    for (const s of snapshot.sales) {
      let custId = s.customerId;
      if (!custId || !knownCustomerIds.has(custId)) {
        custId = `cust-fallback-${custId || generateId("c")}`;
        if (!knownCustomerIds.has(custId)) {
          knownCustomerIds.add(custId);
          tx.insert(customers)
            .values({
              id: custId,
              userId: ownerId,
              name: s.customerName || "Walk-in Customer",
              phonenumber: s.customerPhone ?? null,
              createdAt: s.saleDate || nowIso,
              updatedAt: nowIso,
            })
            .run();
        }
      }

      let receiptNumber = s.receiptNo || `INVP-${s.id.slice(0, 8)}`;
      if (usedReceipts.has(receiptNumber)) {
        receiptNumber = `${receiptNumber}-${s.id.slice(0, 4)}`;
      }
      usedReceipts.add(receiptNumber);

      knownSaleIds.add(s.id);
      tx.insert(sales)
        .values({
          id: s.id,
          customerId: custId,
          userId: ownerId,
          receiptNumber,
          date: s.saleDate || nowIso,
          details: s.notes || "",
          totalAmount: Math.max(0, Number(s.totalAmount) || 0),
          discountAmount: Math.max(0, Number(s.discountAmount) || 0),
          taxAmount: Math.max(0, Number(s.taxAmount) || 0),
          amountPaid: Math.max(0, Number(s.amountPaid) || 0),
          paymentMode: (["cash", "momo", "bank", "cheque"].includes(s.paymentMode)
            ? s.paymentMode
            : "cash") as PaymentMode,
          status: (["pending", "completed", "failed", "refunded"].includes(s.status)
            ? s.status
            : "completed") as SaleStatus,
          createdAt: s.saleDate || nowIso,
          updatedAt: nowIso,
        })
        .run();
    }

    // Sale Items
    for (const it of snapshot.saleItems) {
      if (!knownSaleIds.has(it.saleId) || !knownProductIds.has(it.productId)) {
        continue;
      }
      tx.insert(saleItems)
        .values({
          id: it.id,
          salesId: it.saleId,
          productId: it.productId,
          quantity: Math.max(0, Math.trunc(Number(it.quantity) || 0)),
          unitPrice: Math.max(0, Number(it.unitPrice) || 0),
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .run();
    }

    setSyncMetaTx(tx, "last_sync_cursor", String(snapshot.latestCursor || 0));
    setSyncMetaTx(tx, "last_synced_at", snapshot.syncedAt || nowIso);
    setSyncMetaTx(tx, "tenant_id", snapshot.tenant.id);
    setSyncMetaTx(tx, "tenant_slug", snapshot.tenant.slug);
  });
}

function setSyncMetaTx(
  tx: Parameters<Parameters<ExpoSqliteDrizzleDb["transaction"]>[0]>[0],
  key: string,
  value: string,
): void {
  const nowIso = new Date().toISOString();
  const existing = tx
    .select({ key: syncMeta.key })
    .from(syncMeta)
    .where(eq(syncMeta.key, key))
    .limit(1)
    .get();
  if (existing) {
    tx.update(syncMeta)
      .set({ value, updatedAt: nowIso })
      .where(eq(syncMeta.key, key))
      .run();
  } else {
    tx.insert(syncMeta)
      .values({ key, value, updatedAt: nowIso })
      .run();
  }
}

export function setSyncMetaValue(
  db: ExpoSqliteDrizzleDb,
  key: string,
  value: string,
): void {
  db.transaction((tx) => setSyncMetaTx(tx, key, value));
}

export function getSyncMetaValue(
  db: ExpoSqliteDrizzleDb,
  key: string,
): string | null {
  const row = db
    .select({ value: syncMeta.value })
    .from(syncMeta)
    .where(eq(syncMeta.key, key))
    .limit(1)
    .get();
  return row?.value ?? null;
}

export function applyRemoteSyncEvent(
  db: ExpoSqliteDrizzleDb,
  event: SyncEventDto,
): void {
  const nowIso = event.createdAt || new Date().toISOString();
  const payload = event.payload ?? {};

  db.transaction((tx) => {
    if (
      event.entityType === "product" &&
      (event.action === "stock_delta" || event.action === "upsert") &&
      event.entityId &&
      typeof payload.stockQuantity === "number"
    ) {
      tx.update(products)
        .set({
          stockQuantity: Math.max(0, Math.trunc(Number(payload.stockQuantity))),
          updatedAt: nowIso,
        })
        .where(eq(products.id, event.entityId))
        .run();
    } else if (event.entityType === "settings" && event.action === "upsert") {
      const existingSetting = tx
        .select({ id: settings.id })
        .from(settings)
        .limit(1)
        .get();
      if (existingSetting) {
        const patch: Partial<typeof settings.$inferInsert> = {
          updatedAt: nowIso,
        };
        if (typeof payload.storeName === "string") patch.businessName = payload.storeName;
        if (typeof payload.storeAddress === "string") patch.businessAddress = payload.storeAddress;
        if (typeof payload.storePhone === "string") patch.businessPhone = payload.storePhone;
        if (typeof payload.storeEmail === "string") patch.businessEmail = payload.storeEmail;
        if (typeof payload.currency === "string") patch.currency = payload.currency;
        if (typeof payload.taxRate === "number") patch.taxRate = payload.taxRate;
        if (typeof payload.stockAlertThreshold === "number") {
          patch.stockAlertThreshold = payload.stockAlertThreshold;
        }
        tx.update(settings)
          .set(patch)
          .where(eq(settings.id, existingSetting.id))
          .run();
      }
    }

    if (event.cursor > 0) {
      setSyncMetaTx(tx, "last_sync_cursor", String(event.cursor));
    }
    setSyncMetaTx(tx, "last_synced_at", nowIso);
  });
}

export function enqueueOutboxMutation(
  db: ExpoSqliteDrizzleDb,
  input: {
    clientMutationId: string;
    entityType: string;
    operation: string;
    endpoint: string;
    method: string;
    payload: unknown;
  },
): SyncOutboxItem {
  const id = generateId("outbox");
  const nowIso = new Date().toISOString();
  const payloadJson = JSON.stringify(input.payload ?? {});

  db.insert(syncOutbox)
    .values({
      id,
      clientMutationId: input.clientMutationId,
      entityType: input.entityType,
      operation: input.operation,
      endpoint: input.endpoint,
      method: input.method,
      payloadJson,
      status: "pending",
      retryCount: 0,
      createdAt: nowIso,
    })
    .run();

  return {
    id,
    clientMutationId: input.clientMutationId,
    entityType: input.entityType,
    operation: input.operation,
    endpoint: input.endpoint,
    method: input.method,
    payloadJson,
    status: "pending",
    retryCount: 0,
    lastError: null,
    createdAt: nowIso,
  };
}

export function listPendingOutboxItems(
  db: ExpoSqliteDrizzleDb,
): SyncOutboxItem[] {
  const rows = db
    .select()
    .from(syncOutbox)
    .where(inArray(syncOutbox.status, ["pending", "processing"]))
    .orderBy(asc(syncOutbox.createdAt))
    .all();

  return rows.map((r) => ({
    id: r.id,
    clientMutationId: r.clientMutationId,
    entityType: r.entityType,
    operation: r.operation,
    endpoint: r.endpoint,
    method: r.method,
    payloadJson: r.payloadJson,
    status: r.status,
    retryCount: Number(r.retryCount) || 0,
    lastError: r.lastError ?? null,
    createdAt: r.createdAt,
  }));
}

export function getOutboxCounts(db: ExpoSqliteDrizzleDb): {
  pending: number;
  conflict: number;
} {
  const rows = db.select({ status: syncOutbox.status }).from(syncOutbox).all();
  let pending = 0;
  let conflict = 0;
  for (const r of rows) {
    if (r.status === "pending" || r.status === "processing") pending += 1;
    else if (r.status === "conflict" || r.status === "failed") conflict += 1;
  }
  return { pending, conflict };
}

export function markOutboxItemState(
  db: ExpoSqliteDrizzleDb,
  id: string,
  status: "pending" | "processing" | "conflict" | "failed",
  options?: { error?: string | null; incrementRetry?: boolean },
): void {
  const existing = db
    .select({ retryCount: syncOutbox.retryCount })
    .from(syncOutbox)
    .where(eq(syncOutbox.id, id))
    .limit(1)
    .get();
  if (!existing) return;

  db.update(syncOutbox)
    .set({
      status,
      retryCount: options?.incrementRetry
        ? Number(existing.retryCount || 0) + 1
        : Number(existing.retryCount || 0),
      lastError: options?.error ?? null,
    })
    .where(eq(syncOutbox.id, id))
    .run();
}

export function removeOutboxItem(db: ExpoSqliteDrizzleDb, id: string): void {
  db.delete(syncOutbox).where(eq(syncOutbox.id, id)).run();
}

export function clearFailedOutboxItems(db: ExpoSqliteDrizzleDb): void {
  db.delete(syncOutbox)
    .where(inArray(syncOutbox.status, ["conflict", "failed"]))
    .run();
}
