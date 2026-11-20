import { NextResponse } from "next/server";
import db from "@/db/knex";
import { ensureSecuritySchema } from "@/lib/security";
import { getLatestTenantCursor } from "@/lib/sync-bus";
import {
  getTenantStoreProfile,
  getUserTwoFactorFlags,
  mapProductRow,
  mapSessionUserToMobile,
  parseDbBool,
  parseSaleDetails,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

function serializeAuditValue(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    await ensureSecuritySchema();
    const isAdmin = session.role === "admin";
    const userTwoFactor = await getUserTwoFactorFlags(session.id);

    const [
      latestCursor,
      store,
      categories,
      products,
      customers,
      suppliers,
      restocks,
      sales,
      saleItems,
      employees,
      supplierTransactions,
      notifications,
      broadcastMessages,
      auditLogs,
    ] = await Promise.all([
      getLatestTenantCursor(tenantId),
      getTenantStoreProfile(tenantId, session),
      db("product_categories")
        .where("tenant_id", tenantId)
        .select("id", "name", "description", "is_active", "created_at", "updated_at")
        .orderBy("name", "asc"),
      db("v_product_catalog")
        .where("tenant_id", tenantId)
        .select("*")
        .orderBy("updated_at", "desc"),
      db("customers")
        .where("tenant_id", tenantId)
        .select("id", "name", "email", "phonenumber", "address", "created_at", "updated_at")
        .orderBy("name", "asc"),
      db("suppliers")
        .where("tenant_id", tenantId)
        .select("id", "name", "company_name", "email", "phonenumber", "address", "is_active", "created_at", "updated_at")
        .orderBy("name", "asc"),
      db("inventory as i")
        .leftJoin("products as p", "i.product_id", "p.id")
        .leftJoin("product_categories as pc", "i.product_category_id", "pc.id")
        .leftJoin("users as u", "i.user_id", "u.id")
        .where("i.tenant_id", tenantId)
        .select(
          "i.id",
          "i.product_id",
          "p.name as product_name",
          "pc.name as category_name",
          "i.quantity",
          "i.restock_date",
          "u.username as user_name",
          "i.created_at",
        )
        .orderBy("i.created_at", "desc")
        .limit(300),
      db("sales as s")
        .leftJoin("customers as c", "s.customer_id", "c.id")
        .leftJoin("users as u", "s.user_id", "u.id")
        .where("s.tenant_id", tenantId)
        .select(
          "s.*",
          "c.name as customer_name",
          "c.phonenumber as customer_phone",
          "u.username as cashier_username",
        )
        .orderBy("s.date", "desc")
        .limit(500),
      db("sale_items as si")
        .leftJoin("products as p", "si.product_id", "p.id")
        .where("si.tenant_id", tenantId)
        .select("si.id", "si.sales_id", "si.product_id", "p.name as product_name", "si.quantity", "si.unit_price", "si.created_at")
        .orderBy("si.created_at", "desc")
        .limit(2000),
      isAdmin
        ? db("users")
            .where("tenant_id", tenantId)
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
            .orderBy("created_at", "asc")
        : Promise.resolve([]),
      db("supplier_transactions")
        .where("tenant_id", tenantId)
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
        .orderBy("transaction_date", "desc")
        .limit(500),
      db("notifications")
        .where({ tenant_id: tenantId, user_id: session.id })
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
        .orderBy("created_at", "desc")
        .limit(200),
      db("broadcast_messages")
        .where("tenant_id", tenantId)
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
        .orderBy("created_at", "desc")
        .limit(100),
      isAdmin
        ? db("audit_logs")
            .where("tenant_id", tenantId)
            .select(
              "id",
              "user_id",
              "entity_type",
              "entity_id",
              "action",
              "old_values",
              "new_values",
              "created_at",
            )
            .orderBy("created_at", "desc")
            .limit(200)
        : Promise.resolve([]),
    ]);

    const mobileUser = mapSessionUserToMobile(session, userTwoFactor);

    return NextResponse.json({
      latestCursor,
      syncedAt: new Date().toISOString(),
      tenant: {
        id: mobileUser.tenantId,
        name: mobileUser.tenantName,
        slug: mobileUser.tenantSlug,
      },
      user: mobileUser,
      store,
      categories: categories.map((c: any) => ({
        id: String(c.id),
        name: String(c.name),
        description: String(c.description || ""),
        isActive: Boolean(Number(c.is_active ?? 1)),
        updatedAt: String(c.updated_at || c.created_at || new Date().toISOString()),
      })),
      products: products.map(mapProductRow),
      customers: customers.map((c: any) => ({
        id: String(c.id),
        name: String(c.name),
        email: c.email || undefined,
        phonenumber: c.phonenumber || undefined,
        address: c.address || undefined,
        createdAt: String(c.created_at || new Date().toISOString()),
        updatedAt: String(c.updated_at || c.created_at || new Date().toISOString()),
      })),
      suppliers: suppliers.map((s: any) => ({
        id: String(s.id),
        name: String(s.name),
        companyName: String(s.company_name || s.name || ""),
        email: s.email || undefined,
        phonenumber: s.phonenumber || undefined,
        address: s.address || undefined,
        isActive: Boolean(Number(s.is_active ?? 1)),
        createdAt: String(s.created_at || new Date().toISOString()),
        updatedAt: String(s.updated_at || s.created_at || new Date().toISOString()),
      })),
      restocks: restocks.map((r: any) => ({
        id: String(r.id),
        productId: String(r.product_id),
        productName: String(r.product_name || "Product"),
        categoryName: String(r.category_name || "General"),
        quantity: Number(r.quantity ?? 0),
        restockDate: String(r.restock_date || r.created_at || new Date().toISOString()),
        notes: "",
        userName: String(r.user_name || "Staff"),
        createdAt: String(r.created_at || new Date().toISOString()),
      })),
      sales: sales.map((s: any) => {
        const details = parseSaleDetails(s.details);
        const isRefunded = s.status === "failed" || Boolean(details.refunded);
        const totalAmount = Number(s.total_amount ?? 0);
        return {
          id: String(s.id),
          userId: s.user_id ? String(s.user_id) : undefined,
          receiptNo: String(s.receipt_number || `INVP-${String(s.id).slice(0, 8)}`),
          customerId: String(s.customer_id || ""),
          customerName: String(s.customer_name || "Walk-in Customer"),
          customerPhone: s.customer_phone || undefined,
          cashierName: String(s.cashier_username || "Staff"),
          saleDate: String(s.date || s.created_at || new Date().toISOString()),
          subtotal: Number(details.subtotal ?? totalAmount),
          taxRate: Number(details.taxRate ?? store.taxRate ?? 0),
          taxAmount: Number(details.taxAmount ?? 0),
          discountAmount: Number(details.discountAmount ?? 0),
          totalAmount,
          amountPaid: Number(details.amountPaid ?? totalAmount),
          paymentMode: s.payment_mode || "cash",
          status: isRefunded ? "refunded" : s.status || "completed",
          notes: details.notes ? String(details.notes) : undefined,
        };
      }),
      saleItems: saleItems.map((it: any) => ({
        id: String(it.id),
        saleId: String(it.sales_id),
        productId: String(it.product_id),
        productName: String(it.product_name || "Product"),
        quantity: Number(it.quantity ?? 0),
        unitPrice: Number(it.unit_price ?? 0),
        subtotal: Number(it.quantity ?? 0) * Number(it.unit_price ?? 0),
      })),
      employees: employees.map((u: any) => ({
        id: String(u.id),
        username: String(u.username),
        email: String(u.email || ""),
        firstname: String(u.firstname || ""),
        lastname: String(u.lastname || ""),
        phonenumber: u.phonenumber || undefined,
        role: u.role === "admin" ? ("admin" as const) : ("member" as const),
        twoFactorEnabled: parseDbBool(u.two_factor_enabled, false),
        twoFactorMethod: u.two_factor_method === "sms" ? ("sms" as const) : ("email" as const),
        lockedUntil: u.locked_until ? String(u.locked_until) : null,
        lastLoginAt: u.last_login_at ? String(u.last_login_at) : null,
        createdAt: String(u.created_at || new Date().toISOString()),
        updatedAt: String(u.updated_at || u.created_at || new Date().toISOString()),
      })),
      supplierTransactions: supplierTransactions.map((t: any) => ({
        id: String(t.id),
        transactionNo: String(t.transaction_no || `SUP-${String(t.id).slice(0, 8)}`),
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
      })),
      notifications: notifications.map((n: any) => ({
        id: String(n.id),
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
      })),
      broadcastMessages: broadcastMessages.map((m: any) => ({
        id: String(m.id),
        senderId: String(m.sender_id || ""),
        senderName: String(m.sender_name || "Admin"),
        recipientGroup: m.recipient_group,
        channel: m.channel,
        subject: m.subject ?? null,
        content: String(m.content || ""),
        recipientCount: Number(m.recipient_count ?? 0),
        status: m.status || "sent",
        createdAt: String(m.created_at || new Date().toISOString()),
      })),
      auditLogs: auditLogs.map((a: any) => ({
        id: String(a.id),
        userId: a.user_id ? String(a.user_id) : null,
        entityType: String(a.entity_type || ""),
        entityId: String(a.entity_id || ""),
        action: String(a.action || "update"),
        oldValues: serializeAuditValue(a.old_values),
        newValues: serializeAuditValue(a.new_values),
        createdAt: String(a.created_at || new Date().toISOString()),
      })),
    });
  });
}
