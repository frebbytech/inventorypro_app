"use client";

import { useMemo, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { ProductGridView } from "@/components/admin/products/ProductGridView";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table/data-table";
import { DataTableFilterBox } from "@/components/ui/table/data-table-filter-box";
import { DataTableResetFilter } from "@/components/ui/table/data-table-reset-filter";
import { DataTableSearch } from "@/components/ui/table/data-table-search";
import { currencyFormatter } from "@/config/formatter";
import { cn } from "@/lib/utils";
import type { ProductCatalogView } from "@/types/globals";
import { columns, getStockStatus } from "./columns";
import { useProductTableFilters } from "./use-product-table-filters";

/* -------------------------------------------------------------------------- */
/*  Helpers (module scope)                                                    */
/* -------------------------------------------------------------------------- */

// Fixed locale avoids server/client hydration mismatches.
const countFormat = new Intl.NumberFormat("en-GH");

/** "Milk, Bread and 3 more" */
function summarizeNames(products: ProductCatalogView[], max = 2) {
  if (products.length === 0) return "None on this page";
  const names = products.slice(0, max).map((p) => p.name);
  const rest = products.length - names.length;
  return rest > 0 ? `${names.join(", ")} and ${rest} more` : names.join(", ");
}

function StatCell({
  label,
  figure,
  caption,
  dotClassName,
}: {
  label: string;
  figure: ReactNode;
  caption: string;
  dotClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col bg-card p-5 sm:p-6">
      <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {dotClassName && <span aria-hidden className={cn("size-1.5 rounded-full", dotClassName)} />}
        {label}
      </dt>
      <dd className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">
        {figure}
      </dd>
      <dd className="mt-auto truncate pt-4 text-sm text-muted-foreground" title={caption}>
        {caption}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function ProductTable({
  data,
  totalData,
  categoryList,
}: {
  data: ProductCatalogView[];
  totalData: number;
  categoryList: { label: string; value: string }[];
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();



  const {
    categoriesFilter,
    setCategoriesFilter,
    isAnyFilterActive,
    resetFilters,
    searchQuery,
    setPage,
    setSearchQuery,
  } = useProductTableFilters();

  // One pass over the rows. Values are price x quantity on hand, not the bare prices.
  // `data` is the current page only, so these describe this page, not the whole catalogue.
  const { costValue, retailValue, lowStock, outOfStock } = useMemo(() => {
    let costValue = 0;
    let retailValue = 0;
    const lowStock: ProductCatalogView[] = [];
    const outOfStock: ProductCatalogView[] = [];

    for (const product of data) {
      const qty = Number(product?.stock_quantity) || 0;
      costValue += (Number(product?.cost_price) || 0) * qty;
      retailValue += (Number(product?.unit_price) || 0) * qty;

      const status = getStockStatus(qty);
      if (status === "low-stock") lowStock.push(product);
      else if (status === "out-of-stock") outOfStock.push(product);
    }

    return { costValue, retailValue, lowStock, outOfStock };
  }, [data]);

  const scope =
    data.length >= totalData
      ? "All products"
      : `This page, ${countFormat.format(data.length)} of ${countFormat.format(totalData)}`;

  return (
    <div className="space-y-6">
      <section aria-label="Inventory summary">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
          <StatCell label="Stock at cost" figure={currencyFormatter(costValue)} caption={scope} />
          <StatCell label="Stock at selling price" figure={currencyFormatter(retailValue)} caption={scope} />
          <StatCell
            label="Low stock"
            figure={countFormat.format(lowStock.length)}
            caption={summarizeNames(lowStock)}
            dotClassName={lowStock.length > 0 ? "bg-amber-500" : undefined}
          />
          <StatCell
            label="Out of stock"
            figure={countFormat.format(outOfStock.length)}
            caption={summarizeNames(outOfStock)}
            dotClassName={outOfStock.length > 0 ? "bg-rose-500" : undefined}
          />
        </dl>
      </section>

      <DataTable
        tableName="products"
        columns={columns}
        data={data}
        totalItems={totalData}
        renderGridView={(gridProps) => (
          <ProductGridView
            data={gridProps.data}
            selectedIds={gridProps.selectedIds}
            onToggleSelect={gridProps.onToggleSelect}
            onSelectAll={gridProps.onSelectAll}
            isAllSelected={gridProps.isAllSelected}
          />
        )}
        tableFilter={
          <div className="flex w-full flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <DataTableSearch
                searchKey="name"
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                setPage={setPage}
              />
              <DataTableFilterBox
                filterKey="categories"
                title="Categories"
                options={categoryList}
                setFilterValue={setCategoriesFilter}
                filterValue={categoriesFilter}
              />
              <DataTableResetFilter isFilterActive={isAnyFilterActive} onReset={resetFilters} />
            </div>

            <Button
              variant="outline"
              className="gap-2"
              disabled={isRefreshing}
              onClick={() => startTransition(() => router.refresh())}
            >
              <RefreshCw aria-hidden className={cn("size-4", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />
    </div>
  );
}
