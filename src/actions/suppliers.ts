/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { InsertSupplier, Result, SupplierInfoView } from "@/types/globals";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { getCurrentUser } from "./_actions";
import { generateId } from "@/utils/generator";
import { checkRole } from "@/utils/roles";

// ──────────────────────────────────────────────────────────────
// Read functions
// ──────────────────────────────────────────────────────────────

/**
 * Get all suppliers – uses v_supplier_info view.
 * (Admin sees all; regular users can be restricted to their own.)
 */
export async function getSuppliers(): Promise<Result<SupplierInfoView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) throw new Error("Unauthorized");


    const query = db("v_supplier_info")
      .select(
         "supplier_id as id",
        "supplier_name as name",
        "email",
        "company_name",
        "address",
        "phonenumber",
        "user_id",
        "user_name",
        "created_at",
        "updated_at",
        "is_active",
      )
      .orderBy("created_at", "desc");

    // Optional: restrict to own suppliers if not admin
    // if (!checkRole("admin")) {
    //   query.where("user_id", userId);
    // }

    const suppliers = await query;
    return Result.ok(suppliers);
  } catch (error: any) {
    console.error("Failed to fetch suppliers:", error);
    return Result.fail("Failed to fetch suppliers:");
    // return {
    //   error: true,
    //   message: error?.message || "Failed to fetch suppliers",
    // };
  }
}

/**
 * Get a single supplier by ID.
 */
export async function getSupplier(
  id: string,
): Promise<Result<SupplierInfoView>> {
  try {
    const supplier = await db("v_supplier_info")
      .select(
        "supplier_id as id",
        "supplier_name as name",
        "email",
        "company_name",
        "address",
        "phonenumber",
        "user_id",
        "user_name",
        "created_at",
        "updated_at",
        "is_active",
      )
      .where("supplier_id", id)
      .first();

    if (!supplier) {
      return Result.fail("Supplier not found");
    }

    return Result.ok({ ...supplier, is_active: Boolean(supplier.is_active) });
  } catch (error: any) {
    console.error("Failed to fetch supplier:", error);
    return Result.fail("Failed to fetch supplier");
    // return {
    //   error: true,
    //   message: error?.message || "Failed to fetch supplier",
    // };
  }
}

// ──────────────────────────────────────────────────────────────
// Create / Update / Delete
// ──────────────────────────────────────────────────────────────

/**
 * Create a new supplier – attaches the authenticated user's ID.
 */
export async function createSupplier(
  supplierData: Omit<InsertSupplier, "id" | "user_id">,
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser.id) throw new Error("Unauthorized");

    // Validate required fields
    if (!supplierData) {
      return Result.fail("All field are reuquired!");
    }

    const newId = generateId();
    // Insert with current user_id
    await db("suppliers").insert({
      id: newId,
      user_id: currentUser?.id,
      name: supplierData.name,
      email: supplierData.email,
      company_name: supplierData.company_name,
      address: supplierData.address || null,
      phonenumber: supplierData.phonenumber || null,
      is_active: supplierData.is_active,
    });

    // Audit log
    await createAuditLog({
      entity_type: "supplier",
      entity_id: newId,
      action: "create",
      new_values: {
        name: supplierData.name,
        email: supplierData.email,
        company_name: supplierData.company_name,
        address: supplierData.address || null,
        phonenumber: supplierData.phonenumber || null,
        is_active: supplierData.is_active,
      },
    });

    // Activity log
    await createActivityLog({
      activity_type: "supplier_created",
      title: `Supplier ${supplierData.name} created`,
      description: "New supplier added to the system",
      metadata: { supplier_id: newId },
    });

    revalidatePath("/admin/supplier");
    return Result.ok({ id: newId });
  } catch (error: any) {
    console.error("Failed to create supplier:", error);
    return Result.fail("Failed to create supplier:");
  }
}

/**
 * Update an existing supplier – must have an `id` in the update data.
 */
export async function updateSupplier(
  supplierData: Partial<InsertSupplier> & { id: string },
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) throw new Error("Unauthorized");

    // Fetch current supplier for audit and ownership check
    const current = await db("suppliers").where("id", supplierData.id).first();
    if (!current) {
      return Result.fail("Supplier not found");
    }

    // Optional: restrict update to owner or admin
    const isAdmin = await checkRole("admin");

    if (!isAdmin && current.user_id !== userId) {
      return Result.fail("Not authorized to update this supplier");
    }

    // Build update object
    const updateFields: any = {};
    if (supplierData.name !== undefined) updateFields.name = supplierData.name;
    if (supplierData.email !== undefined)
      updateFields.email = supplierData.email;
    if (supplierData.company_name !== undefined)
      updateFields.company_name = supplierData.company_name;
    if (supplierData.is_active !== undefined)
      updateFields.is_active = supplierData.is_active;
    if (supplierData.address !== undefined)
      updateFields.address = supplierData.address;
    if (supplierData.phonenumber !== undefined)
      updateFields.phonenumber = supplierData.phonenumber;

    if (Object.keys(updateFields).length === 0) {
      return Result.fail("No fields to update");
    }

    const updatedCount = await db("suppliers")
      .where("id", supplierData.id)
      .update(updateFields);

    if (updatedCount === 0) {
      return Result.fail("Supplier not found or no changes made");
    }

    // Audit log – old vs new
    await createAuditLog({
      entity_type: "supplier",
      entity_id: supplierData.id,
      action: "update",
      old_values: {
        name: current.name,
        address: current.address,
        phonenumber: current.phonenumber,
      },
      new_values: {
        name: updateFields.name ?? current.name,
        address: updateFields.address ?? current.address,
        phonenumber: updateFields.phonenumber ?? current.phonenumber,
      },
    });

    // Activity log
    await createActivityLog({
      activity_type: "supplier_updated",
      title: `Supplier ${current.name} updated`,
      description: "Supplier information modified",
      metadata: { supplier_id: supplierData.id },
    });

    revalidatePath(`/admin/supplier/${supplierData.id}`);
    revalidatePath("/admin/supplier");

    return Result.ok({ id: supplierData.id });
  } catch (error: any) {
    console.error("Failed to update supplier:", error);
    return Result.fail(error?.message || "Failed to update supplier:");
    // return {
    //   error: true,
    //   message: error?.message || "Failed to update supplier",
    // };
  }
}

/**
 * Delete a supplier by ID.
 */
export async function removeSupplier(
  id: string,
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) throw new Error("Unauthorized");

    // Optional: ownership check
    if (!checkRole("admin")) {
      return Result.fail("Not authorized to delete this supplier!");
    }

    // Fetch supplier for audit and ownership
    const supplier = await db("suppliers").where("id", id).first();
    if (!supplier) {
      return Result.fail("Supplier not found");
    }

    const deletedCount = await db("suppliers").where("id", id).del();
    if (deletedCount === 0) {
      return Result.fail("Supplier not found");
    }

    // Audit log
    await createAuditLog({
      entity_type: "supplier",
      entity_id: id,
      action: "delete",
      old_values: {
        name: supplier.name,
        address: supplier.address,
        phonenumber: supplier.phonenumber,
        user_id: supplier.user_id,
      },
    });

    // Activity log
    await createActivityLog({
      activity_type: "supplier_deleted",
      title: `Supplier ${supplier.name} deleted`,
      description: "Supplier permanently removed",
      metadata: { supplier_id: id },
    });

    revalidatePath("/admin/supplier");
    return Result.ok({ id });
  } catch (error: any) {
    console.error("Failed to delete supplier:", error);
    return Result.fail("Failed to delete supplier");
  }
}

// ──────────────────────────────────────────────────────────────
// Bulk delete (optional)
// ──────────────────────────────────────────────────────────────

export async function removeSuppliers(ids: string[]) {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) throw new Error("Unauthorized");

    // Optional: admin-only
    // if (!checkRole("admin")) {
    //   return Result.fail( "Not authorized" );
    // }

    // Fetch all to log
    const suppliers = await db("suppliers").whereIn("id", ids);
    if (suppliers.length === 0) {
      return Result.fail("No suppliers found");
    }

    const deleted = await db("suppliers").whereIn("id", ids).del();

    // Audit log (summary)
    await createAuditLog({
      entity_type: "suppliers",
      entity_id: ids.join(","),
      action: "delete",
      old_values: { ids },
    });

    await createActivityLog({
      activity_type: "suppliers_deleted_bulk",
      title: `Bulk deletion of ${ids.length} suppliers`,
      description: "Multiple suppliers removed",
      metadata: { ids },
    });

    revalidatePath("/admin/supplier");
    return { data: { deletedCount: deleted } };
  } catch (error: any) {
    console.error("Failed to delete suppliers:", error);
    return {
      error: true,
      message: error?.message || "Failed to delete suppliers",
    };
  }
}
