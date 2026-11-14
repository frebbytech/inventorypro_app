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
import { generateQrCode } from "@/lib/qrcode";
import { dateRangeType } from "@/lib/searchparams";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { createNotification } from "./notifications";
import { knex } from "knex";

// ──────────────────────────────────────────────────────────────
// 1. Sale Items (products sold in sales) – using v_sale_items_detail
// ──────────────────────────────────────────────────────────────

/**
 * Get all sale items (product sales) – can be filtered by user if needed.
 */
export async function getProductSales(): Promise<Result<any[]>> {
  try {
    const productSales = await db("v_sale_items_detail")
      .select("*")
      .orderBy("created_at", "desc");

    return Result.ok(productSales);
  } catch (error: any) {
    console.error("Failed to fetch product sales:", error);
    return Result.fail(error?.message || "Failed to fetch product sales");
  }
}

/**
 * Get a single sale item by its ID.
 */
export async function getProductSale(id: string): Promise<Result<any>> {
  try {
    const item = await db("v_sale_items_detail")
      .select("*")
      .where("sale_item_id", id)
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

/**
 * Get all sale items for a given sale ID.
 */
export async function getProductSaleBySaleID(
  saleId: string,
): Promise<Result<any[]>> {
  try {
    const items = await db("v_sale_items_detail")
      .select("*")
      .where("sale_id", saleId)
      .orderBy("created_at", "desc");

    return Result.ok(items);
  } catch (error: any) {
    console.error("Failed to fetch sale items by sale:", error);
    return Result.fail(error?.message || "Failed to fetch sale items");
  }
}

// ──────────────────────────────────────────────────────────────
// 2. Create Sale (with transaction)
// ──────────────────────────────────────────────────────────────

/**
 * Create a new sale with its items, update stock, and link to customer.
 * Uses a database transaction to maintain consistency.
 */
export async function createProductSales(
  sales: InsertSales,
  salesItems: CartItem[],
): Promise<Result<PaymentInfo>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) throw new Error("Unauthorized");

    // Validate data
    if (!sales.customer?.name) {
      return Result.fail("Customer name is required");
    }
    if (!salesItems || salesItems.length === 0) {
      return Result.fail("At least one product is required");
    }

    const lowStock = await db("settings")
      .select("stock_alert_threshold")
      .where("user_id", currentUser?.id)
      .first();

    // Start transaction
    const trx = await db.transaction();

    try {
      // 1. Upsert customer (find by name + phone if provided)
      let customerId: string;

      const existingCustomer = await trx("customers")
        .where("name", sales.customer.name)
        .andWhere((qb: any) => {
          if (sales.customer?.phonenumber) {
            qb.where("phonenumber", sales.customer.phonenumber);
          }
        })
        .first();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const newCustomerId = generateId();
        await trx("customers").insert({
          id: newCustomerId,
          user_id: currentUser?.id,
          name: sales.customer.name,
          phonenumber: sales.customer?.phonenumber || null,
        });
        customerId = newCustomerId;
      }
      const receiptNo = sales.receipt_number || `INVP-${Date.now()}`;

      // 2. Insert sale record
      const salesId = generateId();
      await trx("sales").insert({
        id: salesId,
        customer_id: customerId,
        user_id: currentUser?.id,
        receipt_number: receiptNo, // Generate a receipt number if not provided
        details: JSON.stringify(sales.details) || "",
        total_amount: sales.total_amount,
        payment_mode: sales.payment_mode || "cash",
        status: "completed",
      });

      // 3. Prepare sale items, update product stock, and check for low stock thresholds
      const lowStockAlerts: {
        id: string;
        name: string;
        remainingStock: number;
        threshold: number;
      }[] = [];

      // 3. Prepare sale items and update product stock
      const saleItemsData = await Promise.all(
        salesItems.map(async (item) => {
          await trx("products")
            .where("id", item.id)
            .decrement("stock_quantity", item.quantity);

          const updatedProduct = await trx("products")
            .select("id", "name", "stock_quantity")
            .where("id", item.id)
            .first();

          if (updatedProduct) {
            const threshold = lowStock?.stock_alert_threshold ?? 5;
            if (updatedProduct.stock_quantity <= threshold) {
              lowStockAlerts.push({
                id: updatedProduct.id,
                name: updatedProduct.name,
                remainingStock: updatedProduct.stock_quantity,
                threshold,
              });
            }
          }

          return {
            id: generateId(),
            sales_id: salesId,
            product_id: item.id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          };
        }),
      );

      await trx("sale_items").insert(saleItemsData);
      await trx.commit();

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

      // ── Logs and notifications ──
      // Audit log
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

      // Activity log
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

      // ✅ Notification for the user who created the sale (or the admin)
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
        // Non‑critical – do not fail the transaction
      }

      // Build receipt
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
        attendantName: currentUser?.fullname||currentUser?.username,
      };

      // const result = await generateQrCode(`/checkout/${receiptNo}`);
      // if (result.success && result.qrCode) {
      //   receipt.qrcode = result.qrCode;
      // }

      revalidatePath("/sales");
      revalidatePath("/admin/sales");

      return Result.ok(receipt);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error: any) {
    console.error("Failed to create sale:", error);
    return Result.fail(error?.message || "Failed to create sale");
  }
}

// ──────────────────────────────────────────────────────────────
// 3. Delete Sale (and cascade to sale_items)
// ──────────────────────────────────────────────────────────────

export async function removeProductSales(
  id: string,
): Promise<Result<{ success: true }>> {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) throw new Error("Unauthorized");

    // Fetch sale for audit and notification
    const sale = await db("sales").where("id", id).first();
    if (!sale) {
      return Result.fail("Sale not found");
    }

    // Optional: check role or ownership
    // if (!checkRole("admin") && sale.user_id !== userId) {
    //   return Result.fail("Not authorized");
    // }

    const deletedCount = await db("sales").where("id", id).del();
    if (deletedCount === 0) {
      return Result.fail("Sale not found");
    }

    // Audit log
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

    // Activity log
    await createActivityLog({
      activity_type: "sale_deleted",
      title: `Sale ${id} deleted`,
      description: "Sale record removed",
      metadata: { sale_id: id },
    });

    // ✅ Notification for the user who performed the deletion
    try {
      await createNotification({
        user_id: userId,
        type: "sale",
        title: `Sale #${id.slice(0, 8)} Deleted`,
        message: `The sale to ${sale.customer_name || "customer"} was permanently removed.`,
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
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete sale:", error);
    return Result.fail(error?.message || "Failed to delete sale");
  }
}

// ──────────────────────────────────────────────────────────────
// 4. Customer Sales (aggregated from v_sale_summary)
// ──────────────────────────────────────────────────────────────

/**
 * Get all sales (summary view) – can be filtered by user.
 */
export async function getCustomerSales(): Promise<Result<any[]>> {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) throw new Error("Unauthorized");

    const query = db("v_sale_summary").select("*").orderBy("sale_date", "desc");

    // Optional: restrict to own sales if not admin
    // if (!checkRole("admin")) {
    //   query.where("user_id", userId);
    // }

    const sales = await query;
    return Result.ok(sales);
  } catch (error: any) {
    console.error("Failed to fetch customer sales:", error);
    return Result.fail(error?.message || "Failed to fetch customer sales");
  }
}

/**
 * Get sales summary within a date range (for reporting).
 * Only returns completed sales.
 */
export async function getSalesSummary(): Promise<Result<SaleSummaryView[]>> {
  // date: dateRangeType,
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new Error("Unauthorized");

  const isAdmin = await checkRole("admin");
  // console.log(date)

  try {
    // const fromDate = date.from
    //   ? format(date.from, "yyyy-MM-dd")
    //   : format(new Date(), "yyyy-MM-dd");
    // const toDate = date.to
    //   ? format(date.to, "yyyy-MM-dd")
    //   : format(new Date(), "yyyy-MM-dd");

    const query = db("v_sale_summary").select("*");

    if (isAdmin) {
      query
        .where("status", "completed")
        // .andWhereRaw("DATE(sale_date) BETWEEN ? AND ?", [fromDate, toDate])
        .orderBy("sale_date", "desc");
    } else {
      query
        .where({
          user_id: currentUser?.id,
          status: "completed",
        })
        // .andWhereRaw("DATE(sale_date) BETWEEN ? AND ?", [fromDate, toDate])
        .orderBy("sale_date", "desc");
    }

    const sales = await query;

    return Result.ok(sales);
  } catch (error: any) {
    console.error("Failed to fetch sales summary:", error);
    return Result.fail(error?.message || "Failed to fetch sales summary");
  }
}

/**
 * Get a single sale summary by ID.
 */
export async function getCustomerSale(id: string): Promise<Result<any>> {
  try {
    const sale = await db("v_sale_summary")
      .select("*")
      .where("sale_id", id)
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

/**
 * Get all sales for a specific customer ID.
 */
export async function getCustomerSaleByCustomerID(
  customerId: string,
): Promise<Result<any[]>> {
  try {
    const sales = await db("v_sale_summary")
      .select("*")
      .where("customer_id", customerId)
      .orderBy("sale_date", "desc");

    return Result.ok(sales);
  } catch (error: any) {
    console.error("Failed to fetch sales for customer:", error);
    return Result.fail(error?.message || "Failed to fetch customer sales");
  }
}
/**
 * Get all sales for a specific customer ID.
 */
export async function getEmployeeSales(
  id: string,
): Promise<Result<EmployeeSale[]>> {
  try {
    const sales = await db("v_sale_summary")
      .select("*")
      .where("user_id", id)
      .orderBy("sale_date", "desc");

    // console.log(sales)

    return Result.ok(sales);
  } catch (error: any) {
    console.error("Failed to fetch sales for customer:", error);
    return Result.fail(error?.message || "Failed to fetch customer sales");
  }
}

export async function getSalesItemsBySalesId(
  id: string,
): Promise<Result<SaleItem[]>> {
  try {
    const item = await db("v_sale_items_detail")
      .select("*")
      .where("sale_id", id);

    if (!item) {
      return Result.fail("Sale items not found");
    }

    return Result.ok(item);
  } catch (error: any) {
    console.error("Failed to fetch sale item:", error);
    return Result.fail(error?.message || "Failed to fetch sale item");
  }
}
