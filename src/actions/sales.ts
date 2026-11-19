/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import {
  CartItem,
  EmployeeSale,
  InsertSales,
  PaymentInfo,
  Result,
  SaleItem,
  SaleSummaryView,
} from "@/types/globals";
import { currencyFormatter } from "@/config/formatter";
import { getCurrentUser } from "./_actions";
import { generateId } from "@/utils/generator";
import { checkRole } from "@/utils/roles";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { createNotification } from "./notifications";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import {
  emitSyncEvent,
  insertSyncEvent,
  publishSyncEvent,
  type SyncEventRecord,
} from "@/lib/sync-bus";

// ──────────────────────────────────────────────────────────────
// 1. Sale Items (tenant-scoped)
// ──────────────────────────────────────────────────────────────

export async function getProductSales(): Promise<Result<any[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const productSales = await db("v_sale_items_detail")
      .select("*")
      .where("tenant_id", tenantId)
      .orderBy("created_at", "desc");

    return Result.ok(productSales);
  } catch (error: any) {
    console.error("Failed to fetch product sales:", error);
    return Result.fail(error?.message || "Failed to fetch product sales");
  }
}

export async function getProductSale(id: string): Promise<Result<any>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const item = await db("v_sale_items_detail")
      .select("*")
      .where({ sale_item_id: id, tenant_id: tenantId })
      .first();

    if (!item) {
      return Result.fail("Sale item not found");
    }

    return Result.ok(item);
  } catch (error: any) {
    console.error("Failed to fetch sale item:", error);
    return Result.fail(error?.message || "Failed to fetch sale item");
  }
}

export async function getProductSaleBySaleID(
  saleId: string,
): Promise<Result<any[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const items = await db("v_sale_items_detail")
      .select("*")
      .where({ sale_id: saleId, tenant_id: tenantId })
      .orderBy("created_at", "desc");

    return Result.ok(items);
  } catch (error: any) {
    console.error("Failed to fetch sale items by sale:", error);
    return Result.fail(error?.message || "Failed to fetch sale items");
  }
}

// ──────────────────────────────────────────────────────────────
// 2. Create Sale (server-authoritative with atomic stock deltas)
// ──────────────────────────────────────────────────────────────

export async function createProductSales(
  sales: InsertSales,
  salesItems: CartItem[],
): Promise<Result<PaymentInfo>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (!sales.customer?.name) {
      return Result.fail("Customer name is required");
    }
    if (!salesItems || salesItems.length === 0) {
      return Result.fail("At least one product is required");
    }

    const lowStock = await db("settings")
      .select("stock_alert_threshold")
      .where("tenant_id", tenantId)
      .first();

    const threshold = Number(lowStock?.stock_alert_threshold ?? 5);
    const nowIso = new Date().toISOString();
    const eventsToPublish: SyncEventRecord[] = [];
    const lowStockAlerts: {
      id: string;
      name: string;
      remainingStock: number;
      threshold: number;
    }[] = [];

    const trx = await db.transaction();
    let salesId = "";
    let receiptNo = "";
    let customerId = "";

    try {
      // 1. Upsert customer within tenant
      const existingCustomer = await trx("customers")
        .where({ tenant_id: tenantId, name: sales.customer.name })
        .andWhere((qb: any) => {
          if (sales.customer?.phonenumber) {
            qb.where("phonenumber", sales.customer.phonenumber);
          }
        })
        .first();

      let createdNewCustomer = false;
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        customerId = generateId();
        createdNewCustomer = true;
        await trx("customers").insert({
          id: customerId,
          tenant_id: tenantId,
          user_id: currentUser.id,
          name: sales.customer.name,
          phonenumber: sales.customer?.phonenumber || null,
        });
      }

      receiptNo = sales.receipt_number || `INVP-${Date.now()}`;
      salesId = generateId();

      // 2. Insert sale record
      await trx("sales").insert({
        id: salesId,
        tenant_id: tenantId,
        customer_id: customerId,
        user_id: currentUser.id,
        receipt_number: receiptNo,
        details: JSON.stringify(sales.details ?? "") || "",
        total_amount: sales.total_amount,
        payment_mode: sales.payment_mode || "cash",
        status: "completed",
      });

      // 3. Atomically decrement stock (enforcing stock_quantity >= item.quantity) & bump product version
      const saleItemsData: any[] = [];

      for (const item of salesItems) {
        const qty = Number(item.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error(`Invalid quantity for product "${item.name}".`);
        }

        const updatedRows = await trx("products")
          .where({ id: item.id, tenant_id: tenantId })
          .andWhere("stock_quantity", ">=", qty)
          .update({
            stock_quantity: db.raw("stock_quantity - ?", [qty]),
            version: db.raw("COALESCE(version, 1) + 1"),
            updated_at: nowIso,
          });

        if (updatedRows !== 1) {
          const prod = await trx("products")
            .select("name", "stock_quantity")
            .where({ id: item.id, tenant_id: tenantId })
            .first();

          if (!prod) {
            throw new Error(`Product "${item.name}" was not found in this store.`);
          }
          throw new Error(
            `Insufficient stock for ${prod.name}. Available: ${prod.stock_quantity}, requested: ${qty}.`,
          );
        }

        const updatedProduct = await trx("products")
          .select("id", "name", "stock_quantity", "version")
          .where({ id: item.id, tenant_id: tenantId })
          .first();

        if (updatedProduct) {
          const remainingStock = Number(updatedProduct.stock_quantity ?? 0);
          if (remainingStock <= threshold) {
            lowStockAlerts.push({
              id: updatedProduct.id,
              name: updatedProduct.name,
              remainingStock,
              threshold,
            });
          }

          const deltaEvt = await insertSyncEvent(trx, {
            tenantId,
            entityType: "product",
            entityId: updatedProduct.id,
            action: "stock_delta",
            payload: {
              delta: -qty,
              stock_quantity: remainingStock,
              version: Number(updatedProduct.version ?? 1),
            },
            actorUserId: currentUser.id,
          });
          eventsToPublish.push(deltaEvt);
        }

        saleItemsData.push({
          id: generateId(),
          tenant_id: tenantId,
          sales_id: salesId,
          product_id: item.id,
          quantity: qty,
          unit_price: item.unit_price,
        });
      }

      await trx("sale_items").insert(saleItemsData);

      if (createdNewCustomer) {
        eventsToPublish.push(
          await insertSyncEvent(trx, {
            tenantId,
            entityType: "customer",
            entityId: customerId,
            action: "upsert",
            actorUserId: currentUser.id,
          }),
        );
      }

      eventsToPublish.push(
        await insertSyncEvent(trx, {
          tenantId,
          entityType: "sale",
          entityId: salesId,
          action: "upsert",
          payload: {
            receipt_number: receiptNo,
            total_amount: sales.total_amount,
          },
          actorUserId: currentUser.id,
        }),
      );

      await trx.commit();
    } catch (error) {
      await trx.rollback();
      throw error;
    }

    for (const evt of eventsToPublish) {
      publishSyncEvent(evt);
    }

    // Low stock notifications
    for (const alert of lowStockAlerts) {
      try {
        await createNotification({
          user_id: currentUser.id,
          type: "product",
          title: `Low Stock: ${alert.name}`,
          message: `${alert.name} has reached ${alert.remainingStock} remaining items (Threshold: ${alert.threshold}).`,
          reference_type: "product_low_stock",
          reference_id: alert.id,
        });
      } catch (e) {
        console.error("Failed to create stock notification:", e);
      }
    }

    await createAuditLog({
      entity_type: "sale",
      entity_id: salesId,
      action: "create",
      new_values: {
        customer_id: customerId,
        total_amount: sales.total_amount,
        payment_mode: sales.payment_mode,
        item_count: salesItems.length,
      },
    });

    await createActivityLog({
      activity_type: "sale_created",
      title: `Sale to ${sales.customer.name}`,
      description: `Sold ${salesItems.length} products worth ${currencyFormatter(
        sales.total_amount,
      )}`,
      metadata: {
        sale_id: salesId,
        customer_id: customerId,
        total_amount: sales.total_amount,
      },
    });

    try {
      await createNotification({
        user_id: currentUser.id,
        type: "sale",
        title: `New Sale #${salesId.slice(0, 8)}`,
        message: `You sold ${salesItems.length} items to ${sales.customer.name} for ${currencyFormatter(sales.total_amount)}.`,
        reference_type: "sale_created",
        reference_id: salesId,
      });
    } catch (notifError) {
      console.error("Failed to create notification for sale:", notifError);
    }

    const receipt: PaymentInfo = {
      transactionId: salesId,
      customer: sales.customer,
      receipt_number: receiptNo,
      date: new Date(),
      totalAmount: sales.total_amount,
      amountPaid: sales.total_amount,
      balance: 0,
      products: salesItems,
      paymentMode: sales.payment_mode || "cash",
      lowStockAlerts: lowStockAlerts.length > 0 ? lowStockAlerts : undefined,
      qrcode: "",
      attendantName: currentUser?.fullname || currentUser?.username,
    };

    revalidatePath("/sales");
    revalidatePath("/admin/sales");

    return Result.ok(receipt);
  } catch (error: any) {
    console.error("Failed to create sale:", error);
    return Result.fail(error?.message || "Failed to create sale");
  }
}

// ──────────────────────────────────────────────────────────────
// 3. Delete Sale (tenant-scoped)
// ──────────────────────────────────────────────────────────────

export async function removeProductSales(
  id: string,
): Promise<Result<{ success: true }>> {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const sale = await db("sales").where({ id, tenant_id: tenantId }).first();
    if (!sale) {
      return Result.fail("Sale not found");
    }

    const deletedCount = await db("sales")
      .where({ id, tenant_id: tenantId })
      .del();
    if (deletedCount === 0) {
      return Result.fail("Sale not found");
    }

    await createAuditLog({
      entity_type: "sale",
      entity_id: id,
      action: "delete",
      old_values: {
        customer_id: sale.customer_id,
        total_amount: sale.total_amount,
        date: sale.date,
      },
    });

    await createActivityLog({
      activity_type: "sale_deleted",
      title: `Sale ${id} deleted`,
      description: "Sale record removed",
      metadata: { sale_id: id },
    });

    try {
      await createNotification({
        user_id: userId,
        type: "sale",
        title: `Sale #${id.slice(0, 8)} Deleted`,
        message: `The sale record was permanently removed.`,
        reference_type: "sale_deleted",
        reference_id: id,
      });
    } catch (notifError) {
      console.error(
        "Failed to create notification for sale deletion:",
        notifError,
      );
    }

    revalidatePath("/sales");
    revalidatePath("/admin/sales");
    await emitSyncEvent({
      tenantId,
      entityType: "sale",
      entityId: id,
      action: "delete",
      actorUserId: userId,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete sale:", error);
    return Result.fail(error?.message || "Failed to delete sale");
  }
}

// ──────────────────────────────────────────────────────────────
// 4. Customer Sales (tenant-scoped)
// ──────────────────────────────────────────────────────────────

export async function getCustomerSales(): Promise<Result<any[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const sales = await db("v_sale_summary")
      .select("*")
      .where("tenant_id", tenantId)
      .orderBy("sale_date", "desc");

    return Result.ok(sales);
  } catch (error: any) {
    console.error("Failed to fetch customer sales:", error);
    return Result.fail(error?.message || "Failed to fetch customer sales");
  }
}

export async function getSalesSummary(): Promise<Result<SaleSummaryView[]>> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) return Result.fail("Unauthorized");
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  const isAdmin = await checkRole("admin");

  try {
    const query = db("v_sale_summary")
      .select("*")
      .where("tenant_id", tenantId)
      .andWhere("status", "completed")
      .orderBy("sale_date", "desc");

    if (!isAdmin) {
      query.andWhere("user_id", currentUser.id);
    }

    const sales = await query;
    return Result.ok(sales);
  } catch (error: any) {
    console.error("Failed to fetch sales summary:", error);
    return Result.fail(error?.message || "Failed to fetch sales summary");
  }
}

export async function getCustomerSale(id: string): Promise<Result<any>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const sale = await db("v_sale_summary")
      .select("*")
      .where({ sale_id: id, tenant_id: tenantId })
      .first();

    if (!sale) {
      return Result.fail("Sale not found");
    }

    return Result.ok(sale);
  } catch (error: any) {
    console.error("Failed to fetch customer sale:", error);
    return Result.fail(error?.message || "Failed to fetch customer sale");
  }
}

export async function getCustomerSaleByCustomerID(
  customerId: string,
): Promise<Result<any[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const sales = await db("v_sale_summary")
      .select("*")
      .where({ customer_id: customerId, tenant_id: tenantId })
      .orderBy("sale_date", "desc");

    return Result.ok(sales);
  } catch (error: any) {
    console.error("Failed to fetch sales for customer:", error);
    return Result.fail(error?.message || "Failed to fetch customer sales");
  }
}

export async function getEmployeeSales(
  id: string,
): Promise<Result<EmployeeSale[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const sales = await db("v_sale_summary")
      .select("*")
      .where({ user_id: id, tenant_id: tenantId })
      .orderBy("sale_date", "desc");

    return Result.ok(sales);
  } catch (error: any) {
    console.error("Failed to fetch employee sales:", error);
    return Result.fail(error?.message || "Failed to fetch employee sales");
  }
}

export async function getSalesItemsBySalesId(
  id: string,
): Promise<Result<SaleItem[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const item = await db("v_sale_items_detail")
      .select("*")
      .where({ sale_id: id, tenant_id: tenantId });

    if (!item) {
      return Result.fail("Sale items not found");
    }

    return Result.ok(item);
  } catch (error: any) {
    console.error("Failed to fetch sale item:", error);
    return Result.fail(error?.message || "Failed to fetch sale item");
  }
}
