/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { Category, InsertCategory, Result } from "@/types/globals";
import { checkRole } from "@/utils/roles";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { generateId } from "@/utils/generator";
import { getCurrentUser } from "./_actions";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { emitSyncEvent } from "@/lib/sync-bus";

// ──────────────────────────────────────────────────────────────
// Read functions (tenant-scoped)
// ──────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Result<Category[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");

    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;
    const categories: Category[] = await db("product_categories")
      .select(
        "id",
        "tenant_id",
        "user_id",
        "name",
        "description",
        "created_at",
        "updated_at",
      )
      .where("tenant_id", tenantId)
      .orderBy("created_at", "desc");

    return Result.ok(categories);
  } catch (error: any) {
    console.error("Failed to fetch categories:", error);
    return Result.fail(error?.message || "Failed to fetch categories");
  }
}

export async function getCategory(id: string): Promise<Result<Category>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");

    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;
    const category = await db("product_categories")
      .select(
        "id",
        "tenant_id",
        "user_id",
        "name",
        "description",
        "created_at",
        "updated_at",
      )
      .where({ id, tenant_id: tenantId })
      .first();

    if (!category) {
      return Result.fail("Category not found");
    }

    return Result.ok(category);
  } catch (error: any) {
    console.error("Failed to fetch category:", error);
    return Result.fail(error?.message || "Failed to fetch category");
  }
}

// ──────────────────────────────────────────────────────────────
// Create / Update / Delete (tenant-scoped)
// ──────────────────────────────────────────────────────────────

export async function createCategory(
  categoryData: InsertCategory,
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

    const trimmedName = categoryData.name?.trim() || "";
    if (!trimmedName) {
      return Result.fail("Category name is required");
    }

    const existing = await db("product_categories")
      .where("tenant_id", tenantId)
      .whereRaw("LOWER(name) = ?", [trimmedName.toLowerCase()])
      .first();

    if (existing) {
      return Result.fail("A category with this name already exists");
    }

    const newId = generateId();
    await db("product_categories").insert({
      id: newId,
      tenant_id: tenantId,
      user_id: userId,
      name: trimmedName,
      description: categoryData.description?.trim() || null,
    });

    await createAuditLog({
      entity_type: "product_category",
      entity_id: newId,
      action: "create",
      new_values: {
        name: trimmedName,
        description: categoryData.description?.trim() || null,
      },
    });

    await createActivityLog({
      activity_type: "category_created",
      title: `Category ${trimmedName} created`,
      description: "New product category added",
      metadata: { category_id: newId },
    });

    revalidatePath("/admin/product-category");
    revalidatePath("/admin/product");
    await emitSyncEvent({
      tenantId,
      entityType: "category",
      entityId: newId,
      action: "upsert",
      actorUserId: userId,
    });

    return Result.ok({ id: newId });
  } catch (error: any) {
    console.error("Failed to create category:", error);
    return Result.fail(error?.message || "Failed to create category");
  }
}

export async function updateCategory(
  categoryData: Partial<InsertCategory> & { id: string },
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

    const current = await db("product_categories")
      .where({ id: categoryData.id, tenant_id: tenantId })
      .first();

    if (!current) {
      return Result.fail("Category not found");
    }

    const updateFields: any = {};
    if (categoryData.name !== undefined) {
      const trimmedName = categoryData.name.trim();
      if (trimmedName.length === 0) {
        return Result.fail("Category name cannot be empty");
      }

      const duplicate = await db("product_categories")
        .where("tenant_id", tenantId)
        .whereRaw("LOWER(name) = ?", [trimmedName.toLowerCase()])
        .whereNot("id", categoryData.id)
        .first();

      if (duplicate) {
        return Result.fail("Another category with this name already exists");
      }

      updateFields.name = trimmedName;
    }

    if (categoryData.description !== undefined) {
      updateFields.description = categoryData.description?.trim() || null;
    }

    if (Object.keys(updateFields).length === 0) {
      return Result.fail("No fields to update");
    }

    updateFields.updated_at = new Date().toISOString();

    const updatedCount = await db("product_categories")
      .where({ id: categoryData.id, tenant_id: tenantId })
      .update(updateFields);

    if (updatedCount === 0) {
      return Result.fail("Category not found or no changes made");
    }

    await createAuditLog({
      entity_type: "product_category",
      entity_id: categoryData.id,
      action: "update",
      old_values: {
        name: current.name,
        description: current.description,
      },
      new_values: {
        name: updateFields.name ?? current.name,
        description: updateFields.description ?? current.description,
      },
    });

    await createActivityLog({
      activity_type: "category_updated",
      title: `Category ${current.name} updated`,
      description: "Product category details modified",
      metadata: { category_id: categoryData.id },
    });

    revalidatePath(`/admin/product-category/${categoryData.id}`);
    revalidatePath("/admin/product-category");
    revalidatePath("/admin/product");
    await emitSyncEvent({
      tenantId,
      entityType: "category",
      entityId: categoryData.id,
      action: "upsert",
      actorUserId: userId,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to update category:", error);
    return Result.fail(error?.message || "Failed to update category");
  }
}

export async function removeCategory(
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

    const category = await db("product_categories")
      .where({ id, tenant_id: tenantId })
      .first();
    if (!category) {
      return Result.fail("Category not found");
    }

    const linkedProducts = await db("products")
      .where({ category_id: id, tenant_id: tenantId })
      .first();

    if (linkedProducts) {
      return Result.fail(
        "Cannot delete category – it is still used by existing products",
      );
    }

    const deletedCount = await db("product_categories")
      .where({ id, tenant_id: tenantId })
      .del();
    if (deletedCount === 0) {
      return Result.fail("Category not found");
    }

    await createAuditLog({
      entity_type: "product_category",
      entity_id: id,
      action: "delete",
      old_values: {
        name: category.name,
        description: category.description,
      },
    });

    await createActivityLog({
      activity_type: "category_deleted",
      title: `Category ${category.name} deleted`,
      description: "Product category permanently removed",
      metadata: { category_id: id },
    });

    revalidatePath("/admin/product-category");
    revalidatePath("/admin/product");
    await emitSyncEvent({
      tenantId,
      entityType: "category",
      entityId: id,
      action: "delete",
      actorUserId: currentUser.id,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete category:", error);
    return Result.fail(error?.message || "Failed to delete category");
  }
}

export async function removeCategories(
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

    const categories = await db("product_categories")
      .where("tenant_id", tenantId)
      .whereIn("id", ids);
    if (categories.length === 0) {
      return Result.fail("No categories found");
    }

    const linked = await db("products")
      .where("tenant_id", tenantId)
      .whereIn("category_id", ids)
      .first();
    if (linked) {
      return Result.fail("One or more categories are still used by products");
    }

    const deleted = await db("product_categories")
      .where("tenant_id", tenantId)
      .whereIn("id", ids)
      .del();

    await createAuditLog({
      entity_type: "product_categories",
      entity_id: ids.join(","),
      action: "delete",
      old_values: { ids },
    });

    await createActivityLog({
      activity_type: "categories_deleted_bulk",
      title: `Bulk deletion of ${ids.length} categories`,
      description: "Multiple product categories removed",
      metadata: { ids },
    });

    revalidatePath("/admin/product-category");
    revalidatePath("/admin/product");
    await emitSyncEvent({
      tenantId,
      entityType: "category",
      entityId: ids.join(","),
      action: "refresh",
      actorUserId: currentUser.id,
    });

    return Result.ok({ deletedCount: deleted });
  } catch (error: any) {
    console.error("Failed to delete categories:", error);
    return Result.fail(error?.message || "Failed to delete categories");
  }
}

export async function bulkCreateCategories(
  categoriesData: Array<{ name: string; description?: string | null }>,
): Promise<
  Result<{
    createdCount: number;
    existingCount: number;
    categories: Array<{ id: string; name: string }>;
  }>
> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (!Array.isArray(categoriesData) || categoriesData.length === 0) {
      return Result.fail("No categories provided for import");
    }

    const seenNames = new Set<string>();
    const validInputs: Array<{ name: string; description?: string | null }> = [];

    for (const item of categoriesData) {
      const trimmedName = item.name?.trim();
      if (!trimmedName) continue;
      const lower = trimmedName.toLowerCase();
      if (!seenNames.has(lower)) {
        seenNames.add(lower);
        validInputs.push({
          name: trimmedName,
          description: item.description?.trim() || null,
        });
      }
    }

    if (validInputs.length === 0) {
      return Result.fail("No valid categories with names found");
    }

    const existingRecords = await db("product_categories")
      .where("tenant_id", tenantId)
      .select("id", "name");

    const existingMap = new Map<string, { id: string; name: string }>();
    existingRecords.forEach((rec) => {
      existingMap.set(rec.name.toLowerCase(), { id: rec.id, name: rec.name });
    });

    const newToInsert: Array<{
      id: string;
      tenant_id: string;
      user_id: string;
      name: string;
      description: string | null;
    }> = [];

    const finalResultCategories: Array<{ id: string; name: string }> = [];
    let existingCount = 0;

    for (const item of validInputs) {
      const lower = item.name.toLowerCase();
      const existing = existingMap.get(lower);
      if (existing) {
        existingCount++;
        finalResultCategories.push(existing);
      } else {
        const id = generateId();
        const record = {
          id,
          tenant_id: tenantId,
          user_id: userId,
          name: item.name,
          description: item.description || null,
        };
        newToInsert.push(record);
        existingMap.set(lower, { id, name: item.name });
        finalResultCategories.push({ id, name: item.name });
      }
    }

    if (newToInsert.length > 0) {
      await db.transaction(async (trx) => {
        const chunkSize = 50;
        for (let i = 0; i < newToInsert.length; i += chunkSize) {
          const chunk = newToInsert.slice(i, i + chunkSize);
          await trx("product_categories").insert(chunk);
        }
      });

      await emitSyncEvent({
        tenantId,
        entityType: "category",
        entityId: "bulk",
        action: "refresh",
        payload: { count: newToInsert.length },
        actorUserId: userId,
      });
    }

    revalidatePath("/admin/product-category");
    revalidatePath("/admin/product");

    return Result.ok({
      createdCount: newToInsert.length,
      existingCount,
      categories: finalResultCategories,
    });
  } catch (error: any) {
    console.error("Failed to bulk create categories:", error);
    return Result.fail(error?.message || "Failed to bulk create categories");
  }
}