"use client";

import { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ProductCatalogView } from "@/types/globals";

import { Button } from "@/components/ui/button";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { columns as posTableColumns } from "@/sections/sales/product-tables/columns";
import { Package, RotateCcw } from "lucide-react";
import { useCart } from "../providers/cart-provider";
import { cn } from "@/lib/utils";

interface POSProductTableViewProps {
  displayedProducts: ProductCatalogView[];
  resetFilters: () => void;
  isAnyFilterActive: boolean;
}

export function POSProductTableView({
  displayedProducts,
  resetFilters,
  isAnyFilterActive,
}: POSProductTableViewProps) {
  const { cartItems } = useCart();

  // Filter items by client-side stock filter if applicable

  const table = useReactTable({
    data: displayedProducts,
    columns: posTableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Quick lookup of "how many of this product are already in the cart"
  const cartQuantities = useMemo(() => {
    const map = new Map<string, number>();
    cartItems.forEach((item) => map.set(item.id, item.quantity));
    return map;
  }, [cartItems]);

  return (
    <>
      {/* Grid View */}
      {displayedProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[320px] rounded-xl border border-dashed p-8 text-center bg-card">
          <Package className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <h4 className="text-base font-semibold text-foreground">
            No products found
          </h4>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            No products matched your search or category filter. Try clearing
            your filters.
          </p>
          {isAnyFilterActive && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 text-sm gap-1.5"
              onClick={resetFilters}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear All Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden grid grid-cols-1">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => {
                const cartQty = cartQuantities.get(row.original.id) || 0;
                const inCart = cartQty > 0;
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      "relative overflow-visible",
                      inCart
                        ? "border-primary/60 ring-1 ring-primary/20"
                        : "hover:border-primary/50",
                    )}
                  >
                  
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                          {inCart && (
                      <div className="absolute -top-2 right-2 z-20 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground ">
                        {cartQty}
                      </div>
                    )}
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
