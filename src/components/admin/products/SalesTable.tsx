"use client";

import { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currencyFormatter } from "@/config/formatter";
import { ProductSalesView } from "@/types/globals";

const countFormat = new Intl.NumberFormat("en-GH");

function formatDate(value: unknown, pattern = "PPP") {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : format(date, pattern);
}


interface SalesTableProps {
  sales: ProductSalesView[];
}

export function SalesTable({ sales }: SalesTableProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredSales = useMemo(() => {
    if (!search.trim()) return sales;
    const query = search.toLowerCase();
    return sales.filter((sale) => {
      const customer = (sale.customer_name || "Guest").toLowerCase();
      const soldBy = (sale.created_by || "System").toLowerCase();
      return customer.includes(query) || soldBy.includes(query);
    });
  }, [sales, search]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [filteredSales, currentPage, pageSize]);

  return (
    <div className="space-y-4">
      {/* Search and Rows-per-page Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Filter by customer or seller..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(val) => {
              setPageSize(Number(val));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5 sm:pl-6">Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="pr-5 sm:pr-6">Sold by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No results found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedSales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="pl-5 whitespace-nowrap sm:pl-6">
                    {formatDate(sale.sale_date) ?? "Unknown"}
                  </TableCell>
                  <TableCell>{sale.customer_name || "Guest"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {countFormat.format(Number(sale.quantity) || 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currencyFormatter(sale.unit_price)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {currencyFormatter(sale.subtotal)}
                  </TableCell>
                  <TableCell className="pr-5 text-muted-foreground sm:pr-6">
                    {sale.created_by || "System"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {filteredSales.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
          <div>
            Showing {Math.min((currentPage - 1) * pageSize + 1, filteredSales.length)} to{" "}
            {Math.min(currentPage * pageSize, filteredSales.length)} of {filteredSales.length} entries
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-xs font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}