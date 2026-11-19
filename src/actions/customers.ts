/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { CustomerInfoView, InsertCustomer, Result } from "@/types/globals";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { generateId } from "@/utils/generator";
import { getCurrentUser } from "./_actions";
import { checkRole } from "@/utils/roles";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { emitSyncEvent } from "@/lib/sync-bus";

export async function getCustomers(): Promise<Result<CustomerInfoView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const customers = await db("v_customer_info")
      .select(
        "customer_id as id",
        "customer_name as name",
        "address",
        "phonenumber",
        "user_id",
        "user_name",
        "created_at",
        "updated_at",
      )
      .where("tenant_id", tenantId)
      .orderBy("created_at", "desc");

    return Result.ok(customers);
  } catch (error: any) {
    console.error("Failed to fetch customers:", error);
    return Result.fail(error?.message || "Failed to fetch customers");
  }
}

export async function getCustomer(
  id: string,
): Promise<Result<CustomerInfoView>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const customer = await db("v_customer_info")
      .select(
        "customer_id as id",
        "customer_name as name",
        "address",
        "phonenumber",
        "user_id",
        "user_name",
        "created_at",
        "updated_at",
      )
      .where({ customer_id: id, tenant_id: tenantId })
      .first();

    if (!customer) {
      return Result.fail("Customer not found");
    }

    return Result.ok(customer);
  } catch (error: any) {
    console.error("Failed to fetch customer:", error);
    return Result.fail(error?.message || "Failed to fetch customer");
  }
}

export async function createCustomer(
  customerData: InsertCustomer,
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (!customerData.name?.trim()) {
      return Result.fail("Customer name is required");
    }

    const newId = generateId();
    await db("customers").insert({
      id: newId,
      tenant_id: tenantId,
      user_id: currentUser.id,
      name: customerData.name.trim(),
      address: customerData.address?.trim() || null,
      phonenumber: customerData.phonenumber?.trim() || null,
    });

    await createAuditLog({
      entity_type: "customer",
      entity_id: newId,
      action: "create",
      new_values: {
        name: customerData.name,
        address: customerData.address || null,
        phonenumber: customerData.phonenumber || null,
      },
    });

    await createActivityLog({
      activity_type: "customer_created",
      title: `Customer ${customerData.name} created`,
      description: "New customer added to the system",
      metadata: { customer_id: newId },
    });

    revalidatePath("/admin/customer");
    await emitSyncEvent({
      tenantId,
      entityType: "customer",
      entityId: newId,
      action: "upsert",
      actorUserId: currentUser.id,
    });

    return Result.ok({ id: newId });
  } catch (error: any) {
    console.error("Failed to create customer:", error);
    return Result.fail(error?.message || "Failed to create customer");
  }
}

export async function updateCustomer(
  customerData: Partial<InsertCustomer> & { id: string },
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const current = await db("customers")
      .where({ id: customerData.id, tenant_id: tenantId })
      .first();
    if (!current) {
      return Result.fail("Customer not found");
    }

    const updateFields: any = {};
    if (customerData.name !== undefined)
      updateFields.name = customerData.name.trim();
    if (customerData.address !== undefined)
      updateFields.address = customerData.address;
    if (customerData.phonenumber !== undefined)
      updateFields.phonenumber = customerData.phonenumber;

    if (Object.keys(updateFields).length === 0) {
      return Result.fail("No fields to update");
    }

    updateFields.updated_at = new Date().toISOString();

    const updatedCount = await db("customers")
      .where({ id: customerData.id, tenant_id: tenantId })
      .update(updateFields);

    if (updatedCount === 0) {
      return Result.fail("Customer not found or no changes made");
    }

    await createAuditLog({
      entity_type: "customer",
      entity_id: customerData.id,
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
      activity_type: "customer_updated",
      title: `Customer ${current.name} updated`,
      description: "Customer information modified",
      metadata: { customer_id: customerData.id },
    });

    revalidatePath(`/admin/customer/${customerData.id}`);
    revalidatePath("/admin/customer");
    await emitSyncEvent({
      tenantId,
      entityType: "customer",
      entityId: customerData.id,
      action: "upsert",
      actorUserId: userId,
    });

    return Result.ok({ id: customerData.id });
  } catch (error: any) {
    console.error("Failed to update customer:", error);
    return Result.fail(error?.message || "Failed to update customer");
  }
}

export async function removeCustomer(
  id: string,
): Promise<Result<{ id: string }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized to delete this customer");
  }

  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const customer = await db("customers")
      .where({ id, tenant_id: tenantId })
      .first();
    if (!customer) {
      return Result.fail("Customer not found");
    }

    const deletedCount = await db("customers")
      .where({ id, tenant_id: tenantId })
      .del();
    if (deletedCount === 0) {
      return Result.fail("Customer not found");
    }

    await createAuditLog({
      entity_type: "customer",
      entity_id: id,
      action: "delete",
      old_values: {
        name: customer.name,
        address: customer.address,
        phonenumber: customer.phonenumber,
        user_id: customer.user_id,
      },
    });

    await createActivityLog({
      activity_type: "customer_deleted",
      title: `Customer ${customer.name} deleted`,
      description: "Customer permanently removed",
      metadata: { customer_id: id },
    });

    revalidatePath("/admin/customer");
    await emitSyncEvent({
      tenantId,
      entityType: "customer",
      entityId: id,
      action: "delete",
      actorUserId: userId,
    });

    return Result.ok({ id });
  } catch (error: any) {
    console.error("Failed to delete customer:", error);
    return Result.fail(error?.message || "Failed to delete customer");
  }
}

export async function removeCustomers(
  ids: string[],
): Promise<Result<{ count: string | number }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const customers = await db("customers")
      .where("tenant_id", tenantId)
      .whereIn("id", ids);
    if (customers.length === 0) {
      return Result.fail("No customers found");
    }

    const deleted = await db("customers")
      .where("tenant_id", tenantId)
      .whereIn("id", ids)
      .del();

    await createAuditLog({
      entity_type: "customers",
      entity_id: ids.join(","),
      action: "delete",
      old_values: { ids },
    });

    await createActivityLog({
      activity_type: "customers_deleted_bulk",
      title: `Bulk deletion of ${ids.length} customers`,
      description: "Multiple customers removed",
      metadata: { ids },
    });

    revalidatePath("/admin/customer");
    await emitSyncEvent({
      tenantId,
      entityType: "customer",
      entityId: ids.join(","),
      action: "refresh",
      actorUserId: userId,
    });

    return Result.ok({ count: deleted });
  } catch (error: any) {
    console.error("Failed to delete customers:", error);
    return Result.fail(error?.message || "Failed to delete customers");
  }
}
