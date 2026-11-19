import { NextResponse } from "next/server";
import db from "@/db/knex";
import { getLatestTenantCursor } from "@/lib/sync-bus";
import {
  getTenantStoreProfile,
  mapProductRow,
  mapSessionUserToMobile,
  parseSaleDetails,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const [latestCursor, store, categories, products, customers, suppliers, restocks, sales, saleItems] =
      await Promise.all([
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
      ]);

    const mobileUser = mapSessionUserToMobile(session);

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
    });
  });
}
