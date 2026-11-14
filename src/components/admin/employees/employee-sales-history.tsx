"use client";

import { Search, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTableSearch } from "@/hooks/use-table-search";
import EmployeeSalesTable from "./EmployeeSalesTable";
import { EmployeeSale } from "@/types/globals";

// The exact fields aren't known here (rendering is left to EmployeeSalesTable),
// so searching is done defensively over whichever of these happen to exist.


// sale_id: '01a02038-38e5-77f9-96fe-29cbd774e749',
// customer_id: '01a01d17-799e-761e-ade6-4478456fbaf8',
// user_id: '01a02036-07c3-73dd-b6ac-3ce8da8dbc9a',
// receipt_number: 'INVP-19D7C656CF2',
// customer_name: 'Customer',
// phonenumber: '0543772591',
// user_name: 'nana',
// sale_date: '2026-08-20 17:29:10',
// total_amount: 65.96,
// payment_mode: 'cash',
// status: 'completed',
// details: '',
// item_count: 4,
// created_at: '2026-08-20 17:29:10',
// updated_at: '2026-08-20 17:29:10'

interface EmployeeSalesHistoryProps {
  sales: EmployeeSale[];
  pageSize?: number;
}

const countFormat = new Intl.NumberFormat("en-GH");

function matchesQuery(sale: EmployeeSale, query: string) {
  const dateText = (() => {
    const date = new Date((sale.sale_date ?? sale.created_at) as string);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleDateString("en-GH", { dateStyle: "long" });
  })();

  const haystack = [
    sale.sale_id,
    sale.customer_id,
    sale.customer_name,
    sale.payment_mode,
    sale.status,
    sale.total_amount,
    dateText,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export default function EmployeeSalesHistory({
  sales,
  pageSize = 10,
}: EmployeeSalesHistoryProps) {
  const {
    search,
    setSearch,
    page,
    setPage,
    pageCount,
    pageItems,
    filteredTotal,
    rangeStart,
    rangeEnd,
    isFiltered,
  } = useTableSearch({ items: sales, matches: matchesQuery, pageSize });

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Sales history
          </h2>
          <p className="text-sm text-muted-foreground">
            All sales completed by this employee.
          </p>
        </div>

        {sales.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Search sales"
              placeholder="Search sale, customer, date…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </header>

      {sales.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <ShoppingBag aria-hidden className="size-8 opacity-40" />
          <p className="text-sm">No sales recorded for this employee yet.</p>
        </div>
      ) : filteredTotal === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No sales match "{search.trim()}".
          </p>
          <Button variant="outline" size="sm" onClick={() => setSearch("")}>
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <div className="p-5 pt-0 sm:p-6 sm:pt-0">
            <EmployeeSalesTable sales={pageItems} />
          </div>

          {(pageCount > 1 || isFiltered) && (
            <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-3 sm:flex-row sm:px-6">
              <p className="text-sm text-muted-foreground tabular-nums">
                {rangeStart}–{rangeEnd} of {countFormat.format(filteredTotal)}
                {isFiltered &&
                  ` (filtered from ${countFormat.format(sales.length)})`}
              </p>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <p
                    aria-live="polite"
                    className="min-w-20 text-center text-sm text-muted-foreground tabular-nums"
                  >
                    Page {page} of {pageCount}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
