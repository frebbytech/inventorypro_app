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
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import {
  emitSyncEvent,
  insertSyncEvent,
  publishSyncEvent,
  type SyncEventRecord,
} from "@/lib/sync-bus";

// ──────────────────────────────────────────────────────────────
// Read functions (tenant-scoped)
// ──────────────────────────────────────────────────────────────

export async function getInventories(): Promise<Result<InventoryInfoView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const records = await db("v_inventory_product_details")
      .select("*")
      .where("tenant_id", tenantId)
      .orderBy("restock_date", "desc");

    return Result.ok(records);
  } catch (error: any) {
    console.error("Failed to fetch inventory:", error);
    return Result.fail(error?.message || "Failed to fetch inventory");
  }
}

export async function getInventory(
  id: string,
): Promise<Result<InventoryInfoView>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const record = await db("v_inventory_product_details")
      .select("*")
      .where({ inventory_id: id, tenant_id: tenantId })
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
// Create / Update / Delete (tenant-scoped + atomic stock delta)
// ──────────────────────────────────────────────────────────────

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
    if (!userId) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (
      !inventoryData.product_id ||
      !inventoryData.supplier_id ||
      !inventoryData.product_category_id
    ) {
      return Result.fail("Product, supplier, and category are required");
    }
    const qty = Number(inventoryData.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return Result.fail("Quantity must be greater than 0");
    }
    if (!inventoryData.restock_date) {
      return Result.fail("Restock date is required");
    }

    const product = await db("products")
      .where({ id: inventoryData.product_id, tenant_id: tenantId })
      .first();
    if (!product) {
      return Result.fail("Product not found");
    }

    const supplier = await db("suppliers")
      .where({ id: inventoryData.supplier_id, tenant_id: tenantId })
      .first();
    if (!supplier) {
      return Result.fail("Supplier not found");
    }

    const category = await db("product_categories")
      .where({ id: inventoryData.product_category_id, tenant_id: tenantId })
      .first();
    if (!category) {
      return Result.fail("Category not found");
    }

    const newId = generateId();
    const nowIso = new Date().toISOString();
    const eventsToPublish: SyncEventRecord[] = [];
    const trx = await db.transaction();

    try {
      await trx("inventory").insert({
        id: newId,
        tenant_id: tenantId,
        user_id: userId,
        supplier_id: inventoryData.supplier_id,
        product_category_id: inventoryData.product_category_id,
        product_id: inventoryData.product_id,
        quantity: qty,
        restock_date: inventoryData.restock_date,
      });

      await trx("products")
        .where({ id: inventoryData.product_id, tenant_id: tenantId })
        .update({
          stock_quantity: db.raw("stock_quantity + ?", [qty]),
          version: db.raw("COALESCE(version, 1) + 1"),
          updated_at: nowIso,
        });

      const refreshed = await trx("products")
        .select("stock_quantity", "version")
        .where({ id: inventoryData.product_id, tenant_id: tenantId })
        .first();

      eventsToPublish.push(
        await insertSyncEvent(trx, {
          tenantId,
          entityType: "inventory",
          entityId: newId,
          action: "upsert",
          actorUserId: userId,
        }),
      );

      eventsToPublish.push(
        await insertSyncEvent(trx, {
          tenantId,
          entityType: "product",
          entityId: inventoryData.product_id,
          action: "stock_delta",
          payload: {
            delta: qty,
            stock_quantity: Number(refreshed?.stock_quantity ?? 0),
            version: Number(refreshed?.version ?? 1),
          },
          actorUserId: userId,
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

    await createAuditLog({
      entity_type: "inventory",
      entity_id: newId,
      action: "create",
      new_values: {
        product_id: inventoryData.product_id,
        supplier_id: inventoryData.supplier_id,
        category_id: inventoryData.product_category_id,
        quantity: qty,
        restock_date: inventoryData.restock_date,
      },
    });

    await createActivityLog({
      activity_type: "inventory_restock",
      title: `Inventory restock for ${product.name}`,
      description: `Added ${qty} units from ${supplier.name}`,
      metadata: {
        inventory_id: newId,
        product_id: inventoryData.product_id,
        supplier_id: inventoryData.supplier_id,
        quantity: qty,
      },
    });

    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/product/${inventoryData.product_id}`);
    return Result.ok({ id: newId });
  } catch (error: any) {
    console.error("Failed to create inventory record:", error);
    return Result.fail(error?.message || "Failed to create inventory record");
  }
}

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
    if (!userId) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const current = await db("inventory")
      .where({ id: inventoryData.id, tenant_id: tenantId })
      .first();
    if (!current) {
      return Result.fail("Inventory record not found");
    }

    const updateFields: any = {};
    if (inventoryData.quantity !== undefined) {
      if (inventoryData.quantity <= 0)
        return Result.fail("Quantity must be greater than 0");
      updateFields.quantity = inventoryData.quantity;
    }
    if (inventoryData.restock_date !== undefined)
      updateFields.restock_date = inventoryData.restock_date;
    if (inventoryData.supplier_id !== undefined) {
      const supplier = await db("suppliers")
        .where({ id: inventoryData.supplier_id, tenant_id: tenantId })
        .first();
      if (!supplier) {
        return Result.fail("Supplier not found");
      }
      updateFields.supplier_id = inventoryData.supplier_id;
    }
    if (inventoryData.product_category_id !== undefined) {
      const category = await db("product_categories")
        .where({ id: inventoryData.product_category_id, tenant_id: tenantId })
        .first();
      if (!category) {
        return Result.fail("Category not found");
      }
      updateFields.product_category_id = inventoryData.product_category_id;
    }

    if (Object.keys(updateFields).length === 0) {
      return Result.fail("No fields to update");
    }

    updateFields.updated_at = new Date().toISOString();

    const updatedCount = await db("inventory")
      .where({ id: inventoryData.id, tenant_id: tenantId })
      .update(updateFields);

    if (updatedCount === 0) {
      return Result.fail("Inventory record not found or no changes made");
    }

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

    await createActivityLog({
      activity_type: "inventory_updated",
      title: `Inventory record ${current.id} updated`,
      description: "Restock details modified",
      metadata: { inventory_id: inventoryData.id },
    });

    revalidatePath("/admin/inventory");
    await emitSyncEvent({
      tenantId,
      entityType: "inventory",
      entityId: inventoryData.id,
      action: "upsert",
      actorUserId: userId,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to update inventory record:", error);
    return Result.fail(error?.message || "Failed to update inventory record");
  }
}

export async function removeInventoryItem(
  id: string,
): Promise<Result<{ success: true }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const record = await db("inventory")
      .where({ id, tenant_id: tenantId })
      .first();
    if (!record) {
      return Result.fail("Inventory record not found");
    }

    const deletedCount = await db("inventory")
      .where({ id, tenant_id: tenantId })
      .del();
    if (deletedCount === 0) {
      return Result.fail("Inventory record not found");
    }

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

    await createActivityLog({
      activity_type: "inventory_deleted",
      title: `Inventory record ${record.id} deleted`,
      description: "Restock record removed",
      metadata: { inventory_id: id },
    });

    revalidatePath("/admin/inventory");
    await emitSyncEvent({
      tenantId,
      entityType: "inventory",
      entityId: id,
      action: "delete",
      actorUserId: currentUser.id,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete inventory record:", error);
    return Result.fail(error?.message || "Failed to delete inventory record");
  }
}

export async function removeInventoryItems(
  ids: string[],
): Promise<Result<{ deletedCount: number }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const records = await db("inventory")
      .where("tenant_id", tenantId)
      .whereIn("id", ids);
    if (records.length === 0) {
      return Result.fail("No inventory records found");
    }

    const deleted = await db("inventory")
      .where("tenant_id", tenantId)
      .whereIn("id", ids)
      .del();

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
    await emitSyncEvent({
      tenantId,
      entityType: "inventory",
      entityId: ids.join(","),
      action: "refresh",
      actorUserId: currentUser.id,
    });

    return Result.ok({ deletedCount: deleted });
  } catch (error: any) {
    console.error("Failed to delete inventory records:", error);
    return Result.fail(error?.message || "Failed to delete inventory records");
  }
}
