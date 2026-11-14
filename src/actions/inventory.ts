/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { InsertInventory, InventoryInfoView, Result } from "@/types/globals";
import { checkRole } from "@/utils/roles";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { generateId } from "@/utils/generator";
import { getCurrentUser } from "./_actions";

// ──────────────────────────────────────────────────────────────
// Read functions
// ──────────────────────────────────────────────────────────────

/**
 * Get all inventory records – uses v_inventory_product_details view.
 */
export async function getInventories(): Promise<Result<InventoryInfoView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) throw new Error("Unauthorized");


    const records = await db("v_inventory_product_details")
      .select("*")
      .orderBy("restock_date", "desc");

    return Result.ok(records);
  } catch (error: any) {
    console.error("Failed to fetch inventory:", error);
    return Result.fail(error?.message || "Failed to fetch inventory");
  }
}

/**
 * Get a single inventory record by ID.
 */
export async function getInventory(
  id: string,
): Promise<Result<InventoryInfoView>> {
  try {
    const record = await db("v_inventory_product_details")
      .select("*")
      .where("inventory_id", id)
      .first();

    if (!record) {
      return Result.fail("Inventory record not found");
    }

    return Result.ok(record);
  } catch (error: any) {
    console.error("Failed to fetch inventory item:", error);
    return Result.fail(error?.message || "Failed to fetch inventory item");
  }
}

// ──────────────────────────────────────────────────────────────
// Create / Update / Delete
// ──────────────────────────────────────────────────────────────

/**
 * Create a new inventory restock record.
 * - Must be admin.
 * - Updates the product's stock_quantity atomically (transaction).
 */
export async function createInventory(
  inventoryData: InsertInventory,
): Promise<Result<{ id: string }>> {
const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) throw new Error("Unauthorized");

    // Validate required fields
    if (
      !inventoryData.product_id ||
      !inventoryData.supplier_id ||
      !inventoryData.product_category_id
    ) {
      return Result.fail("Product, supplier, and category are required");
    }
    if (!inventoryData.quantity || inventoryData.quantity <= 0) {
      return Result.fail("Quantity must be greater than 0");
    }
    if (!inventoryData.restock_date) {
      return Result.fail("Restock date is required");
    }

    // Verify that product, supplier, and category exist
    const product = await db("products")
      .where("id", inventoryData.product_id)
      .first();
    if (!product) {
      return Result.fail("Product not found");
    }

    const supplier = await db("suppliers")
      .where("id", inventoryData.supplier_id)
      .first();
    if (!supplier) {
      return Result.fail("Supplier not found");
    }

    const category = await db("product_categories")
      .where("id", inventoryData.product_category_id)
      .first();
    if (!category) {
      return Result.fail("Category not found");
    }

    const newId = generateId();

    // Use transaction to keep inventory and product stock in sync
    const trx = await db.transaction();

    try {
      // 1. Insert inventory record
      await trx("inventory").insert({
        id: newId,
        user_id: userId,
        supplier_id: inventoryData.supplier_id,
        product_category_id: inventoryData.product_category_id,
        product_id: inventoryData.product_id,
        quantity: inventoryData.quantity,
        restock_date: inventoryData.restock_date,
      });

      // 2. Increment product stock
      await trx("products")
        .where("id", inventoryData.product_id)
        .increment("stock_quantity", inventoryData.quantity);

      await trx.commit();

      // Audit log
      await createAuditLog({
        entity_type: "inventory",
        entity_id: newId,
        action: "create",
        new_values: {
          product_id: inventoryData.product_id,
          supplier_id: inventoryData.supplier_id,
          category_id: inventoryData.product_category_id,
          quantity: inventoryData.quantity,
          restock_date: inventoryData.restock_date,
        },
      });

      // Activity log
      await createActivityLog({
        activity_type: "inventory_restock",
        title: `Inventory restock for ${product.name}`,
        description: `Added ${inventoryData.quantity} units from ${supplier.name}`,
        metadata: {
          inventory_id: newId,
          product_id: inventoryData.product_id,
          supplier_id: inventoryData.supplier_id,
          quantity: inventoryData.quantity,
        },
      });

      revalidatePath("/admin/inventory");
      revalidatePath(`/admin/product/${inventoryData.product_id}`);
      return Result.ok({ id: newId });
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error: any) {
    console.error("Failed to create inventory record:", error);
    return Result.fail(error?.message || "Failed to create inventory record");
  }
}

/**
 * Update an existing inventory record (e.g., adjust quantity, date, supplier).
 * Admin only. Does NOT affect product stock – only changes the record itself.
 */
export async function updateInventory(
  inventoryData: Partial<InsertInventory> & { id: string },
): Promise<Result<{ success: true }>> {
const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) throw new Error("Unauthorized");

    // Fetch current record
    const current = await db("inventory").where("id", inventoryData.id).first();
    if (!current) {
      return Result.fail("Inventory record not found");
    }

    // Build update object – only allowed fields
    const updateFields: any = {};
    if (inventoryData.quantity !== undefined) {
      if (inventoryData.quantity <= 0)
        return Result.fail("Quantity must be greater than 0");
      updateFields.quantity = inventoryData.quantity;
    }
    if (inventoryData.restock_date !== undefined)
      updateFields.restock_date = inventoryData.restock_date;
    if (inventoryData.supplier_id !== undefined) {
      // Verify supplier exists
      const supplier = await db("suppliers")
        .where("id", inventoryData.supplier_id)
        .first();
      if (!supplier) {
        return Result.fail("Supplier not found");
      }
      updateFields.supplier_id = inventoryData.supplier_id;
    }
    if (inventoryData.product_category_id !== undefined) {
      const category = await db("product_categories")
        .where("id", inventoryData.product_category_id)
        .first();
      if (!category) {
        return Result.fail("Category not found");
      }
      updateFields.product_category_id = inventoryData.product_category_id;
    }

    if (Object.keys(updateFields).length === 0) {
      return Result.fail("No fields to update");
    }

    const updatedCount = await db("inventory")
      .where("id", inventoryData.id)
      .update(updateFields);

    if (updatedCount === 0) {
      return Result.fail("Inventory record not found or no changes made");
    }

    // Audit log
    await createAuditLog({
      entity_type: "inventory",
      entity_id: inventoryData.id,
      action: "update",
      old_values: {
        quantity: current.quantity,
        restock_date: current.restock_date,
        supplier_id: current.supplier_id,
        product_category_id: current.product_category_id,
      },
      new_values: {
        quantity: updateFields.quantity ?? current.quantity,
        restock_date: updateFields.restock_date ?? current.restock_date,
        supplier_id: updateFields.supplier_id ?? current.supplier_id,
        product_category_id:
          updateFields.product_category_id ?? current.product_category_id,
      },
    });

    // Activity log
    await createActivityLog({
      activity_type: "inventory_updated",
      title: `Inventory record ${current.id} updated`,
      description: "Restock details modified",
      metadata: { inventory_id: inventoryData.id },
    });

    revalidatePath("/admin/inventory");
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to update inventory record:", error);
    return Result.fail(error?.message || "Failed to update inventory record");
  }
}

/**
 * Delete an inventory record – admin only.
 * Does NOT automatically adjust product stock.
 * (If you need to reverse a restock, use a separate adjustment function.)
 */
export async function removeInventoryItem(
  id: string,
): Promise<Result<{ success: true }>> {
const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const record = await db("inventory").where("id", id).first();
    if (!record) {
      return Result.fail("Inventory record not found");
    }

    const deletedCount = await db("inventory").where("id", id).del();
    if (deletedCount === 0) {
      return Result.fail("Inventory record not found");
    }

    // Audit log
    await createAuditLog({
      entity_type: "inventory",
      entity_id: id,
      action: "delete",
      old_values: {
        product_id: record.product_id,
        supplier_id: record.supplier_id,
        quantity: record.quantity,
        restock_date: record.restock_date,
      },
    });

    // Activity log
    await createActivityLog({
      activity_type: "inventory_deleted",
      title: `Inventory record ${record.id} deleted`,
      description: "Restock record removed",
      metadata: { inventory_id: id },
    });

    revalidatePath("/admin/inventory");
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete inventory record:", error);
    return Result.fail(error?.message || "Failed to delete inventory record");
  }
}

// ──────────────────────────────────────────────────────────────
// Bulk delete (optional) – admin only
// ──────────────────────────────────────────────────────────────

export async function removeInventoryItems(
  ids: string[],
): Promise<Result<{ deletedCount: number }>> {
const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const records = await db("inventory").whereIn("id", ids);
    if (records.length === 0) {
      return Result.fail("No inventory records found");
    }

    const deleted = await db("inventory").whereIn("id", ids).del();

    await createAuditLog({
      entity_type: "inventory",
      entity_id: ids.join(","),
      action: "delete",
      old_values: { ids },
    });

    await createActivityLog({
      activity_type: "inventory_deleted_bulk",
      title: `Bulk deletion of ${ids.length} inventory records`,
      description: "Multiple restock records removed",
      metadata: { ids },
    });

    revalidatePath("/admin/inventory");
    return Result.ok({ deletedCount: deleted });
  } catch (error: any) {
    console.error("Failed to delete inventory records:", error);
    return Result.fail(error?.message || "Failed to delete inventory records");
  }
}
