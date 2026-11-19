/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
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
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import {
  emitSyncEvent,
  insertSyncEvent,
  publishSyncEvent,
  type SyncEventRecord,
} from "@/lib/sync-bus";

export async function getSupplierTransactions(
  supplierId?: string,
): Promise<Result<SupplierTransactionView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    let query = db("v_supplier_transactions")
      .select("*")
      .where("tenant_id", tenantId)
      .orderBy("transaction_date", "desc");

    if (supplierId) {
      query = query.andWhere("supplier_id", supplierId);
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

export async function getSupplierTransactionDetails(
  id: string,
): Promise<Result<SupplierTransactionDetailView>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const transaction = await db("v_supplier_transactions")
      .where({ id, tenant_id: tenantId })
      .first();

    if (!transaction) {
      return Result.fail("Supplier transaction not found");
    }

    const items: SupplierTransactionItem[] = await db(
      "supplier_transaction_items",
    )
      .where({ supplier_transaction_id: id, tenant_id: tenantId })
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

export async function createSupplierTransaction(
  data: InsertSupplierTransaction,
): Promise<Result<{ id: string; transaction_no: string }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (!data.supplier_id) {
      return Result.fail("Supplier selection is required.");
    }

    if (!data.items || data.items.length === 0) {
      return Result.fail(
        "At least one product item is required for the transaction.",
      );
    }

    const supplier = await db("suppliers")
      .where({ id: data.supplier_id, tenant_id: tenantId })
      .first("id");
    if (!supplier) {
      return Result.fail("Supplier not found.");
    }

    const transactionId = generateId("stx");
    const transactionNo = `SUP-TXN-${Date.now().toString().slice(-6)}-${Math.floor(
      100 + Math.random() * 900,
    )}`;

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
    const nowIso = new Date().toISOString();

    const eventsToPublish: SyncEventRecord[] = [];
    const trx = await db.transaction();

    try {
      await trx("supplier_transactions").insert({
        id: transactionId,
        tenant_id: tenantId,
        transaction_no: transactionNo,
        supplier_id: data.supplier_id,
        delivered_by: data.delivered_by || null,
        transaction_date: transactionDate,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        balance,
        payment_mode: data.payment_mode || "cash",
        status: data.status || "completed",
        notes: data.notes || null,
        user_id: currentUser.id,
        created_at: nowIso,
        updated_at: nowIso,
      });

      for (const item of data.items) {
        const itemId = generateId("sti");
        const qty = Number(item.quantity) || 1;
        const lineTotal = item.total_price || qty * (item.unit_price || 0);

        await trx("supplier_transaction_items").insert({
          id: itemId,
          tenant_id: tenantId,
          supplier_transaction_id: transactionId,
          product_id: item.product_id || null,
          product_name: item.product_name,
          category_name: item.category_name || null,
          product_type: item.product_type || "boxes",
          quantity: qty,
          unit_price: item.unit_price || 0,
          total_price: lineTotal,
          created_at: nowIso,
          updated_at: nowIso,
        });

        if (item.product_id) {
          const updated = await trx("products")
            .where({ id: item.product_id, tenant_id: tenantId })
            .update({
              stock_quantity: db.raw("stock_quantity + ?", [qty]),
              version: db.raw("COALESCE(version, 1) + 1"),
              updated_at: nowIso,
            });

          if (updated === 1) {
            const refreshed = await trx("products")
              .select("stock_quantity", "version")
              .where({ id: item.product_id, tenant_id: tenantId })
              .first();

            eventsToPublish.push(
              await insertSyncEvent(trx, {
                tenantId,
                entityType: "product",
                entityId: item.product_id,
                action: "stock_delta",
                payload: {
                  delta: qty,
                  stock_quantity: Number(refreshed?.stock_quantity ?? 0),
                  version: Number(refreshed?.version ?? 1),
                },
                actorUserId: currentUser.id,
              }),
            );
          }
        }
      }

      eventsToPublish.push(
        await insertSyncEvent(trx, {
          tenantId,
          entityType: "supplier_transaction",
          entityId: transactionId,
          action: "upsert",
          actorUserId: currentUser.id,
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

    await createActivityLog({
      activity_type: "supplier_transaction_created",
      title: "Recorded Supplier Transaction",
      description: `Recorded supplier transaction ${transactionNo} with ${data.items.length} items (Total: GHS ${totalAmount.toFixed(2)})`,
      metadata: { transactionId, transactionNo, supplier_id: data.supplier_id },
    });

    await createAuditLog({
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
    });
  } catch (error: any) {
    console.error("Failed to create supplier transaction:", error);
    return Result.fail(
      "Failed to create supplier transaction: " + (error?.message || ""),
    );
  }
}

export async function deleteSupplierTransaction(
  id: string,
): Promise<Result<boolean>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const existing = await db("supplier_transactions")
      .where({ id, tenant_id: tenantId })
      .first();
    if (!existing) {
      return Result.fail("Transaction not found");
    }

    await db.transaction(async (trx) => {
      await trx("supplier_transaction_items")
        .where({ supplier_transaction_id: id, tenant_id: tenantId })
        .del();
      await trx("supplier_transactions")
        .where({ id, tenant_id: tenantId })
        .del();
    });

    revalidatePath("/admin/supplier");
    revalidatePath("/admin/supplier/transactions");
    await emitSyncEvent({
      tenantId,
      entityType: "supplier_transaction",
      entityId: id,
      action: "delete",
      actorUserId: currentUser.id,
    });

    return Result.ok(true);
  } catch (error: any) {
    console.error("Failed to delete supplier transaction:", error);
    return Result.fail(
      "Failed to delete supplier transaction: " + (error?.message || ""),
    );
  }
}

export async function getSupplierStats(supplierId: string): Promise<
  Result<{
    totalPurchases: number;
    totalSpent: number;
    productsSupplied: number;
    lastOrderDate: string | null;
  }>
> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const txns = await db("supplier_transactions")
      .where({ supplier_id: supplierId, tenant_id: tenantId })
      .orderBy("transaction_date", "desc");

    const totalPurchases = txns.length;
    const totalSpent = txns.reduce(
      (sum, t) => sum + (Number(t.total_amount) || 0),
      0,
    );
    const lastOrderDate = txns.length > 0 ? txns[0].transaction_date : null;

    const txnIds = txns.map((t) => t.id);
    const itemsCountRes =
      txnIds.length > 0
        ? await db("supplier_transaction_items")
            .where("tenant_id", tenantId)
            .whereIn("supplier_transaction_id", txnIds)
            .sum("quantity as totalQty")
            .first()
        : { totalQty: 0 };

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
