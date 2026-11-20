import { NextResponse } from "next/server";
import db from "@/db/knex";
import {
  insertSyncEvent,
  publishSyncEvent,
  runWithIdempotency,
  type SyncEventRecord,
} from "@/lib/sync-bus";
import {
  extractClientMutationId,
  getDateRangeStartIso,
  getSaleReceiptDetailDto,
  getTenantStoreProfile,
  HttpStatusError,
  parseSaleDetails,
  withMobileAuth,
} from "@/lib/mobile-api";
import { generateId } from "@/utils/generator";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ tenantId }) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const paymentMode = url.searchParams.get("paymentMode")?.trim() || "all";
    const statusFilter = url.searchParams.get("status")?.trim() || "all";
    const dateRange = (url.searchParams.get("dateRange")?.trim() || "all") as
      | "today"
      | "7d"
      | "30d"
      | "all";

    const startIso = getDateRangeStartIso(dateRange);
    let query = db("sales as s")
      .leftJoin("customers as c", "s.customer_id", "c.id")
      .leftJoin("users as u", "s.user_id", "u.id")
      .where("s.tenant_id", tenantId)
      .select(
        "s.*",
        "c.name as customer_name",
        "c.phonenumber as customer_phone",
        "u.username as cashier_name",
      )
      .orderBy("s.date", "desc")
      .limit(250);

    if (startIso) {
      query = query.where("s.date", ">=", startIso);
    }
    if (paymentMode && paymentMode !== "all") {
      query = query.where("s.payment_mode", paymentMode);
    }

    const salesRows = await query;
    const saleIds = salesRows.map((s: any) => s.id);
    const itemCounts = new Map<string, number>();
    if (saleIds.length > 0) {
      const counts = await db("sale_items")
        .where("tenant_id", tenantId)
        .whereIn("sales_id", saleIds)
        .groupBy("sales_id")
        .select("sales_id", db.raw("COALESCE(SUM(quantity), COUNT(*)) as item_count"));
      for (const row of counts) {
        itemCounts.set(String(row.sales_id), Number(row.item_count ?? 0));
      }
    }

    const mapped = salesRows
      .map((s: any) => {
        const details = parseSaleDetails(s.details);
        const isRefunded = s.status === "failed" || Boolean(details.refunded);
        const status = (isRefunded ? "refunded" : s.status || "completed") as
          | "completed"
          | "pending"
          | "failed"
          | "refunded";
        const totalAmount = Number(s.total_amount ?? 0);

        return {
          id: String(s.id),
          receiptNo: String(s.receipt_number || `INVP-${String(s.id).slice(0, 8)}`),
          customerName: String(s.customer_name || "Walk-in Customer"),
          customerPhone: s.customer_phone || undefined,
          cashierName: String(s.cashier_name || "Staff"),
          saleDate: String(s.date || s.created_at || new Date().toISOString()),
          totalAmount,
          amountPaid: Number(details.amountPaid ?? totalAmount),
          discount: Number(details.discountAmount ?? 0),
          tax: Number(details.taxAmount ?? 0),
          paymentMode: (s.payment_mode || "cash") as
            | "cash"
            | "momo"
            | "bank"
            | "cheque",
          status,
          itemCount: itemCounts.get(String(s.id)) ?? 0,
        };
      })
      .filter((item) => {
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        if (q) {
          return (
            item.receiptNo.toLowerCase().includes(q) ||
            item.customerName.toLowerCase().includes(q) ||
            item.cashierName.toLowerCase().includes(q)
          );
        }
        return true;
      });

    return NextResponse.json(mapped);
  });
}

export async function POST(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId, clientMutationId }) => {
    const body = await req.json().catch(() => ({}));
    const mutationId = extractClientMutationId(req, body) || clientMutationId;

    const result = await runWithIdempotency({
      tenantId,
      clientMutationId: mutationId,
      endpoint: "POST:/api/mobile/v1/sales",
      handler: async () => {
        const itemsInput: Array<{ productId: string; quantity: number }> =
          Array.isArray(body.items) ? body.items : [];
        if (itemsInput.length === 0) {
          throw new HttpStatusError(
            "At least one cart item is required to complete a sale.",
            400,
          );
        }

        const customerName =
          String(body.customerName || "Walk-in Customer").trim() ||
          "Walk-in Customer";
        const customerPhone = body.customerPhone
          ? String(body.customerPhone).trim()
          : "";
        const paymentMode = ["cash", "momo", "bank", "cheque"].includes(
          body.paymentMode,
        )
          ? String(body.paymentMode)
          : "cash";
        const discountInput = Math.max(0, Number(body.discountAmount ?? 0));
        const applyTax = Boolean(body.applyTax);
        const notes = body.notes ? String(body.notes).trim() : "";

        const store = await getTenantStoreProfile(tenantId, session);
        const nowIso = new Date().toISOString();
        const saleId = generateId();
        const receiptNo = `INVP-${Date.now().toString().slice(-8)}`;
        const eventsToPublish: SyncEventRecord[] = [];
        const lowStockAlerts: Array<{
          id: string;
          name: string;
          stock: number;
          threshold: number;
        }> = [];

        const trx = await db.transaction();
        try {
          // 1. Resolve or create customer within tenant
          let existingCustQuery = trx("customers")
            .where("tenant_id", tenantId)
            .whereRaw("LOWER(name) = ?", [customerName.toLowerCase()]);
          if (customerPhone) {
            existingCustQuery = existingCustQuery.andWhere(
              "phonenumber",
              customerPhone,
            );
          }
          const existingCust = await existingCustQuery.first("id");

          let customerId = "";
          let createdCust = false;
          if (existingCust?.id) {
            customerId = String(existingCust.id);
          } else {
            customerId = generateId();
            createdCust = true;
            await trx("customers").insert({
              id: customerId,
              tenant_id: tenantId,
              user_id: session.id,
              name: customerName,
              phonenumber: customerPhone || null,
              created_at: nowIso,
              updated_at: nowIso,
            });
          }

          // 2. Atomically decrement stock & compute server-authoritative totals
          let subtotal = 0;
          const saleItemsRows: any[] = [];

          for (const reqItem of itemsInput) {
            const productId = String(reqItem.productId ?? "").trim();
            const qty = Math.trunc(Number(reqItem.quantity ?? 0));
            if (!productId || !Number.isFinite(qty) || qty <= 0) {
              throw new HttpStatusError("Invalid item quantity in sale.", 400);
            }

            const affected = await trx("products")
              .where({ id: productId, tenant_id: tenantId })
              .andWhere("stock_quantity", ">=", qty)
              .update({
                stock_quantity: db.raw("stock_quantity - ?", [qty]),
                version: db.raw("COALESCE(version, 1) + 1"),
                updated_at: nowIso,
              });

            if (affected !== 1) {
              const prod = await trx("products")
                .where({ id: productId, tenant_id: tenantId })
                .first("name", "stock_quantity");
              if (!prod) {
                throw new HttpStatusError("Product not found in store.", 404);
              }
              throw new HttpStatusError(
                `Insufficient stock for ${prod.name}. Available: ${prod.stock_quantity}, requested: ${qty}.`,
                409,
              );
            }

            const prod = await trx("products")
              .where({ id: productId, tenant_id: tenantId })
              .first(
                "id",
                "name",
                "unit_price",
                "stock_quantity",
                "low_stock_threshold",
                "version",
              );

            const unitPrice = Number(prod.unit_price ?? 0);
            subtotal += qty * unitPrice;

            const remainingStock = Number(prod.stock_quantity ?? 0);
            const itemThreshold = Number(
              prod.low_stock_threshold ?? store.stockAlertThreshold ?? 5,
            );
            if (remainingStock <= itemThreshold) {
              lowStockAlerts.push({
                id: String(prod.id),
                name: String(prod.name),
                stock: remainingStock,
                threshold: itemThreshold,
              });
            }

            saleItemsRows.push({
              id: generateId(),
              tenant_id: tenantId,
              sales_id: saleId,
              product_id: productId,
              quantity: qty,
              unit_price: unitPrice,
              created_at: nowIso,
              updated_at: nowIso,
            });

            eventsToPublish.push(
              await insertSyncEvent(trx, {
                tenantId,
                entityType: "product",
                entityId: productId,
                action: "stock_delta",
                payload: {
                  delta: -qty,
                  stock_quantity: remainingStock,
                  version: Number(prod.version ?? 1),
                },
                actorUserId: session.id,
              }),
            );
          }

          const discountAmount = Math.min(subtotal, discountInput);
          const taxableBase = Math.max(0, subtotal - discountAmount);
          const taxRate = applyTax ? Number(store.taxRate ?? 0) : 0;
          const taxAmount = applyTax
            ? Math.round(taxableBase * taxRate * 100) / 100
            : 0;
          const totalAmount = Math.round((taxableBase + taxAmount) * 100) / 100;

          await trx("sales").insert({
            id: saleId,
            tenant_id: tenantId,
            customer_id: customerId,
            user_id: session.id,
            receipt_number: receiptNo,
            date: nowIso,
            details: JSON.stringify({
              subtotal,
              taxRate,
              taxAmount,
              discountAmount,
              amountPaid: totalAmount,
              notes,
              refunded: false,
            }),
            total_amount: totalAmount,
            payment_mode: paymentMode,
            status: "completed",
            created_at: nowIso,
            updated_at: nowIso,
          });

          await trx("sale_items").insert(saleItemsRows);

          if (createdCust) {
            eventsToPublish.push(
              await insertSyncEvent(trx, {
                tenantId,
                entityType: "customer",
                entityId: customerId,
                action: "upsert",
                actorUserId: session.id,
              }),
            );
          }

          eventsToPublish.push(
            await insertSyncEvent(trx, {
              tenantId,
              entityType: "sale",
              entityId: saleId,
              action: "upsert",
              payload: { receipt_number: receiptNo, total_amount: totalAmount },
              actorUserId: session.id,
            }),
          );

          await trx.commit();
        } catch (err) {
          await trx.rollback();
          throw err;
        }

        for (const evt of eventsToPublish) {
          publishSyncEvent(evt);
        }

        // Fire notifications outside tx safely
        for (const alert of lowStockAlerts) {
          const notifId = generateId();
          await db("notifications")
            .insert({
              id: notifId,
              tenant_id: tenantId,
              user_id: session.id,
              type: "product",
              title: `Low Stock: ${alert.name}`,
              message: `${alert.name} has reached ${alert.stock} units (threshold ${alert.threshold}).`,
              reference_type: "product_low_stock",
              reference_id: alert.id,
              is_read: 0,
              created_at: nowIso,
              updated_at: nowIso,
            })
            .catch(() => {});
        }

        const receipt = await getSaleReceiptDetailDto(tenantId, saleId, session);
        return {
          statusCode: 201,
          body: receipt,
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
