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

// ──────────────────────────────────────────────────────────────
// Read functions
// ──────────────────────────────────────────────────────────────

/**
 * Get all product categories – ordered by newest first.
 */
export async function getCategories(): Promise<Result<Category[]>> {
  try {
    const categories: Category[] = await db("product_categories")
      .select(
        "id",
        "user_id",
        "name",
        "description",
        "created_at",
        "updated_at",
      )
      .orderBy("created_at", "desc");

    return Result.ok(categories);
  } catch (error: any) {
    console.error("Failed to fetch categories:", error);
    return Result.fail(error?.message || "Failed to fetch categories");
  }
}

/**
 * Get a single product category by ID.
 */
export async function getCategory(id: string): Promise<Result<Category>> {
  try {
    const category = await db("product_categories")
      .select(
        "id",
        "user_id",
        "name",
        "description",
        "created_at",
        "updated_at",
      )
      .where("id", id)
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
// Create / Update / Delete
// ──────────────────────────────────────────────────────────────

/**
 * Create a new product category – admin only.
 */
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
    if (!userId) throw new Error("Unauthorized");

    // Validate required fields
    if (!categoryData.name || categoryData.name.trim().length === 0) {
      return Result.fail("Category name is required");
    }

    // Optional: ensure unique category name per user (or globally)
    const existing = await db("product_categories")
      .where("name", categoryData.name.trim())
      .andWhere("user_id", currentUser?.id)
      .first();

    if (existing) {
      return Result.fail("A category with this name already exists");
    }

    const newId = generateId();
    await db("product_categories").insert({
      id: newId,
      user_id: currentUser?.id,
      name: categoryData.name.trim(),
      description: categoryData.description?.trim() || null,
    });

    // Audit log
    await createAuditLog({
      entity_type: "product_category",
      entity_id: newId,
      action: "create",
      new_values: {
        name: categoryData.name.trim(),
        description: categoryData.description?.trim() || null,
      },
    });

    // Activity log
    await createActivityLog({
      activity_type: "category_created",
      title: `Category ${categoryData.name.trim()} created`,
      description: "New product category added",
      metadata: { category_id: newId },
    });

    revalidatePath("/admin/product-category");
    revalidatePath("/admin/product"); // products depend on categories
    return Result.ok({ id: newId });
  } catch (error: any) {
    console.error("Failed to create category:", error);
    return Result.fail(error?.message || "Failed to create category");
  }
}

/**
 * Update an existing product category – admin only.
 */
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
    if (!userId) throw new Error("Unauthorized");

    // Fetch current category for audit
    const current = await db("product_categories")
      .where("id", categoryData.id)
      .first();

    if (!current) {
      return Result.fail("Category not found");
    }

    // Build update object – only allowed fields
    const updateFields: any = {};
    if (categoryData.name !== undefined) {
      const trimmedName = categoryData.name.trim();
      if (trimmedName.length === 0) {
        return Result.fail("Category name cannot be empty");
      }

      // Check name uniqueness (excluding itself)
      const duplicate = await db("product_categories")
        .where("name", trimmedName)
        .andWhere("user_id", userId)
        .andWhere("id", "!=", categoryData.id)
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

    const updatedCount = await db("product_categories")
      .where("id", categoryData.id)
      .update(updateFields);

    if (updatedCount === 0) {
      return Result.fail("Category not found or no changes made");
    }

    // Audit log
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

    // Activity log
    await createActivityLog({
      activity_type: "category_updated",
      title: `Category ${current.name} updated`,
      description: "Product category details modified",
      metadata: { category_id: categoryData.id },
    });

    revalidatePath(`/admin/product-category/${categoryData.id}`);
    revalidatePath("/admin/product-category");
    revalidatePath("/admin/product"); // products depend on categories
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to update category:", error);
    return Result.fail(error?.message || "Failed to update category");
  }
}

/**
 * Delete a product category – admin only.
 * Note: This will fail if products are still linked to this category.
 */
export async function removeCategory(
  id: string,
): Promise<Result<{ success: true }>> {
 const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const category = await db("product_categories").where("id", id).first();
    if (!category) {
      return Result.fail("Category not found");
    }

    // Optional: prevent deletion if products are still using this category
    const linkedProducts = await db("products")
      .where("category_id", id)
      .first();

    if (linkedProducts) {
      return Result.fail(
        "Cannot delete category – it is still used by existing products",
      );
    }

    const deletedCount = await db("product_categories").where("id", id).del();
    if (deletedCount === 0) {
      return Result.fail("Category not found");
    }

    // Audit log
    await createAuditLog({
      entity_type: "product_category",
      entity_id: id,
      action: "delete",
      old_values: {
        name: category.name,
        description: category.description,
      },
    });

    // Activity log
    await createActivityLog({
      activity_type: "category_deleted",
      title: `Category ${category.name} deleted`,
      description: "Product category permanently removed",
      metadata: { category_id: id },
    });

    revalidatePath("/admin/product-category");
    revalidatePath("/admin/product");
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete category:", error);
    return Result.fail(error?.message || "Failed to delete category");
  }
}

// ──────────────────────────────────────────────────────────────
// Bulk delete – admin only
// ──────────────────────────────────────────────────────────────

export async function removeCategories(
  ids: string[],
): Promise<Result<{ deletedCount: number }>> {
const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const categories = await db("product_categories").whereIn("id", ids);
    if (categories.length === 0) {
      return Result.fail("No categories found");
    }

    // Prevent deletion if any category is still linked to products
    const linked = await db("products").whereIn("category_id", ids).first();
    if (linked) {
      return Result.fail("One or more categories are still used by products");
    }

    const deleted = await db("product_categories").whereIn("id", ids).del();

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
    return Result.ok({ deletedCount: deleted });
  } catch (error: any) {
    console.error("Failed to delete categories:", error);
    return Result.fail(error?.message || "Failed to delete categories");
  }
}




/**
 * Bulk create product categories – admin only.
 */

export async function bulkCreateCategories(
  categoriesData: Array<{ name: string; description?: string | null }>,
): Promise<Result<{ createdCount: number; existingCount: number; categories: Array<{ id: string; name: string }> }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) throw new Error("Unauthorized");

    if (!Array.isArray(categoriesData) || categoriesData.length === 0) {
      return Result.fail("No categories provided for import");
    }

    // Filter valid categories and deduplicate by name in input
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

    // Fetch existing categories for user
    const existingRecords = await db("product_categories")
      .where("user_id", userId)
      .select("id", "name");

    const existingMap = new Map<string, { id: string; name: string }>();
    existingRecords.forEach((rec) => {
      existingMap.set(rec.name.toLowerCase(), { id: rec.id, name: rec.name });
    });

    const newToInsert: Array<{
      id: string;
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
      // Transaction ONLY does DB writes — nothing that might need a second connection.
      await db.transaction(async (trx) => {
        const chunkSize = 50;
        for (let i = 0; i < newToInsert.length; i += chunkSize) {
          const chunk = newToInsert.slice(i, i + chunkSize);
          await trx("product_categories").insert(chunk);
        }
      });

      // Logging happens AFTER the transaction is committed and the connection
      // is released — avoids the pool-deadlock that was causing your timeout.
      // If createAuditLog/createActivityLog accept a userId param, pass it
      // explicitly so they don't re-query getCurrentUser() at all.
      // await Promise.all([
      //   createAuditLog({
      //     entity_type: "product_category",
      //     entity_id: newToInsert.map((c) => c.id).join(","),
      //     action: "create",
      //     new_values: { count: newToInsert.length },
      //     userId, // avoid re-fetching session if the function supports this
      //   }),
      //   createActivityLog({
      //     activity_type: "categories_bulk_imported",
      //     title: `Bulk imported ${newToInsert.length} categories`,
      //     description: `Imported ${newToInsert.length} categories via Spreadsheet/CSV`,
      //     metadata: { count: newToInsert.length },
      //   }),
      // ]);
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


// export async function bulkCreateCategories(
//   categoriesData: Array<{ name: string; description?: string | null }>,
// ): Promise<Result<{ createdCount: number; existingCount: number; categories: Array<{ id: string; name: string }> }>> {
//   const isAdmin = await checkRole("admin");
//   if (!isAdmin) {
//     return Result.fail("Not authorized");
//   }

//   try {
//     const currentUser = await getCurrentUser();

// console.log(currentUser)


//     const userId = currentUser?.id;
//     if (!userId) throw new Error("Unauthorized");

//     if (!Array.isArray(categoriesData) || categoriesData.length === 0) {
//       return Result.fail("No categories provided for import");
//     }

//     // Filter valid categories and deduplicate by name in input
//     const seenNames = new Set<string>();
//     const validInputs: Array<{ name: string; description?: string | null }> = [];

//     for (const item of categoriesData) {
//       const trimmedName = item.name?.trim();
//       if (!trimmedName) continue;
//       const lower = trimmedName.toLowerCase();
//       if (!seenNames.has(lower)) {
//         seenNames.add(lower);
//         validInputs.push({
//           name: trimmedName,
//           description: item.description?.trim() || null,
//         });
//       }
//     }

//     if (validInputs.length === 0) {
//       return Result.fail("No valid categories with names found");
//     }

//     // Fetch existing categories for user
//     const existingRecords = await db("product_categories")
//       .where("user_id", userId)
//       .select("id", "name");

//     const existingMap = new Map<string, { id: string; name: string }>();
//     existingRecords.forEach((rec) => {
//       existingMap.set(rec.name.toLowerCase(), { id: rec.id, name: rec.name });
//     });

//     const newToInsert: Array<{
//       id: string;
//       user_id: string;
//       name: string;
//       description: string | null;
//     }> = [];

//     const finalResultCategories: Array<{ id: string; name: string }> = [];
//     let existingCount = 0;

//     for (const item of validInputs) {
//       const lower = item.name.toLowerCase();
//       if (existingMap.has(lower)) {
//         existingCount++;
//         finalResultCategories.push(existingMap.get(lower)!);
//       } else {
//         const id = generateId();
//         newToInsert.push({
//           id,
//           user_id: userId,
//           name: item.name,
//           description: item.description || null,
//         });
//         existingMap.set(lower, { id, name: item.name });
//         finalResultCategories.push({ id, name: item.name });
//       }
//     }

//     if (newToInsert.length > 0) {


//       await db.transaction(async (trx) => {


//         // SQLite chunk insert
//         const chunkSize = 50;
//         for (let i = 0; i < newToInsert.length; i += chunkSize) {
//           const chunk = newToInsert.slice(i, i + chunkSize);
//           await trx("product_categories").insert(chunk);
//         }

//         await createAuditLog({
//           entity_type: "product_category",
//           entity_id: newToInsert.map((c) => c.id).join(","),
//           action: "create",
//           new_values: { count: newToInsert.length },
//         });



//         await createActivityLog({
//           activity_type: "categories_bulk_imported",
//           title: `Bulk imported ${newToInsert.length} categories`,
//           description: `Imported ${newToInsert.length} categories via Spreadsheet/CSV`,
//           metadata: { count: newToInsert.length },
//         });
//       });

//       console.log("dome")
//     }

//     revalidatePath("/admin/product-category");
//     revalidatePath("/admin/product");
//     // revalidatePath("/admin/inventory");

//     return Result.ok({
//       createdCount: newToInsert.length,
//       existingCount,
//       categories: finalResultCategories,
//     });
//   } catch (error: any) {
//     console.error("Failed to bulk create categories:", error);
//     return Result.fail(error?.message || "Failed to bulk create categories");
//   }
// }