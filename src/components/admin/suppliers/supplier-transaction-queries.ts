import { queryOptions } from "@tanstack/react-query";

import { getSuppliers } from "@/actions/suppliers";
import { getSupplierStats } from "@/actions/supplier-transactions";
import type { SupplierInfoView } from "@/types/globals";

/**
 * Query keys for the supplier transactions feature. They live in their own file so the
 * listing page and the record modal can share them without importing each other.
 *
 * Anything that changes supplier transactions elsewhere (a payment modal, a supplier
 * page) can call `invalidateQueries({ queryKey: supplierTransactionKeys.lists })`.
 */
export const supplierTransactionKeys = {
  lists: ["supplier-transactions", "list"] as const,
  list: (supplierId?: string) => ["supplier-transactions", "list", supplierId ?? "all"] as const,
  /** Every cached transaction detail. Invalidate this if a payment changes a transaction elsewhere. */
  details: ["supplier-transactions", "detail"] as const,
  detail: (id: string) => ["supplier-transactions", "detail", id] as const,
  supplierOptions: ["supplier-transactions", "supplier-options"] as const,
  productOptions: ["supplier-transactions", "product-options"] as const,
  categoryOptions: ["supplier-transactions", "category-options"] as const,
  stats: (supplierId: string) => ["supplier-transactions", "stats", supplierId] as const,
};

export interface SupplierStats {
  totalPurchases: number;
  totalSpent: number;
  productsSupplied: number;
  lastOrderDate: string | null;
}

const EMPTY_STATS: SupplierStats = {
  totalPurchases: 0,
  totalSpent: 0,
  productsSupplied: 0,
  lastOrderDate: null,
};

/** A supplier's purchase stats, used on their profile page. */
export const supplierStatsQuery = (supplierId: string) =>
  queryOptions({
    queryKey: supplierTransactionKeys.stats(supplierId),
    queryFn: async () => {
      const res = await getSupplierStats(supplierId);
      if (!res.success) throw new Error(res.message || "Couldn't load supplier stats.");
      return res.data ?? EMPTY_STATS;
    },
    staleTime: 30_000,
  });

// Stable reference so `?? []` doesn't create a new array on every call.
const NO_SUPPLIERS: SupplierInfoView[] = [];

/** Suppliers for dropdowns. One definition, so the page and the modal share one cache entry. */
export const supplierOptionsQuery = () =>
  queryOptions({
    queryKey: supplierTransactionKeys.supplierOptions,
    queryFn: async () => {
      const res = await getSuppliers();
      if (!res.success) throw new Error(res.message || "Couldn't load suppliers.");
      return res.data ?? NO_SUPPLIERS;
    },
    staleTime: 5 * 60_000,
  });