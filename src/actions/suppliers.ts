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
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { emitSyncEvent } from "@/lib/sync-bus";

export async function getSuppliers(): Promise<Result<SupplierInfoView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const suppliers = await db("v_supplier_info")
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
      .where("tenant_id", tenantId)
      .orderBy("created_at", "desc");

    return Result.ok(suppliers);
  } catch (error: any) {
    console.error("Failed to fetch suppliers:", error);
    return Result.fail(error?.message || "Failed to fetch suppliers");
  }
}

export async function getSupplier(
  id: string,
): Promise<Result<SupplierInfoView>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

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
      .where({ supplier_id: id, tenant_id: tenantId })
      .first();

    if (!supplier) {
      return Result.fail("Supplier not found");
    }

    return Result.ok({ ...supplier, is_active: Boolean(supplier.is_active) });
  } catch (error: any) {
    console.error("Failed to fetch supplier:", error);
    return Result.fail("Failed to fetch supplier");
  }
}

export async function createSupplier(
  supplierData: Omit<InsertSupplier, "id" | "user_id">,
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (!supplierData?.name?.trim()) {
      return Result.fail("Supplier name is required");
    }

    const newId = generateId();
    await db("suppliers").insert({
      id: newId,
      tenant_id: tenantId,
      user_id: currentUser.id,
      name: supplierData.name.trim(),
      email: supplierData.email?.trim() || null,
      company_name: supplierData.company_name?.trim() || null,
      address: supplierData.address?.trim() || null,
      phonenumber: supplierData.phonenumber?.trim() || null,
      is_active: supplierData.is_active !== false ? 1 : 0,
    });

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

    await createActivityLog({
      activity_type: "supplier_created",
      title: `Supplier ${supplierData.name} created`,
      description: "New supplier added to the system",
      metadata: { supplier_id: newId },
    });

    revalidatePath("/admin/supplier");
    await emitSyncEvent({
      tenantId,
      entityType: "supplier",
      entityId: newId,
      action: "upsert",
      actorUserId: currentUser.id,
    });

    return Result.ok({ id: newId });
  } catch (error: any) {
    console.error("Failed to create supplier:", error);
    return Result.fail(error?.message || "Failed to create supplier");
  }
}

export async function updateSupplier(
  supplierData: Partial<InsertSupplier> & { id: string },
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const current = await db("suppliers")
      .where({ id: supplierData.id, tenant_id: tenantId })
      .first();
    if (!current) {
      return Result.fail("Supplier not found");
    }

    const isAdmin = await checkRole("admin");
    if (!isAdmin && current.user_id !== userId) {
      return Result.fail("Not authorized to update this supplier");
    }

    const updateFields: any = {};
    if (supplierData.name !== undefined)
      updateFields.name = supplierData.name.trim();
    if (supplierData.email !== undefined)
      updateFields.email = supplierData.email;
    if (supplierData.company_name !== undefined)
      updateFields.company_name = supplierData.company_name;
    if (supplierData.is_active !== undefined)
      updateFields.is_active = supplierData.is_active ? 1 : 0;
    if (supplierData.address !== undefined)
      updateFields.address = supplierData.address;
    if (supplierData.phonenumber !== undefined)
      updateFields.phonenumber = supplierData.phonenumber;

    if (Object.keys(updateFields).length === 0) {
      return Result.fail("No fields to update");
    }

    updateFields.updated_at = new Date().toISOString();

    const updatedCount = await db("suppliers")
      .where({ id: supplierData.id, tenant_id: tenantId })
      .update(updateFields);

    if (updatedCount === 0) {
      return Result.fail("Supplier not found or no changes made");
    }

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

    await createActivityLog({
      activity_type: "supplier_updated",
      title: `Supplier ${current.name} updated`,
      description: "Supplier information modified",
      metadata: { supplier_id: supplierData.id },
    });

    revalidatePath(`/admin/supplier/${supplierData.id}`);
    revalidatePath("/admin/supplier");
    await emitSyncEvent({
      tenantId,
      entityType: "supplier",
      entityId: supplierData.id,
      action: "upsert",
      actorUserId: userId,
    });

    return Result.ok({ id: supplierData.id });
  } catch (error: any) {
    console.error("Failed to update supplier:", error);
    return Result.fail(error?.message || "Failed to update supplier");
  }
}

export async function removeSupplier(
  id: string,
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (!(await checkRole("admin"))) {
      return Result.fail("Not authorized to delete this supplier!");
    }

    const supplier = await db("suppliers")
      .where({ id, tenant_id: tenantId })
      .first();
    if (!supplier) {
      return Result.fail("Supplier not found");
    }

    const deletedCount = await db("suppliers")
      .where({ id, tenant_id: tenantId })
      .del();
    if (deletedCount === 0) {
      return Result.fail("Supplier not found");
    }

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

    await createActivityLog({
      activity_type: "supplier_deleted",
      title: `Supplier ${supplier.name} deleted`,
      description: "Supplier permanently removed",
      metadata: { supplier_id: id },
    });

    revalidatePath("/admin/supplier");
    await emitSyncEvent({
      tenantId,
      entityType: "supplier",
      entityId: id,
      action: "delete",
      actorUserId: userId,
    });

    return Result.ok({ id });
  } catch (error: any) {
    console.error("Failed to delete supplier:", error);
    return Result.fail("Failed to delete supplier");
  }
}

export async function removeSuppliers(ids: string[]) {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) return { error: true, message: "Unauthorized" };
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (!(await checkRole("admin"))) {
      return { error: true, message: "Not authorized" };
    }

    const suppliers = await db("suppliers")
      .where("tenant_id", tenantId)
      .whereIn("id", ids);
    if (suppliers.length === 0) {
      return Result.fail("No suppliers found");
    }

    const deleted = await db("suppliers")
      .where("tenant_id", tenantId)
      .whereIn("id", ids)
      .del();

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
    await emitSyncEvent({
      tenantId,
      entityType: "supplier",
      entityId: ids.join(","),
      action: "refresh",
      actorUserId: userId,
    });

    return { data: { deletedCount: deleted } };
  } catch (error: any) {
    console.error("Failed to delete suppliers:", error);
    return {
      error: true,
      message: error?.message || "Failed to delete suppliers",
    };
  }
}
