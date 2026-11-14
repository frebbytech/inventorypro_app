/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
// import { ensureFullDatabaseSchema } from "@/lib/db-init";
import {
  InsertSupplierTransaction,
  Result,
  SupplierTransactionDetailView,
  SupplierTransactionItem,
  SupplierTransactionView,
} from "@/types/globals";
import { revalidatePath } from "next/cache";
import { createActivityLog } from "./activity-logs";
import { createAuditLog } from "./audit-logs";
import { getCurrentUser } from "./_actions";
import { generateId } from "@/utils/generator";

/**
 * Get supplier transactions (optionally filtered by supplierId)
 */
export async function getSupplierTransactions(
  supplierId?: string,
): Promise<Result<SupplierTransactionView[]>> {
  try {
    // await ensureFullDatabaseSchema();
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) throw new Error("Unauthorized");

    let query = db("v_supplier_transactions")
      .select("*")
      .orderBy("transaction_date", "desc");

    if (supplierId) {
      query = query.where("supplier_id", supplierId);
    }

    const transactions = await query;
    return Result.ok(transactions);
  } catch (error: any) {
    console.error("Failed to fetch supplier transactions:", error);
    return Result.fail(
      "Failed to fetch supplier transactions: " + (error?.message || ""),
    );
  }
}

/**
 * Get detailed information for a single supplier transaction including items
 */
export async function getSupplierTransactionDetails(
  id: string,
): Promise<Result<SupplierTransactionDetailView>> {
  try {
    // await ensureFullDatabaseSchema();
    const transaction = await db("v_supplier_transactions")
      .where("id", id)
      .first();

    if (!transaction) {
      return Result.fail("Supplier transaction not found");
    }

    const items: SupplierTransactionItem[] = await db(
      "supplier_transaction_items",
    )
      .where("supplier_transaction_id", id)
      .orderBy("created_at", "asc");

    return Result.ok({
      ...transaction,
      items,
    });
  } catch (error: any) {
    console.error("Failed to fetch supplier transaction details:", error);
    return Result.fail(
      "Failed to fetch transaction details: " + (error?.message || ""),
    );
  }
}

/**
 * Create a new supplier transaction with item details
 */
export async function createSupplierTransaction(
  data: InsertSupplierTransaction,
): Promise<Result<{ id: string; transaction_no: string }>> {
  try {
    // await ensureFullDatabaseSchema();
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) throw new Error("Unauthorized");

    if (!data.supplier_id) {
      return Result.fail("Supplier selection is required.");
    }

    if (!data.items || data.items.length === 0) {
      return Result.fail(
        "At least one product item is required for the transaction.",
      );
    }

    const transactionId = generateId("stx");
    const transactionNo = `SUP-TXN-${Date.now().toString().slice(-6)}-${Math.floor(
      100 + Math.random() * 900,
    )}`;

    // Calculate totals
    const calculatedTotal = data.items.reduce((acc, item) => {
      const lineTotal =
        item.total_price || (item.quantity || 1) * (item.unit_price || 0);
      return acc + lineTotal;
    }, 0);

    const totalAmount =
      data.total_amount && data.total_amount > 0
        ? data.total_amount
        : calculatedTotal;
    const amountPaid =
      data.amount_paid !== undefined ? Number(data.amount_paid) : totalAmount;
    const balance = totalAmount - amountPaid;

    const transactionDate = data.transaction_date
      ? new Date(data.transaction_date).toISOString()
      : new Date().toISOString();

    // Insert transaction master record
    await db("supplier_transactions").insert({
      id: transactionId,
      transaction_no: transactionNo,
      supplier_id: data.supplier_id,
      delivered_by: data.delivered_by || null,
      transaction_date: transactionDate,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      balance: balance,
      payment_mode: data.payment_mode || "cash",
      status: data.status || "completed",
      notes: data.notes || null,
      user_id: currentUser.id,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    // Insert item details
    for (const item of data.items) {
      const itemId = generateId("sti");
      const lineTotal =
        item.total_price || (item.quantity || 1) * (item.unit_price || 0);

      await db("supplier_transaction_items").insert({
        id: itemId,
        supplier_transaction_id: transactionId,
        product_id: item.product_id || null,
        product_name: item.product_name,
        category_name: item.category_name || null,
        product_type: item.product_type || "boxes",
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total_price: lineTotal,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      // Optional: If product_id matches an existing product in stock, increment stock quantity
      if (item.product_id) {
        try {
          await db("products")
            .where("id", item.product_id)
            .increment("stock_quantity", item.quantity || 1);
        } catch (e) {
          console.warn(
            "Failed to update stock quantity for product:",
            item.product_id,
            e,
          );
        }
      }
    }

    // Activity & Audit logging
    await createActivityLog({
      activity_type: "supplier_transaction_created",
      title: "Recorded Supplier Transaction",
      description: `Recorded supplier transaction ${transactionNo} with ${data.items.length} items (Total: GHS ${totalAmount.toFixed(2)})`,
      metadata: { transactionId, transactionNo, supplier_id: data.supplier_id },
    });

    await createAuditLog({
      // user_id: currentUser.id,
      action: "update",
      entity_type: "supplier_transaction",
      entity_id: transactionId,
      new_values: {
        transactionNo,
        supplier_id: data.supplier_id,
        totalAmount,
        itemsCount: data.items.length,
      },
    });

    revalidatePath("/admin/supplier");
    revalidatePath(`/admin/supplier/${data.supplier_id}`);
    revalidatePath("/admin/supplier/transactions");

    return Result.ok({
      id: transactionId,
      transaction_no: transactionNo,
      message: "Supplier transaction recorded successfully.",
    });
  } catch (error: any) {
    console.error("Failed to create supplier transaction:", error);
    return Result.fail(
      "Failed to create supplier transaction: " + (error?.message || ""),
    );
  }
}

/**
 * Delete a supplier transaction
 */
export async function deleteSupplierTransaction(
  id: string,
): Promise<Result<boolean>> {
  try {
    // await ensureFullDatabaseSchema();
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) throw new Error("Unauthorized");

    const existing = await db("supplier_transactions").where("id", id).first();
    if (!existing) {
      return Result.fail("Transaction not found");
    }

    await db("supplier_transaction_items")
      .where("supplier_transaction_id", id)
      .del();
    await db("supplier_transactions").where("id", id).del();

    revalidatePath("/admin/supplier");
    revalidatePath("/admin/supplier/transactions");

    return Result.ok(true);
  } catch (error: any) {
    console.error("Failed to delete supplier transaction:", error);
    return Result.fail(
      "Failed to delete supplier transaction: " + (error?.message || ""),
    );
  }
}

/**
 * Get aggregated supplier statistics
 */
export async function getSupplierStats(supplierId: string): Promise<
  Result<{
    totalPurchases: number;
    totalSpent: number;
    productsSupplied: number;
    lastOrderDate: string | null;
  }>
> {
  try {
    // await ensureFullDatabaseSchema();

    const txns = await db("supplier_transactions")
      .where("supplier_id", supplierId)
      .orderBy("transaction_date", "desc");

    const totalPurchases = txns.length;
    const totalSpent = txns.reduce(
      (sum, t) => sum + (Number(t.total_amount) || 0),
      0,
    );
    const lastOrderDate = txns.length > 0 ? txns[0].transaction_date : null;

    // Count unique items supplied
    const itemsCountRes = await db("supplier_transaction_items")
      .whereIn(
        "supplier_transaction_id",
        txns.map((t) => t.id),
      )
      .sum("quantity as totalQty")
      .first();

    const productsSupplied = Number(itemsCountRes?.totalQty) || 0;

    return Result.ok({
      totalPurchases,
      totalSpent,
      productsSupplied,
      lastOrderDate,
    });
  } catch (error: any) {
    console.error("Failed to fetch supplier stats:", error);
    return Result.ok({
      totalPurchases: 0,
      totalSpent: 0,
      productsSupplied: 0,
      lastOrderDate: null,
    });
  }
}
