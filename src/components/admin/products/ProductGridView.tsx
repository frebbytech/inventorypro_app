/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { ProductCatalogView } from "@/types/globals";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RestockProduct } from "./RestockProduct";
import { currencyFormatter } from "@/config/formatter";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  Box,
  Eye,
  Layers2,
  MoreVertical,
  Package,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface ProductGridViewProps {
  data: ProductCatalogView[];
  selectedIds?: string[];
  onToggleSelect?: (id: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  isAllSelected?: boolean;
}

export function ProductGridView({
  data,
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  isAllSelected = false,
}: ProductGridViewProps) {
  const router = useRouter();
  const [restockItem, setRestockItem] = useState<ProductCatalogView | null>(
    null,
  );
  const [restockOpen, setRestockOpen] = useState(false);

  const handleOpenRestock = (product: ProductCatalogView) => {
    setRestockItem(product);
    setRestockOpen(true);
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed rounded-lg p-8 text-center bg-muted/10">
        <Package className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <h3 className="text-base font-semibold text-foreground">
          No products found
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          No products match your current search or filter criteria. Try
          adjusting the filters above.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Restock Dialog */}
      {restockItem && (
        <RestockProduct
          open={restockOpen}
          setOpen={setRestockOpen}
          product={restockItem}
        />
      )}

      {/* Select All Bar (if select handler provided) */}
      {onSelectAll && data.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-lg border text-sm text-muted-foreground mb-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all-grid"
              checked={isAllSelected}
              onCheckedChange={(checked) => onSelectAll(!!checked)}
            />
            <label
              htmlFor="select-all-grid"
              className="cursor-pointer font-medium select-none text-foreground"
            >
              Select All on this page ({data.length} items)
            </label>
          </div>
          {selectedIds.length > 0 && (
            <span className="font-semibold text-primary">
              {selectedIds.length} selected
            </span>
          )}
        </div>
      )}

      {/* Grid Container */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {data.map((product) => {
          const isSelected = selectedIds.includes(product.id);
          const stock = Number(product.stock_quantity) || 0;
          const costPrice = Number(product.cost_price) || 0;
          const unitPrice = Number(product.unit_price) || 0;
          const stockVal = Number(product.stock_value) || stock * unitPrice;
          const profit = unitPrice - costPrice;
          const margin =
            costPrice > 0 ? Math.round((profit / costPrice) * 100) : 0;
          const isActive = Boolean(product.active);

          return (
            <Card
              key={product.id}
              className={cn(
                "group relative flex flex-col justify-between overflow-hidden transition-all duration-200 hover:shadow-md border",
                isSelected
                  ? "border-primary ring-1 ring-primary/40 bg-primary/[0.02]"
                  : "hover:border-primary/40",
              )}
            >
              {/* Card Header & Badges */}
              <CardHeader className="p-3.5 pb-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  {/* Selection checkbox */}
                  <div className="flex items-center gap-2">
                    {onToggleSelect && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          onToggleSelect(product.id, !!checked)
                        }
                        aria-label={`Select ${product.name}`}
                      />
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0 font-medium capitalize",
                        isActive
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                          : "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
                      )}
                    >
                      {isActive ? "Active" : "Disabled"}
                    </Badge>
                  </div>

                  {/* Actions Dropdown */}
                  <DropdownMenu modal>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(`/admin/product/${product.id}`)
                        }
                      >
                        <Eye className="mr-2 h-3.5 w-3.5" /> View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleOpenRestock(product)}
                      >
                        <Layers2 className="mr-2 h-3.5 w-3.5" /> Restock
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Product Name & Category */}
                <div className="flex items-start gap-3 pt-1">
                  <div className="h-12 w-12 rounded-lg border bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                    {product.photo_url ? (
                      <img
                        src={product.photo_url || ""}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground/40" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-muted-foreground truncate block">
                      {product.category_name || "Uncategorized"}
                    </span>

                    <h4
                      className="font-semibold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors cursor-pointer"
                      onClick={() =>
                        router.push(`/admin/product/${product.id}`)
                      }
                      title={product.name}
                    >
                      {product.name}
                    </h4>
                  </div>
                </div>
              </CardHeader>

              {/* Card Content: Details & Metrics */}
              <CardContent className="p-3.5 pt-0 space-y-3">
                {product.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2rem]">
                    {product.description}
                  </p>
                )}

                {/* Pricing & Profit block */}
                <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-muted/40 text-sm">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">
                      Unit Price
                    </span>
                    <span className="font-bold text-foreground">
                      {currencyFormatter(unitPrice)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">
                      Cost Price
                    </span>
                    <span className="font-medium text-muted-foreground">
                      {currencyFormatter(costPrice)}
                    </span>
                  </div>
                </div>

                {/* Stock Level & Stock Value */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Box className="h-3 w-3" /> Stock:
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[11px] font-semibold px-2 py-0.5",
                        stock === 0
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                          : stock <= 5
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                      )}
                    >
                      {stock === 0 ? "Out of Stock" : `${stock} units`}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Inventory Value:</span>
                    <span className="font-semibold text-foreground">
                      {currencyFormatter(stockVal)}
                    </span>
                  </div>
                </div>
              </CardContent>

              {/* Card Footer: Quick Actions */}
              <CardFooter className="p-3.5 pt-2 border-t bg-muted/20 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-sm gap-1.5"
                  onClick={() => router.push(`/admin/product/${product.id}`)}
                >
                  <Eye className="h-3.5 w-3.5" /> Details
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 h-8 text-sm gap-1.5"
                  onClick={() => handleOpenRestock(product)}
                >
                  <Layers2 className="h-3.5 w-3.5" /> Restock
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </>
  );
}
