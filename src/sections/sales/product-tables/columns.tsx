"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ProductCatalogView } from "@/types/globals";
import { AddToCart } from "@/components/sales/AddToCart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { currencyFormatter } from "@/config/formatter";
import { useCart } from "@/components/providers/cart-provider";
import { cn } from "@/lib/utils";
import { Boxes, Minus, Package, Plus, Tag, Wallet } from "lucide-react";
import { DataTableColumnHeader } from "@/components/ui/table/data-table-column-header";

// Small header helper — keeps every header label consistently iconed,
// uppercase, and aligned without repeating the same classNames everywhere.
// function ColumnHeader({
//   icon: Icon,
//   label,
//   align = "left",
// }: {
//   icon: typeof Package;
//   label: string;
//   align?: "left" | "right";
// }) {
//   return (
//     <div
//       className={cn(
//         "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
//         align === "right" && "justify-end",
//       )}
//     >
//       <Icon className="h-3.5 w-3.5" />
//       {label}
//     </div>
//   );
// }

// Stock badge — mirrors the color language used on the product grid so
// the two views read as one consistent system (emerald / amber / rose).
function StockBadge({ stock }: { stock: number }) {
  const isOutOfStock = stock <= 0;
  const isLow = stock > 0 && stock <= 5;

  return (
    <Badge
      variant={isOutOfStock ? "destructive" : isLow ? "outline" : "secondary"}
      className={cn(
        "text-[11px] font-semibold px-2 py-0 h-5 whitespace-nowrap",
        isOutOfStock
          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
          : isLow
            ? " bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      )}
    >
      {isOutOfStock
        ? "Out of stock"
        : isLow
          ? `Low · ${stock} left`
          : `${stock} in stock`}
    </Badge>
  );
}

// Actions cell — a plus/minus stepper wired straight to the cart, plus the
// existing AddToCart popover for setting an exact quantity in one go.
function QuantityActionsCell({ product }: { product: ProductCatalogView }) {
  const {
    cartItems,
    addItemToCart,
    increaseItemQuantity,
    decreaseItemQuantity,
    removeItemFromCart,
  } = useCart();

  const stock = Number(product.stock_quantity) || 0;

  if (stock <= 0) {
    return (
      <div className="flex justify-end min-w-52 pr-10">
        <span className="text-sm font-medium text-rose-600 dark:text-rose-400">
          N/A
        </span>
      </div>
    );
  }

  const cartQty =
    cartItems.find((item) => item.id === product.id)?.quantity || 0;

  const handleIncrease = () => {
    if (cartQty >= stock) return;
    if (cartQty > 0) {
      increaseItemQuantity(product.id);
    } else {
      addItemToCart({
        id: product.id,
        name: product.name,
        cost_price: Number(product.cost_price) || 0,
        unit_price: Number(product.unit_price) || 0,
        quantity: 1,
        stock_quantity: Number(product.stock_quantity),
      });
    }
  };

  const handleDecrease = () => {
    if (cartQty <= 0) return;
    if (cartQty === 1) {
      removeItemFromCart(product.id);
    } else {
      decreaseItemQuantity(product.id);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="flex items-center h-8 bg-muted/50 rounded-full border overflow-hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full disabled:opacity-30"
          onClick={handleDecrease}
          disabled={cartQty === 0}
          aria-label={`Remove one ${product.name} from cart`}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="text-sm font-semibold tabular-nums min-w-[1.5rem] text-center">
          {cartQty}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full disabled:opacity-30"
          onClick={handleIncrease}
          disabled={cartQty >= stock}
          aria-label={`Add one ${product.name} to cart`}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AddToCart
        stock={stock}
        cart={{
          id: product.id,
          name: product.name,
          cost_price: Number(product.cost_price) || 0,
          unit_price: Number(product.unit_price) || 0,
          quantity: 1,
        }}
      />
    </div>
  );
}

export const columns: ColumnDef<ProductCatalogView>[] = [
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
      <DataTableColumnHeader icon={Package} column={column} title="Product" />
    ),
    // header: () => <ColumnHeader icon={Package} label="Product" />,
    cell: ({ row }) => (
      <span
        className="font-semibold text-sm text-foreground line-clamp-1"
        title={row.original.name}
      >
        {row.original.name}
      </span>
    ),
  },
  {
    accessorKey: "category_name",
    // header: () => <ColumnHeader icon={Tag} label="Category" />,
    header: ({ column }) => (
      <DataTableColumnHeader icon={Tag} column={column} title="Category" />
    ),
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className="text-[11px] font-medium text-muted-foreground px-2 py-0 h-5 whitespace-nowrap"
      >
        {row.original.category_name || "General"}
      </Badge>
    ),
  },
  {
    accessorKey: "unit_price",
    header: ({ column }) => (
      <DataTableColumnHeader
        icon={Wallet}
        column={column}
        title="Unit Price"
        className="justify-end"
      />
      // <ColumnHeader icon={Wallet} label="Unit Price" align="right" />
    ),
    cell: ({ row }) => (
      <div className="text-right font-bold tabular-nums text-primary">
        {currencyFormatter(Number(row.original.unit_price) || 0)}
      </div>
    ),
  },
  {
    accessorKey: "stock_quantity",
    header: ({ column }) => (
      <DataTableColumnHeader
        icon={Boxes}
        column={column}
        title="Stock"
        className="justify-end"
      />
    ),
    cell: ({ row }) => (
      <div className="flex justify-end">
        <StockBadge stock={Number(row.original.stock_quantity) || 0} />
      </div>
    ),
  },
  {
    id: "actions",
    header: ({ column }) => (
      <DataTableColumnHeader
        icon={Plus}
        column={column}
        title="Cart"
        className="justify-end"
      />
    ),
    cell: ({ row }) => <QuantityActionsCell product={row.original} />,
  },
];
