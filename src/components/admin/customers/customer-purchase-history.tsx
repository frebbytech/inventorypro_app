"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currencyFormatter } from "@/config/formatter";
import CustomerSalesItemsTable from "./CustomerSalesItemsTable";

// Matches the loose shape `getCustomerSaleByCustomerID` returns.
interface CustomerSale {
  id: string;
  sale_id?: string;
  sale_date?: string | Date;
  created_at?: string | Date;
  item_count?: number;
  total_amount?: number | string;
  payment_mode?: string;
  status?: string;
}

interface CustomerPurchaseHistoryProps {
  sales: CustomerSale[];
  pageSize?: number;
}

const PAGE_SIZE_DEFAULT = 10;

// Fixed locale avoids server/client hydration mismatches.
const countFormat = new Intl.NumberFormat("en-GH");

function formatDate(value: unknown) {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-GH", { year: "numeric", month: "long", day: "numeric" });
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

/** Matches a sale's id, date, payment mode, status or total against the query. */
function matchesQuery(sale: CustomerSale, query: string) {
  const saleId = String(sale.sale_id || sale.id || "");
  const haystack = [
    saleId,
    formatDate(sale.sale_date || sale.created_at) ?? "",
    sale.payment_mode ?? "",
    sale.status ?? "",
    String(sale.total_amount ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export default function CustomerPurchaseHistory({
  sales,
  pageSize = PAGE_SIZE_DEFAULT,
}: CustomerPurchaseHistoryProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? sales.filter((sale) => matchesQuery(sale, query)) : sales;
  }, [sales, search]);

  const pageCount = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  // If the list shrinks (a search narrows it, or a different customer's data
  // arrives) so the current page no longer exists, fall back to the last real
  // page instead of showing nothing.
  const currentPage = Math.min(page, pageCount);

  // A fresh search should always start from the top of its own results.
  useEffect(() => {
    setPage(1);
  }, [search, sales]);

  const pageSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [filteredSales, currentPage, pageSize]);

  const rangeStart = filteredSales.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filteredSales.length);
  const isFiltered = search.trim() !== "";

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Purchase history</h2>
          <p className="text-sm text-muted-foreground">Every sale made by this customer.</p>
        </div>

        {sales.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Search purchase history"
              placeholder="Search sale, date, payment…"
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
          <p className="text-sm">No purchases recorded for this customer yet.</p>
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">No sales match "{search.trim()}".</p>
          <Button variant="outline" size="sm" onClick={() => setSearch("")}>
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5 sm:pl-6">Sale</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-5 text-right sm:pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageSales.map((sale) => {
                  const saleId = sale.sale_id || sale.id;
                  return (
                    <TableRow key={saleId}>
                      <TableCell className="pl-5 font-medium sm:pl-6">{saleId}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(sale.sale_date || sale.created_at) ?? "Unknown"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {countFormat.format(Number(sale.item_count) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {currencyFormatter(sale.total_amount)}
                      </TableCell>
                      <TableCell>{sale.payment_mode ? capitalize(sale.payment_mode) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{capitalize(sale.status || "completed")}</Badge>
                      </TableCell>
                      <TableCell className="pr-5 text-right sm:pr-6">
                        <CustomerSalesItemsTable id={sale?.sale_id} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {(pageCount > 1 || isFiltered) && (
            <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-3 sm:flex-row sm:px-6">
              <p className="text-sm text-muted-foreground tabular-nums">
                {rangeStart}–{rangeEnd} of {countFormat.format(filteredSales.length)}
                {isFiltered && ` (filtered from ${countFormat.format(sales.length)})`}
              </p>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <p aria-live="polite" className="min-w-20 text-center text-sm text-muted-foreground tabular-nums">
                    Page {currentPage} of {pageCount}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= pageCount}
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
