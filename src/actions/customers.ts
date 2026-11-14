/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import {
  Customer,
  CustomerInfoView,
  InsertCustomer,
  Result,
} from "@/types/globals";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { generateId } from "@/utils/generator";
import { getCurrentUser } from "./_actions";
import { checkRole } from "@/utils/roles";

// ──────────────────────────────────────────────────────────────
// Read functions
// ──────────────────────────────────────────────────────────────

/**
 * Get all customers – returns the view with user details.
 * (Admin sees all; regular users see only their own customers.)
 */
export async function getCustomers(): Promise<Result<CustomerInfoView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) throw new Error("Unauthorized");


    const query = db("v_customer_info")
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
      .orderBy("created_at", "desc");

    // Uncomment if you want to restrict to own customers:
    // if (!checkRole("admin")) {
    //   query.where("user_id", userId);
    // }

    const customers = await query;
    return Result.ok(customers);
  } catch (error: any) {
    console.error("Failed to fetch customers:", error);
    return Result.fail("Failed to fetch customers:");
    // return {
    //   error: true,
    //   message: error?.message || "Failed to fetch customers",
    // };
  }
}

/**
 * Get a single customer by ID.
 */
export async function getCustomer(
  id: string,
): Promise<Result<CustomerInfoView>> {
  try {
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
      .where("customer_id", id)
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

// ──────────────────────────────────────────────────────────────
// Create / Update / Delete
// ──────────────────────────────────────────────────────────────

/**
 * Create a new customer – sets user_id from the authenticated user.
 */
export async function createCustomer(
  customerData: InsertCustomer,
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");

    // Validate required fields
    if (!customerData.name) {
      return Result.fail("Customer name is required");
    }

    // Insert the customer with the current user's ID
    const newId = generateId();
    await db("customers").insert({
      id: newId,
      user_id: currentUser?.id,
      name: customerData.name,
      address: customerData.address || null,
      phonenumber: customerData.phonenumber || null,
    });

    // Audit log
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

    // Activity log
    await createActivityLog({
      activity_type: "customer_created",
      title: `Customer ${customerData.name} created`,
      description: "New customer added to the system",
      metadata: { customer_id: newId },
    });

    revalidatePath("/admin/customer");
    return Result.ok({ id: newId });
  } catch (error: any) {
    console.error("Failed to create customer:", error);
    return Result.fail("Failed to create customer:");
    // return {
    //   error: true,
    //   message: error?.message || "Failed to create customer",
    // };
  }
}

/**
 * Update an existing customer – must have an `id` in the update data.
 */
export async function updateCustomer(
  customerData: Partial<InsertCustomer> & { id: string },
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) return Result.fail("Unauthorized");

    // Fetch current customer to compare and for audit
    const current = await db("customers").where("id", customerData.id).first();
    if (!current) {
      return Result.fail("Customer not found");
    }

    // Optional: check ownership (only admin or the owning user can update)
    // if (!checkRole("admin") && current.user_id !== userId) {
    //   return Result.sage: "Not authorized to update this customer");
    // }

    // Build update object
    const updateFields: any = {};
    if (customerData.name !== undefined) updateFields.name = customerData.name;
    if (customerData.address !== undefined)
      updateFields.address = customerData.address;
    if (customerData.phonenumber !== undefined)
      updateFields.phonenumber = customerData.phonenumber;

    if (Object.keys(updateFields).length === 0) {
      return Result.fail("No fields to update");
    }

    const updatedCount = await db("customers")
      .where("id", customerData.id)
      .update(updateFields);

    if (updatedCount === 0) {
      return Result.fail("Customer not found or no changes made");
    }

    // Audit log – include old and new values
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

    // Activity log
    await createActivityLog({
      activity_type: "customer_updated",
      title: `Customer ${current.name} updated`,
      description: "Customer information modified",
      metadata: { customer_id: customerData.id },
    });

    revalidatePath(`/admin/customer/${customerData.id}`);
    revalidatePath("/admin/customer");
    return Result.ok({ id: customerData.id });
  } catch (error: any) {
    console.error("Failed to update customer:", error);
    return Result.fail(error?.message || "Failed to update customer");
    // return {
    //   error: true,
    //   message: error?.message || "Failed to update customer",
    // };
  }
}

/**
 * Delete a customer by ID.
 */
export async function removeCustomer(
  id: string,
): Promise<Result<{ id: string }>> {
  // Optional: check ownership
  const isAdmin = await checkRole("admin");

  if (!isAdmin) {
    return Result.fail("Not authorized to delete this customer");
  }

  const currentUser = await getCurrentUser();
  const userId = currentUser?.id;
  try {
    if (!userId) throw new Error("Unauthorized");

    // Fetch customer for audit and ownership check
    const customer = await db("customers").where("id", id).first();
    if (!customer) {
      return Result.fail("Customer not found");
    }

    const deletedCount = await db("customers").where("id", id).del();
    if (deletedCount === 0) {
      return Result.fail("Customer not found");
    }

    // Audit log
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

    // Activity log
    await createActivityLog({
      activity_type: "customer_deleted",
      title: `Customer ${customer.name} deleted`,
      description: "Customer permanently removed",
      metadata: { customer_id: id },
    });

    revalidatePath("/admin/customer");
    return Result.ok({ id });
  } catch (error: any) {
    console.error("Failed to delete customer:", error);
    return Result.fail("Failed to delete customer:");
    // return {
    //   error: true,
    //   message: error?.message || "Failed to delete customer",
    // };
  }
}

// ──────────────────────────────────────────────────────────────
// Bulk delete (optional)
// ──────────────────────────────────────────────────────────────

export async function removeCustomers(
  ids: string[],
): Promise<Result<{ count: string | number }>> {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) throw new Error("Unauthorized");

    // Optional: admin only
    // if (!checkRole("admin")) {
    //   return Result.sage: "Not authorized");
    // }

    // Fetch all to log
    const customers = await db("customers").whereIn("id", ids);
    if (customers.length === 0) {
      return Result.fail("No customers found");
    }

    const deleted = await db("customers").whereIn("id", ids).del();

    // Audit log – one entry summarising the bulk delete
    await createAuditLog({
      entity_type: "customers",
      entity_id: ids.join(","),
      action: "delete",
      old_values: { ids },
    });

    // Activity log – one entry
    await createActivityLog({
      activity_type: "customers_deleted_bulk",
      title: `Bulk deletion of ${ids.length} customers`,
      description: "Multiple customers removed",
      metadata: { ids },
    });

    revalidatePath("/admin/customer");
    return Result.ok({ count: deleted });
  } catch (error: any) {
    console.error("Failed to delete customers:", error);
    return Result.fail("Failed to delete customers:");
    // return {
    //   error: true,
    //   message: error?.message || "Failed to delete customers",
    // };
  }
}
