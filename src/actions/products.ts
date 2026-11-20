/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import {
  InsertProduct,
  ProductCatalogView,
  ProductSalesView,
  ReStockProduct,
  Result,
} from "@/types/globals";
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

export interface BulkProductImportItem {
  name: string;
  category_id?: string;
  category_name?: string;
  description?: string | null;
  cost_price: number;
  unit_price: number;
  stock_quantity: number;
  barcode?: string | null;
  active?: boolean;
  photo_url?: string | null;
}

/**
 * Bulk create products – admin only.
 */
export async function bulkCreateProducts(
  productsData: BulkProductImportItem[],
): Promise<
  Result<{
    createdCount: number;
    newCategoriesCount: number;
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

    if (!Array.isArray(productsData) || productsData.length === 0) {
      return Result.fail("No products provided for import");
    }

    const existingCategories = await db("product_categories")
      .where("tenant_id", tenantId)
      .select("id", "name");

    const categoryNameToId = new Map<string, string>();
    const categoryIdSet = new Set<string>();

    existingCategories.forEach((cat) => {
      categoryNameToId.set(cat.name.trim().toLowerCase(), cat.id);
      categoryIdSet.add(cat.id);
    });

    const newCategoriesToInsert: Array<{
      id: string;
      tenant_id: string;
      user_id: string;
      name: string;
      description: string | null;
    }> = [];

    for (const item of productsData) {
      if (!item.name?.trim()) continue;
      const catId = item.category_id;
      const catName = item.category_name?.trim();

      if (catId && categoryIdSet.has(catId)) {
        continue;
      }

      if (catName) {
        const lower = catName.toLowerCase();
        if (!categoryNameToId.has(lower)) {
          const newCatId = generateId();
          categoryNameToId.set(lower, newCatId);
          categoryIdSet.add(newCatId);
          newCategoriesToInsert.push({
            id: newCatId,
            tenant_id: tenantId,
            user_id: userId,
            name: catName,
            description: "Auto-created during bulk import",
          });
        }
      }
    }

    let defaultCatId = existingCategories[0]?.id;
    if (!defaultCatId && newCategoriesToInsert.length === 0) {
      const generalCatId = generateId();
      newCategoriesToInsert.push({
        id: generalCatId,
        tenant_id: tenantId,
        user_id: userId,
        name: "General",
        description: "General category",
      });
      categoryNameToId.set("general", generalCatId);
      categoryIdSet.add(generalCatId);
      defaultCatId = generalCatId;
    }

    const productsToInsert: Array<{
      id: string;
      tenant_id: string;
      user_id: string;
      category_id: string;
      name: string;
      description: string | null;
      cost_price: number;
      unit_price: number;
      stock_quantity: number;
      version: number;
      barcode?: string | null;
      is_active: number;
    }> = [];

    for (const item of productsData) {
      const trimmedName = item.name?.trim();
      if (!trimmedName) continue;

      let targetCatId = item.category_id;
      if (!targetCatId || !categoryIdSet.has(targetCatId)) {
        const catName = item.category_name?.trim()?.toLowerCase();
        if (catName && categoryNameToId.has(catName)) {
          targetCatId = categoryNameToId.get(catName);
        } else {
          targetCatId = defaultCatId || Array.from(categoryIdSet)[0];
        }
      }

      if (!targetCatId) continue;

      productsToInsert.push({
        id: generateId(),
        tenant_id: tenantId,
        user_id: userId,
        category_id: targetCatId,
        name: trimmedName,
        description: item.description?.trim() || null,
        cost_price: Math.max(0, Number(item.cost_price) || 0),
        unit_price: Math.max(0, Number(item.unit_price) || 0),
        stock_quantity: Math.max(0, Number(item.stock_quantity) || 0),
        version: 1,
        barcode: item.barcode?.toString()?.trim() || null,
        is_active: item.active !== false ? 1 : 0,
      });
    }

    if (productsToInsert.length === 0) {
      return Result.fail("No valid products with required name found");
    }

    await db.transaction(async (trx) => {
      if (newCategoriesToInsert.length > 0) {
        for (let i = 0; i < newCategoriesToInsert.length; i += 50) {
          await trx("product_categories").insert(
            newCategoriesToInsert.slice(i, i + 50),
          );
        }
      }

      for (let i = 0; i < productsToInsert.length; i += 50) {
        await trx("products").insert(productsToInsert.slice(i, i + 50));
      }
    });

    revalidatePath("/admin/product");
    revalidatePath("/admin/product-category");
    revalidatePath("/admin/inventory");
    revalidatePath("/admin/stocks");

    if (newCategoriesToInsert.length > 0) {
      await emitSyncEvent({
        tenantId,
        entityType: "category",
        entityId: "bulk",
        action: "refresh",
        actorUserId: userId,
      });
    }
    await emitSyncEvent({
      tenantId,
      entityType: "product",
      entityId: "bulk",
      action: "refresh",
      payload: { count: productsToInsert.length },
      actorUserId: userId,
    });

    return Result.ok({
      createdCount: productsToInsert.length,
      newCategoriesCount: newCategoriesToInsert.length,
    });
  } catch (error: any) {
    console.error("Failed to bulk create products:", error);
    return Result.fail(error?.message || "Failed to bulk create products");
  }
}

// ──────────────────────────────────────────────────────────────
// Read functions (tenant-scoped)
// ──────────────────────────────────────────────────────────────

export async function getProducts(): Promise<Result<ProductCatalogView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const products: ProductCatalogView[] = await db("v_product_catalog")
      .select(
        "product_id as id",
        "product_name as name",
        "description",
        "cost_price",
        "unit_price",
        "stock_quantity",
        "stock_value",
        "category_name",
        "photo_url",
        "category_id",
        "barcode",
        "user_id",
        "user_name as created_by",
        "active",
        "created_at",
        "updated_at",
      )
      .where("tenant_id", tenantId)
      .orderBy("created_at", "desc");

    return Result.ok(products);
  } catch (error: any) {
    console.error("Failed to fetch products:", error);
    return Result.fail(error?.message || "Failed to fetch products");
  }
}

export async function getProduct(
  id: string,
): Promise<Result<ProductCatalogView>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const product = await db("v_product_catalog")
      .select(
        "product_id as id",
        "product_name as name",
        "description",
        "cost_price",
        "unit_price",
        "stock_quantity",
        "stock_value",
        "category_name",
        "category_id",
        "barcode",
        "user_id",
        "user_name as created_by",
        "active",
        "photo_url",
        "created_at",
        "updated_at",
      )
      .where({ product_id: id, tenant_id: tenantId })
      .first();

    if (!product) {
      return Result.fail("Product not found");
    }

    return Result.ok(product);
  } catch (error: any) {
    console.error("Failed to fetch product:", error);
    return Result.fail(error?.message || "Failed to fetch product");
  }
}

export async function findProductByBarcode(
  rawBarcode: string,
): Promise<Result<ProductCatalogView>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (!rawBarcode || typeof rawBarcode !== "string") {
      return Result.fail("Invalid barcode supplied");
    }

    const normalized = rawBarcode.trim();
    if (!normalized) {
      return Result.fail("Empty barcode supplied");
    }

    const product = await db("v_product_catalog")
      .select(
        "product_id as id",
        "product_name as name",
        "stock_quantity",
        "cost_price",
        "unit_price",
        "barcode",
      )
      .where({ barcode: normalized, tenant_id: tenantId })
      .first();

    if (!product) {
      return Result.fail(`No product found with barcode "${normalized}"`);
    }

    return Result.ok(product);
  } catch (error: any) {
    console.error("Failed to find product by barcode:", error);
    return Result.fail(error?.message || "Failed to lookup barcode");
  }
}

export async function getProductSales(
  id: string,
): Promise<Result<ProductSalesView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const products: ProductSalesView[] = await db("v_sale_items_detail")
      .select(
        "sale_item_id as id",
        "product_id",
        "product_name",
        "unit_price",
        "quantity",
        "subtotal",
        "customer_name",
        "sale_date",
        "user_id",
        "user_name as created_by",
      )
      .where({ product_id: id, tenant_id: tenantId })
      .orderBy("sale_date", "desc");

    return Result.ok(products);
  } catch (error: any) {
    console.error("Failed to fetch products:", error);
    return Result.fail(error?.message || "Failed to fetch products");
  }
}

// ──────────────────────────────────────────────────────────────
// Create / Update / Delete (tenant-scoped + atomic sync)
// ──────────────────────────────────────────────────────────────

export async function createProduct(
  productData: InsertProduct,
): Promise<Result<{ id: string }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (!productData.name || !productData.category_id) {
      return Result.fail("Product name and category are required");
    }
    if (productData.cost_price < 0 || productData.unit_price < 0) {
      return Result.fail("Prices cannot be negative");
    }
    if (productData.stock_quantity < 0) {
      return Result.fail("Stock quantity cannot be negative");
    }

    const category = await db("product_categories")
      .where({ id: productData.category_id, tenant_id: tenantId })
      .first();
    if (!category) {
      return Result.fail("Category not found");
    }

    let normalizedBarcode: string | null = null;
    if (productData.barcode && typeof productData.barcode === "string") {
      normalizedBarcode = productData.barcode.trim() || null;
      if (normalizedBarcode) {
        const existingWithBarcode = await db("products")
          .where({ barcode: normalizedBarcode, tenant_id: tenantId })
          .first();
        if (existingWithBarcode) {
          return Result.fail(
            `Barcode "${normalizedBarcode}" is already assigned to product "${existingWithBarcode.name}".`,
          );
        }
      }
    }

    const newId = generateId();
    await db("products").insert({
      id: newId,
      tenant_id: tenantId,
      user_id: currentUser.id,
      category_id: productData.category_id,
      name: productData.name,
      description: productData.description,
      cost_price: productData.cost_price,
      unit_price: productData.unit_price,
      stock_quantity: productData.stock_quantity,
      version: 1,
      barcode: normalizedBarcode,
      is_active: productData.active !== false ? 1 : 0,
      photo_url: productData.photo_url,
    });

    await createAuditLog({
      entity_type: "product",
      entity_id: newId,
      action: "create",
      new_values: {
        name: productData.name,
        description: productData.description,
        category_id: productData.category_id,
        cost_price: productData.cost_price,
        unit_price: productData.unit_price,
        stock_quantity: productData.stock_quantity,
        is_active: productData.active,
      },
    });

    await createActivityLog({
      activity_type: "product_created",
      title: `Product ${productData.name} created`,
      description: "New product added",
      metadata: { product_id: newId },
    });

    revalidatePath("/admin/product");
    await emitSyncEvent({
      tenantId,
      entityType: "product",
      entityId: newId,
      action: "upsert",
      actorUserId: currentUser.id,
    });

    return Result.ok({ id: newId });
  } catch (error: any) {
    console.error("Failed to create product:", error);
    return Result.fail(error?.message || "Failed to create product");
  }
}

export async function updateProduct(
  productData: Partial<InsertProduct> & { id: string },
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

    const current = await db("products")
      .where({ id: productData.id, tenant_id: tenantId })
      .first();
    if (!current) {
      return Result.fail("Product not found");
    }

    const updateFields: any = {};
    if (productData.name !== undefined) updateFields.name = productData.name;
    if (productData.description !== undefined)
      updateFields.description = productData.description;
    if (productData.category_id !== undefined) {
      const cat = await db("product_categories")
        .where({ id: productData.category_id, tenant_id: tenantId })
        .first();
      if (!cat) return Result.fail("Category not found");
      updateFields.category_id = productData.category_id;
    }
    if (productData.cost_price !== undefined) {
      if (productData.cost_price < 0)
        return Result.fail("Cost price cannot be negative");
      updateFields.cost_price = productData.cost_price;
    }
    if (productData.unit_price !== undefined) {
      if (productData.unit_price < 0)
        return Result.fail("Unit price cannot be negative");
      updateFields.unit_price = productData.unit_price;
    }
    if (productData.stock_quantity !== undefined) {
      if (productData.stock_quantity < 0)
        return Result.fail("Stock quantity cannot be negative");
      updateFields.stock_quantity = productData.stock_quantity;
    }

    if (productData.barcode !== undefined) {
      if (productData.barcode && typeof productData.barcode === "string") {
        const normalized = productData.barcode.trim();
        if (normalized) {
          const existingWithBarcode = await db("products")
            .where({ barcode: normalized, tenant_id: tenantId })
            .whereNot("id", productData.id)
            .first();
          if (existingWithBarcode) {
            return Result.fail(
              `Barcode "${normalized}" is already assigned to product "${existingWithBarcode.name}".`,
            );
          }
          updateFields.barcode = normalized;
        } else {
          updateFields.barcode = null;
        }
      } else {
        updateFields.barcode = null;
      }
    }

    if (productData.photo_url !== undefined) {
      updateFields.photo_url = productData.photo_url || null;
    }

    if (productData.active !== undefined) {
      updateFields.is_active = productData.active ? 1 : 0;
    }

    if (Object.keys(updateFields).length === 0) {
      return Result.fail("No fields to update");
    }

    updateFields.version = db.raw("COALESCE(version, 1) + 1");
    updateFields.updated_at = new Date().toISOString();

    const updatedCount = await db("products")
      .where({ id: productData.id, tenant_id: tenantId })
      .update(updateFields);

    if (updatedCount === 0) {
      return Result.fail("Product not found or no changes made");
    }

    await createAuditLog({
      entity_type: "product",
      entity_id: productData.id,
      action: "update",
      old_values: {
        name: current.name,
        description: current.description,
        category_id: current.category_id,
        cost_price: current.cost_price,
        unit_price: current.unit_price,
        barcode: current.barcode,
        stock_quantity: current.stock_quantity,
        is_active: current.is_active,
      },
      new_values: {
        name: updateFields.name ?? current.name,
        description: updateFields.description ?? current.description,
        barcode:
          updateFields.barcode !== undefined
            ? updateFields.barcode
            : current.barcode,
        category_id: updateFields.category_id ?? current.category_id,
        cost_price: updateFields.cost_price ?? current.cost_price,
        unit_price: updateFields.unit_price ?? current.unit_price,
        stock_quantity:
          updateFields.stock_quantity ?? current.stock_quantity,
        is_active:
          updateFields.is_active !== undefined
            ? updateFields.is_active
            : current.is_active,
      },
    });

    await createActivityLog({
      activity_type: "product_updated",
      title: `Product ${current.name} updated`,
      description: "Product details modified",
      metadata: { product_id: productData.id },
    });

    revalidatePath(`/admin/product/${productData.id}`);
    revalidatePath("/admin/product");
    await emitSyncEvent({
      tenantId,
      entityType: "product",
      entityId: productData.id,
      action: "upsert",
      payload:
        productData.photo_url !== undefined
          ? { photoUrl: updateFields.photo_url ?? "" }
          : undefined,
      actorUserId: userId,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to update product:", error);
    return Result.fail(error?.message || "Failed to update product");
  }
}

export async function restockProduct(
  productData: ReStockProduct,
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

    const delta = Number(productData.stock_quantity);
    if (!Number.isFinite(delta) || delta <= 0) {
      return Result.fail("Restock quantity must be positive");
    }

    const trx = await db.transaction();
    let syncRecord: SyncEventRecord | null = null;
    let currentProduct: any;
    let nextStock = 0;

    try {
      currentProduct = await trx("products")
        .where({ id: productData.id, tenant_id: tenantId })
        .first();
      if (!currentProduct) {
        await trx.rollback();
        return Result.fail("Product not found");
      }

      const nowIso = new Date().toISOString();
      await trx("products")
        .where({ id: productData.id, tenant_id: tenantId })
        .update({
          stock_quantity: db.raw("stock_quantity + ?", [delta]),
          version: db.raw("COALESCE(version, 1) + 1"),
          updated_at: nowIso,
        });

      const refreshed = await trx("products")
        .select("stock_quantity", "version")
        .where({ id: productData.id, tenant_id: tenantId })
        .first();

      nextStock = Number(refreshed?.stock_quantity ?? 0);

      syncRecord = await insertSyncEvent(trx, {
        tenantId,
        entityType: "product",
        entityId: productData.id,
        action: "stock_delta",
        payload: {
          delta,
          stock_quantity: nextStock,
          version: Number(refreshed?.version ?? 1),
        },
        actorUserId: userId,
      });

      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    if (syncRecord) {
      publishSyncEvent(syncRecord);
    }

    await createAuditLog({
      entity_type: "product",
      entity_id: productData.id,
      action: "update",
      old_values: { stock_quantity: currentProduct.stock_quantity },
      new_values: { stock_quantity: nextStock },
    });

    await createActivityLog({
      activity_type: "product_restocked",
      title: `Product ${currentProduct.name} restocked`,
      description: `Added ${delta} unit(s) to stock`,
      metadata: { product_id: productData.id, delta },
    });

    revalidatePath(`/admin/product/${productData.id}`);
    revalidatePath("/admin/product");

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to restock product:", error);
    return Result.fail(error?.message || "Failed to restock product");
  }
}

export async function removeProduct(
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

    const product = await db("products")
      .where({ id, tenant_id: tenantId })
      .first();
    if (!product) {
      return Result.fail("Product not found");
    }

    const deletedCount = await db("products")
      .where({ id, tenant_id: tenantId })
      .del();
    if (deletedCount === 0) {
      return Result.fail("Product not found");
    }

    await createAuditLog({
      entity_type: "product",
      entity_id: id,
      action: "delete",
      old_values: {
        name: product.name,
        category_id: product.category_id,
        cost_price: product.cost_price,
        unit_price: product.unit_price,
        stock_quantity: product.stock_quantity,
      },
    });

    await createActivityLog({
      activity_type: "product_deleted",
      title: `Product ${product.name} deleted`,
      description: "Product permanently removed",
      metadata: { product_id: id },
    });

    revalidatePath("/admin/product");
    await emitSyncEvent({
      tenantId,
      entityType: "product",
      entityId: id,
      action: "delete",
      actorUserId: currentUser.id,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete product:", error);
    return Result.fail(error?.message || "Failed to delete product");
  }
}

export async function updateProductsStatus(
  ids: string[],
  active: boolean,
): Promise<Result<{ updatedCount: number }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (!ids || ids.length === 0) {
      return Result.fail("No product IDs provided");
    }

    const updated = await db("products")
      .where("tenant_id", tenantId)
      .whereIn("id", ids)
      .update({
        is_active: active ? 1 : 0,
        version: db.raw("COALESCE(version, 1) + 1"),
        updated_at: new Date().toISOString(),
      });

    await createAuditLog({
      entity_type: "products",
      entity_id: ids.join(","),
      action: "update",
      old_values: { ids },
      new_values: { is_active: active ? 1 : 0 },
    });

    await createActivityLog({
      activity_type: "products_status_updated_bulk",
      title: `Bulk status update for ${ids.length} product(s)`,
      description: `Updated status to ${active ? "Active" : "Disabled"} for ${ids.length} product(s)`,
      metadata: { ids, active },
    });

    revalidatePath("/admin/product");
    revalidatePath("/admin/inventory");
    await emitSyncEvent({
      tenantId,
      entityType: "product",
      entityId: ids.join(","),
      action: "refresh",
      actorUserId: currentUser.id,
    });

    return Result.ok({ updatedCount: updated });
  } catch (error: any) {
    console.error("Failed to update product statuses:", error);
    return Result.fail(error?.message || "Failed to update product status");
  }
}

export async function removeProducts(
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

    const products = await db("products")
      .where("tenant_id", tenantId)
      .whereIn("id", ids);
    if (products.length === 0) {
      return Result.fail("No products found");
    }

    const deleted = await db("products")
      .where("tenant_id", tenantId)
      .whereIn("id", ids)
      .del();

    await createAuditLog({
      entity_type: "products",
      entity_id: ids.join(","),
      action: "delete",
      old_values: { ids },
    });

    await createActivityLog({
      activity_type: "products_deleted_bulk",
      title: `Bulk deletion of ${ids.length} products`,
      description: "Multiple products removed",
      metadata: { ids },
    });

    revalidatePath("/admin/product");
    revalidatePath("/admin/inventory");
    await emitSyncEvent({
      tenantId,
      entityType: "product",
      entityId: ids.join(","),
      action: "refresh",
      actorUserId: currentUser.id,
    });

    return Result.ok({ deletedCount: deleted });
  } catch (error: any) {
    console.error("Failed to delete products:", error);
    return Result.fail(error?.message || "Failed to delete products");
  }
}
