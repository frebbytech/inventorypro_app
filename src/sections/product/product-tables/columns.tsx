"use client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";
import { ProductCatalogView } from "@/types/globals";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { currencyFormatter } from "@/config/formatter";
import { AlertTriangle, XCircle, CheckCircle2, Package } from "lucide-react";
import { DataTableColumnHeader } from "@/components/ui/table/data-table-column-header";

// Keep this in one place so the table, summary badges, and any future
// reorder logic all agree on what "low" means.
export const LOW_STOCK_THRESHOLD = 5;

export type StockStatus = "out-of-stock" | "low-stock" | "in-stock";

export function getStockStatus(quantity: number): StockStatus {
  if (quantity <= 0) return "out-of-stock";
  if (quantity <= LOW_STOCK_THRESHOLD) return "low-stock";
  return "in-stock";
}

const STOCK_STATUS_CONFIG: Record<
  StockStatus,
  { label: string; className: string; icon: typeof AlertTriangle }
> = {
  "out-of-stock": {
    label: "Out of Stock",
    className: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
    icon: XCircle,
  },
  "low-stock": {
    label: "Low Stock",
    className:
      "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
    icon: AlertTriangle,
  },
  "in-stock": {
    label: "In Stock",
    className:
      "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
    icon: CheckCircle2,
  },
};

export const columns: ColumnDef<ProductCatalogView>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "photo",
    header: "PHOTO",
    cell: ({ row }) => {
      const img = row.original.photo_url || row.original.image;
      return (
        <div className="h-10 w-10 rounded-lg border bg-muted shrink-0 overflow-hidden flex items-center justify-center">
          {img ? (
            <img
              src={img}
              alt={row.original.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <Package className="h-4 w-4 text-muted-foreground/50" />
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="NAME" />
    ),
  },
  {
    accessorKey: "barcode",
    header: "BARCODE",
  },
  {
    accessorKey: "category_name",
    header: "CATEGORY",
  },
  {
    accessorKey: "cost_price",
    header: "COST PRICE",
  },
  {
    accessorKey: "unit_price",
    header: "UNIT PRICE",
  },
  {
    accessorKey: "description",
    header: "DESCRIPTION",

    cell: ({ row }) => {
      const description = row.original.description;
      if (!description) {
        return <span className="text-muted-foreground">—</span>;
      }

      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="max-w-[220px] truncate text-sm cursor-default">
                {description}
              </p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-sm">{description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  {
    accessorKey: "stock_quantity",
    header: "STOCK",
  },
  {
    id: "stock_status",
    header: "STOCK STATUS",
    // Sort/filter directly off quantity rather than the derived label,
    // so "low stock" rows cluster correctly even as the threshold changes.
    accessorFn: (row) => row.stock_quantity ?? 0,
    cell: ({ row }) => {
      const qty = Number(row.original.stock_quantity) || 0;
      const status = getStockStatus(qty);
      const { label, className, icon: Icon } = STOCK_STATUS_CONFIG[status];

      return (
        <Badge
          variant="outline"
          className={cn("gap-1 text-sm font-medium", className)}
        >
          <Icon className="size-3" />
          {label}
        </Badge>
      );
    },
  },
  {
    accessorKey: "stock_value",
    header: "VALUE",
    cell: (info) => {
      const value = info.row.original.stock_value;
      return currencyFormatter(value);
    },
  },
  {
    accessorKey: "active",
    header: "Status",
    cell: ({ row }) => {
      return (
        <Badge
          variant="outline"
          className={cn(
            "text-sm w-15 capitalize text-white",
            row.original.active ? " bg-green-500" : " bg-red-500",
          )}
        >
          {row.original.active ? "Active" : "Disabled"}
        </Badge>
      );
    },
  },

  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
