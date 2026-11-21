import "server-only";
import db from "@/db/knex";
import {
  getTenantStoreProfile,
  mapProductRow,
  parseDbBool,
  parseSaleDetails,
} from "@/lib/mobile-api";
import type {
  SyncActionType,
  SyncEntityType,
  SyncEventRecord,
} from "@/lib/sync-bus";

export interface SyncEventDto {
  cursor: number;
  tenantId: string;
  entityType: SyncEntityType | string;
  entityId: string;
  action: SyncActionType | string;
  payload: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: string;
}

const SPECIAL_BULK_IDS = new Set(["bulk", "merge", "all", "*"]);

function splitEntityIds(entityId: string): string[] {
  const clean = String(entityId || "").trim();
  if (!clean || SPECIAL_BULK_IDS.has(clean.toLowerCase())) {
    return [];
  }
  return Array.from(
    new Set(
      clean
        .split(",")
        .map((s) => s.trim())
        .filter((s) => Boolean(s) && !SPECIAL_BULK_IDS.has(s.toLowerCase())),
    ),
  );
}

export function normalizeSyncEntityType(
  raw: string,
): SyncEntityType | string {
  const clean = String(raw || "").trim();
  if (clean === "supplier_tx") return "supplier_transaction";
  return clean;
}

export function toSyncEventDto(record: SyncEventRecord): SyncEventDto {
  return {
    cursor: Number(record.cursor) || 0,
    tenantId: String(record.tenant_id || ""),
    entityType: normalizeSyncEntityType(record.entity_type),
    entityId: String(record.entity_id || ""),
    action: record.action,
    payload:
      record.payload && typeof record.payload === "object"
        ? { ...record.payload }
        : null,
    actorUserId: record.actor_user_id ? String(record.actor_user_id) : null,
    createdAt: String(record.created_at || new Date().toISOString()),
  };
}

export async function enrichSyncEventsBatch(
  tenantId: string,
  records: SyncEventRecord[],
): Promise<SyncEventDto[]> {
  if (!records || records.length === 0) return [];

  const dtos = records.map(toSyncEventDto);

  const idsByType = {
    product: new Set<string>(),
    category: new Set<string>(),
    customer: new Set<string>(),
    supplier: new Set<string>(),
    supplier_transaction: new Set<string>(),
    inventory: new Set<string>(),
    sale: new Set<string>(),
    employee: new Set<string>(),
    notification: new Set<string>(),
    message: new Set<string>(),
  };
  let needsSettings = false;

  for (const evt of dtos) {
    if (evt.action === "delete") continue;

    if (evt.entityType === "settings") {
      if (evt.action === "upsert" || evt.action === "refresh") {
        needsSettings = true;
      }
      continue;
    }

    const ids = splitEntityIds(evt.entityId);
    if (ids.length === 0) continue;

    if (evt.entityType === "product") {
      ids.forEach((id) => idsByType.product.add(id));
    } else if (evt.entityType === "category") {
      ids.forEach((id) => idsByType.category.add(id));
    } else if (evt.entityType === "customer") {
      ids.forEach((id) => idsByType.customer.add(id));
    } else if (evt.entityType === "supplier") {
      ids.forEach((id) => idsByType.supplier.add(id));
    } else if (evt.entityType === "supplier_transaction") {
      ids.forEach((id) => idsByType.supplier_transaction.add(id));
    } else if (evt.entityType === "inventory") {
      ids.forEach((id) => idsByType.inventory.add(id));
    } else if (evt.entityType === "sale") {
      ids.forEach((id) => idsByType.sale.add(id));
    } else if (evt.entityType === "employee") {
      ids.forEach((id) => idsByType.employee.add(id));
    } else if (evt.entityType === "notification") {
      ids.forEach((id) => idsByType.notification.add(id));
    } else if (evt.entityType === "message") {
      ids.forEach((id) => idsByType.message.add(id));
    }
  }

  const needsStoreTax = needsSettings || idsByType.sale.size > 0;
  const storeProfilePromise = needsStoreTax
    ? getTenantStoreProfile(tenantId).catch(() => null)
    : Promise.resolve(null);

  const productIds = Array.from(idsByType.product);
  const categoryIds = Array.from(idsByType.category);
  const customerIds = Array.from(idsByType.customer);
  const supplierIds = Array.from(idsByType.supplier);
  const supplierTxIds = Array.from(idsByType.supplier_transaction);
  const inventoryIds = Array.from(idsByType.inventory);
  const saleIds = Array.from(idsByType.sale);
  const employeeIds = Array.from(idsByType.employee);
  const notificationIds = Array.from(idsByType.notification);
  const messageIds = Array.from(idsByType.message);

  const [
    storeProfile,
    productRows,
    categoryRows,
    customerRows,
    supplierRows,
    supplierTxRows,
    inventoryRows,
    saleRows,
    saleItemRows,
    employeeRows,
    notificationRows,
    messageRows,
  ] = await Promise.all([
    storeProfilePromise,
    productIds.length > 0
      ? db("v_product_catalog")
          .where("tenant_id", tenantId)
          .whereIn("product_id", productIds)
          .select("*")
      : Promise.resolve([]),
    categoryIds.length > 0
      ? db("product_categories")
          .where("tenant_id", tenantId)
          .whereIn("id", categoryIds)
          .select(
            "id",
            "name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
          )
      : Promise.resolve([]),
    customerIds.length > 0
      ? db("customers")
          .where("tenant_id", tenantId)
          .whereIn("id", customerIds)
          .select(
            "id",
            "name",
            "email",
            "phonenumber",
            "address",
            "created_at",
            "updated_at",
          )
      : Promise.resolve([]),
    supplierIds.length > 0
      ? db("suppliers")
          .where("tenant_id", tenantId)
          .whereIn("id", supplierIds)
          .select(
            "id",
            "name",
            "company_name",
            "email",
            "phonenumber",
            "address",
            "is_active",
            "created_at",
            "updated_at",
          )
      : Promise.resolve([]),
    supplierTxIds.length > 0
      ? db("supplier_transactions")
          .where("tenant_id", tenantId)
          .whereIn("id", supplierTxIds)
          .select(
            "id",
            "transaction_no",
            "supplier_id",
            "user_id",
            "delivered_by",
            "transaction_date",
            "total_amount",
            "amount_paid",
            "balance",
            "payment_mode",
            "status",
            "notes",
            "created_at",
            "updated_at",
          )
      : Promise.resolve([]),
    inventoryIds.length > 0
      ? db("inventory as i")
          .leftJoin("products as p", "i.product_id", "p.id")
          .leftJoin("product_categories as pc", "i.product_category_id", "pc.id")
          .leftJoin("users as u", "i.user_id", "u.id")
          .where("i.tenant_id", tenantId)
          .whereIn("i.id", inventoryIds)
          .select(
            "i.id",
            "i.product_id",
            "i.product_category_id",
            "i.user_id",
            "p.name as product_name",
            "pc.name as category_name",
            "i.quantity",
            "i.restock_date",
            "u.username as user_name",
            "i.created_at",
            "i.updated_at",
          )
      : Promise.resolve([]),
    saleIds.length > 0
      ? db("sales as s")
          .leftJoin("customers as c", "s.customer_id", "c.id")
          .leftJoin("users as u", "s.user_id", "u.id")
          .where("s.tenant_id", tenantId)
          .whereIn("s.id", saleIds)
          .select(
            "s.*",
            "c.name as customer_name",
            "c.phonenumber as customer_phone",
            "u.username as cashier_username",
          )
      : Promise.resolve([]),
    saleIds.length > 0
      ? db("sale_items as si")
          .leftJoin("products as p", "si.product_id", "p.id")
          .where("si.tenant_id", tenantId)
          .whereIn("si.sales_id", saleIds)
          .select(
            "si.id",
            "si.sales_id",
            "si.product_id",
            "p.name as product_name",
            "si.quantity",
            "si.unit_price",
            "si.created_at",
          )
      : Promise.resolve([]),
    employeeIds.length > 0
      ? db("users")
          .where("tenant_id", tenantId)
          .whereIn("id", employeeIds)
          .select(
            "id",
            "username",
            "email",
            "firstname",
            "lastname",
            "phonenumber",
            "role",
            "two_factor_enabled",
            "two_factor_method",
            "locked_until",
            "last_login_at",
            "created_at",
            "updated_at",
          )
      : Promise.resolve([]),
    notificationIds.length > 0
      ? db("notifications")
          .where("tenant_id", tenantId)
          .whereIn("id", notificationIds)
          .select(
            "id",
            "user_id",
            "type",
            "title",
            "message",
            "is_read",
            "reference_type",
            "reference_id",
            "created_at",
            "updated_at",
          )
      : Promise.resolve([]),
    messageIds.length > 0
      ? db("broadcast_messages")
          .where("tenant_id", tenantId)
          .whereIn("id", messageIds)
          .select(
            "id",
            "sender_id",
            "sender_name",
            "recipient_group",
            "channel",
            "subject",
            "content",
            "recipient_count",
            "status",
            "created_at",
          )
      : Promise.resolve([]),
  ]);

  const productMap = new Map<string, Record<string, unknown>>();
  for (const row of productRows) {
    const mapped = mapProductRow(row);
    productMap.set(mapped.id, mapped as unknown as Record<string, unknown>);
  }

  const categoryMap = new Map<string, Record<string, unknown>>();
  for (const c of categoryRows) {
    const id = String(c.id);
    categoryMap.set(id, {
      id,
      name: String(c.name),
      description: String(c.description || ""),
      isActive: Boolean(Number(c.is_active ?? 1)),
      updatedAt: String(c.updated_at || c.created_at || new Date().toISOString()),
    });
  }

  const customerMap = new Map<string, Record<string, unknown>>();
  for (const c of customerRows) {
    const id = String(c.id);
    customerMap.set(id, {
      id,
      name: String(c.name),
      email: c.email || undefined,
      phonenumber: c.phonenumber || undefined,
      address: c.address || undefined,
      createdAt: String(c.created_at || new Date().toISOString()),
      updatedAt: String(c.updated_at || c.created_at || new Date().toISOString()),
    });
  }

  const supplierMap = new Map<string, Record<string, unknown>>();
  for (const s of supplierRows) {
    const id = String(s.id);
    supplierMap.set(id, {
      id,
      name: String(s.name),
      companyName: String(s.company_name || s.name || ""),
      email: s.email || undefined,
      phonenumber: s.phonenumber || undefined,
      address: s.address || undefined,
      isActive: Boolean(Number(s.is_active ?? 1)),
      createdAt: String(s.created_at || new Date().toISOString()),
      updatedAt: String(s.updated_at || s.created_at || new Date().toISOString()),
    });
  }

  const supplierTxMap = new Map<string, Record<string, unknown>>();
  for (const t of supplierTxRows) {
    const id = String(t.id);
    supplierTxMap.set(id, {
      id,
      transactionNo: String(t.transaction_no || `SUP-${id.slice(0, 8)}`),
      supplierId: String(t.supplier_id),
      userId: t.user_id ? String(t.user_id) : undefined,
      deliveredBy: t.delivered_by || undefined,
      transactionDate: String(t.transaction_date || t.created_at || new Date().toISOString()),
      totalAmount: Number(t.total_amount ?? 0),
      amountPaid: Number(t.amount_paid ?? 0),
      balance: Math.max(0, Number(t.balance ?? 0)),
      paymentMode: t.payment_mode || "cash",
      status: t.status || "completed",
      notes: t.notes || undefined,
      createdAt: String(t.created_at || new Date().toISOString()),
      updatedAt: String(t.updated_at || t.created_at || new Date().toISOString()),
    });
  }

  const inventoryMap = new Map<string, Record<string, unknown>>();
  for (const r of inventoryRows) {
    const id = String(r.id);
    inventoryMap.set(id, {
      id,
      productId: String(r.product_id),
      productCategoryId: r.product_category_id ? String(r.product_category_id) : undefined,
      userId: r.user_id ? String(r.user_id) : undefined,
      productName: String(r.product_name || "Product"),
      categoryName: String(r.category_name || "General"),
      quantity: Number(r.quantity ?? 0),
      restockDate: String(r.restock_date || r.created_at || new Date().toISOString()),
      notes: "",
      userName: String(r.user_name || "Staff"),
      createdAt: String(r.created_at || new Date().toISOString()),
      updatedAt: String(r.updated_at || r.created_at || new Date().toISOString()),
    });
  }

  const saleItemsBySaleId = new Map<string, Array<Record<string, unknown>>>();
  for (const it of saleItemRows) {
    const sid = String(it.sales_id);
    const list = saleItemsBySaleId.get(sid) ?? [];
    const q = Number(it.quantity ?? 0);
    const up = Number(it.unit_price ?? 0);
    list.push({
      id: String(it.id),
      saleId: sid,
      productId: String(it.product_id),
      productName: String(it.product_name || "Product"),
      quantity: q,
      unitPrice: up,
      subtotal: q * up,
    });
    saleItemsBySaleId.set(sid, list);
  }

  const defaultTaxRate = Number(storeProfile?.taxRate ?? 0);
  const saleMap = new Map<
    string,
    { record: Record<string, unknown>; items: Array<Record<string, unknown>> }
  >();
  for (const s of saleRows) {
    const id = String(s.id);
    const details = parseSaleDetails(s.details);
    const isRefunded = s.status === "failed" || Boolean(details.refunded);
    const totalAmount = Number(s.total_amount ?? 0);
    saleMap.set(id, {
      record: {
        id,
        userId: s.user_id ? String(s.user_id) : undefined,
        receiptNo: String(s.receipt_number || `INVP-${id.slice(0, 8)}`),
        customerId: String(s.customer_id || ""),
        customerName: String(s.customer_name || "Walk-in Customer"),
        customerPhone: s.customer_phone || undefined,
        cashierName: String(s.cashier_username || "Staff"),
        saleDate: String(s.date || s.created_at || new Date().toISOString()),
        subtotal: Number(details.subtotal ?? totalAmount),
        taxRate: Number(details.taxRate ?? defaultTaxRate),
        taxAmount: Number(details.taxAmount ?? 0),
        discountAmount: Number(details.discountAmount ?? 0),
        totalAmount,
        amountPaid: Number(details.amountPaid ?? totalAmount),
        paymentMode: s.payment_mode || "cash",
        status: isRefunded ? "refunded" : s.status || "completed",
        notes: details.notes ? String(details.notes) : undefined,
      },
      items: saleItemsBySaleId.get(id) ?? [],
    });
  }

  const employeeMap = new Map<string, Record<string, unknown>>();
  for (const u of employeeRows) {
    const id = String(u.id);
    employeeMap.set(id, {
      id,
      username: String(u.username),
      email: String(u.email || ""),
      firstname: String(u.firstname || ""),
      lastname: String(u.lastname || ""),
      phonenumber: u.phonenumber || undefined,
      role: u.role === "admin" ? "admin" : "member",
      twoFactorEnabled: parseDbBool(u.two_factor_enabled, false),
      twoFactorMethod: u.two_factor_method === "sms" ? "sms" : "email",
      lockedUntil: u.locked_until ? String(u.locked_until) : null,
      lastLoginAt: u.last_login_at ? String(u.last_login_at) : null,
      createdAt: String(u.created_at || new Date().toISOString()),
      updatedAt: String(u.updated_at || u.created_at || new Date().toISOString()),
    });
  }

  const notificationMap = new Map<string, Record<string, unknown>>();
  for (const n of notificationRows) {
    const id = String(n.id);
    notificationMap.set(id, {
      id,
      userId: String(n.user_id),
      type:
        n.reference_type === "product_low_stock"
          ? "low_stock"
          : String(n.type || "system"),
      title: String(n.title),
      message: n.message ?? null,
      isRead: Boolean(Number(n.is_read ?? 0)),
      referenceType: n.reference_type ?? null,
      referenceId: n.reference_id ?? null,
      createdAt: String(n.created_at || new Date().toISOString()),
      updatedAt: String(n.updated_at || n.created_at || new Date().toISOString()),
    });
  }

  const messageMap = new Map<string, Record<string, unknown>>();
  for (const m of messageRows) {
    const id = String(m.id);
    messageMap.set(id, {
      id,
      senderId: String(m.sender_id || ""),
      senderName: String(m.sender_name || "Admin"),
      recipientGroup: m.recipient_group,
      channel: m.channel,
      subject: m.subject ?? null,
      content: String(m.content || ""),
      recipientCount: Number(m.recipient_count ?? 0),
      status: m.status || "sent",
      createdAt: String(m.created_at || new Date().toISOString()),
    });
  }

  const mapForType = (
    entityType: string,
  ): Map<string, Record<string, unknown>> | null => {
    switch (entityType) {
      case "product":
        return productMap;
      case "category":
        return categoryMap;
      case "customer":
        return customerMap;
      case "supplier":
        return supplierMap;
      case "supplier_transaction":
        return supplierTxMap;
      case "inventory":
        return inventoryMap;
      case "employee":
        return employeeMap;
      case "notification":
        return notificationMap;
      case "message":
        return messageMap;
      default:
        return null;
    }
  };

  return dtos.map((evt) => {
    const basePayload: Record<string, unknown> = evt.payload
      ? { ...evt.payload }
      : {};

    if (evt.entityType === "notification") {
      const uid = basePayload.userId ?? basePayload.user_id;
      if (typeof uid === "string" && uid) {
        basePayload.userId = uid;
      }
      if (basePayload.isRead === undefined && basePayload.is_read !== undefined) {
        basePayload.isRead = Boolean(basePayload.is_read);
      }
      if (basePayload.allRead === undefined && basePayload.all_read !== undefined) {
        basePayload.allRead = Boolean(basePayload.all_read);
      }
      if (evt.action === "refresh") {
        // Legacy notification deleteAll emitted entityId === userId with no allRead flag
        if (evt.entityId !== "all" && basePayload.allRead !== true && !basePayload.all_read) {
          return {
            ...evt,
            action: "delete",
            entityId: "all",
            payload: {
              ...basePayload,
              userId: evt.entityId,
              allDeleted: true,
            },
          };
        }
        return {
          ...evt,
          entityId: "all",
          payload: {
            ...basePayload,
            userId:
              typeof basePayload.userId === "string"
                ? basePayload.userId
                : evt.entityId !== "all"
                  ? evt.entityId
                  : null,
            allRead: true,
          },
        };
      }
    }

    if (evt.action === "delete") {
      return {
        ...evt,
        payload: Object.keys(basePayload).length > 0 ? basePayload : null,
      };
    }

    if (evt.entityType === "settings") {
      if (storeProfile) {
        return {
          ...evt,
          payload: {
            ...basePayload,
            ...(storeProfile as unknown as Record<string, unknown>),
            record: storeProfile as unknown as Record<string, unknown>,
          },
        };
      }
      return {
        ...evt,
        payload: Object.keys(basePayload).length > 0 ? basePayload : null,
      };
    }

    const ids = splitEntityIds(evt.entityId);

    if (evt.entityType === "sale") {
      if (evt.action === "upsert" && ids.length === 1) {
        const entry = saleMap.get(ids[0]);
        if (entry) {
          return {
            ...evt,
            payload: {
              ...basePayload,
              record: entry.record,
              items: entry.items,
            },
          };
        }
        return {
          ...evt,
          payload: { ...basePayload, missing: true },
        };
      }
      return {
        ...evt,
        payload: Object.keys(basePayload).length > 0 ? basePayload : null,
      };
    }

    const entityMap = mapForType(evt.entityType);
    if (!entityMap || ids.length === 0) {
      return {
        ...evt,
        payload: Object.keys(basePayload).length > 0 ? basePayload : null,
      };
    }

    if (evt.action === "refresh") {
      const foundRecords: Record<string, unknown>[] = [];
      const deletedIds: string[] = [];
      for (const id of ids) {
        const row = entityMap.get(id);
        if (row) foundRecords.push(row);
        else deletedIds.push(id);
      }
      return {
        ...evt,
        payload: {
          ...basePayload,
          ...(foundRecords.length > 0 ? { records: foundRecords } : {}),
          ...(deletedIds.length > 0 ? { deletedIds } : {}),
        },
      };
    }

    // upsert or stock_delta
    if (ids.length === 1) {
      const record = entityMap.get(ids[0]);
      if (record) {
        if (evt.entityType === "product") {
          return {
            ...evt,
            payload: {
              ...basePayload,
              record,
              stockQuantity:
                typeof record.stockQuantity === "number"
                  ? record.stockQuantity
                  : (basePayload.stockQuantity ?? basePayload.stock_quantity),
              stock_quantity:
                typeof record.stockQuantity === "number"
                  ? record.stockQuantity
                  : (basePayload.stock_quantity ?? basePayload.stockQuantity),
              photoUrl:
                typeof record.photoUrl === "string"
                  ? record.photoUrl
                  : basePayload.photoUrl,
            },
          };
        }
        return {
          ...evt,
          payload: {
            ...basePayload,
            record,
          },
        };
      }
      if (evt.action === "upsert") {
        return {
          ...evt,
          payload: { ...basePayload, missing: true },
        };
      }
    }

    // Fallback: normalize stock_quantity -> stockQuantity if stock_delta product was deleted later
    if (
      evt.entityType === "product" &&
      evt.action === "stock_delta" &&
      basePayload.stockQuantity === undefined &&
      basePayload.stock_quantity !== undefined
    ) {
      basePayload.stockQuantity = basePayload.stock_quantity;
    }

    return {
      ...evt,
      payload: Object.keys(basePayload).length > 0 ? basePayload : null,
    };
  });
}

export async function enrichSyncEventRecord(
  record: SyncEventRecord,
): Promise<SyncEventDto> {
  const enriched = await enrichSyncEventsBatch(record.tenant_id, [record]);
  return enriched[0] ?? toSyncEventDto(record);
}

export function scopeSyncEventsForUser(
  events: SyncEventDto[],
  viewer: { userId?: string | null; role?: string | null },
): SyncEventDto[] {
  const viewerId = viewer.userId ? String(viewer.userId) : null;
  const isAdmin = viewer.role === "admin";
  if (!viewerId) return events;

  const scoped: SyncEventDto[] = [];
  for (const evt of events) {
    if (evt.entityType === "notification") {
      const targetUserId =
        typeof evt.payload?.userId === "string"
          ? evt.payload.userId
          : typeof evt.payload?.user_id === "string"
            ? evt.payload.user_id
            : typeof (evt.payload?.record as Record<string, unknown> | undefined)
                  ?.userId === "string"
              ? String(
                  (evt.payload?.record as Record<string, unknown>).userId,
                )
              : null;
      if (targetUserId && targetUserId !== viewerId) {
        continue;
      }
    }

    if (evt.entityType === "employee" && !isAdmin) {
      if (evt.action === "refresh" && Array.isArray(evt.payload?.records)) {
        const ownRecords = (evt.payload.records as Array<Record<string, unknown>>).filter(
          (r) => String(r.id || "") === viewerId,
        );
        if (ownRecords.length === 0) continue;
        scoped.push({
          ...evt,
          entityId: viewerId,
          payload: {
            ...evt.payload,
            records: ownRecords,
            deletedIds: undefined,
          },
        });
        continue;
      }
      if (evt.entityId !== viewerId) {
        continue;
      }
    }

    scoped.push(evt);
  }

  return scoped;
}

