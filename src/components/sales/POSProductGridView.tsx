"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Minus, Package, Plus } from "lucide-react";

import { useCart } from "@/components/providers/cart-provider";
import { AddToCart } from "@/components/sales/AddToCart";
import { Button } from "@/components/ui/button";
import { currencyFormatter } from "@/config/formatter";
import { cn } from "@/lib/utils";
import { useSettings } from "@/providers/SettingsProvider";
import type { ProductCatalogView } from "@/types/globals";

interface POSProductGridViewProps {
  displayedProducts: ProductCatalogView[];
  resetFilters: () => void;
  isAnyFilterActive: boolean;
}

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

function ProductThumb({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- product photos can come from any host
        <img
          src={src}
          alt={name}
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        
        />
      ) : (
        <Package aria-hidden className="size-5 text-muted-foreground/50" />
      )}
    </div>
  );
}

interface ProductCardProps {
  product: ProductCatalogView;
  cartQty: number;
  lowStockThreshold: number;
  onIncrease: (product: ProductCatalogView, currentQty: number) => void;
  onDecrease: (product: ProductCatalogView, currentQty: number) => void;
}

/**
 * Memoised, and it only receives primitives plus stable callbacks, so adding
 * one product to the cart re-renders that card, not the whole catalogue.
 */
const ProductCard = memo(function ProductCard({
  product,
  cartQty,
  lowStockThreshold,
  onIncrease,
  onDecrease,
}: ProductCardProps) {
  const stock = Number(product.stock_quantity) || 0;
  const unitPrice = Number(product.unit_price) || 0;
  const costPrice = Number(product.cost_price) || 0;

  const isOutOfStock = stock <= 0;
  const isLow = !isOutOfStock && stock <= lowStockThreshold;
  const inCart = cartQty > 0;

  return (
    <article
      className={cn(
        "relative flex h-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 transition-colors",
        isOutOfStock && "opacity-60",
        inCart
          ? "border-primary/60 ring-1 ring-primary/30"
          : !isOutOfStock && "hover:border-foreground/25",
      )}
    >
      {/* In-cart quantity badge */}
      {inCart && (
        <div className="absolute -top-2 -right-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow-sm">
          {cartQty}
        </div>
      )}
      <div className="flex items-start gap-3">
        <ProductThumb
          src={product.photo_url || product.image}
          name={product.name}
        />

        <div className="min-w-0 flex-1 space-y-0.5">
          <h3
            className="line-clamp-2 text-sm leading-snug font-medium"
            title={product.name}
          >
            {product.name}
          </h3>
          <p className="text-base font-bold tracking-tight tabular-nums">
            {currencyFormatter(unitPrice)}
          </p>
          {product.barcode && (
            <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <span className="px-1 py-0.2 bg-muted rounded border text-[9px] font-semibold">
                BC
              </span>
              {product.barcode}
            </span>
          )}
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            isOutOfStock
              ? "bg-rose-500"
              : isLow
                ? "bg-amber-500"
                : "bg-emerald-500",
          )}
        />
        {isOutOfStock
          ? "Out of stock"
          : isLow
            ? `Only ${stock} left`
            : `${stock} in stock`}
      </p>

      {!isOutOfStock && (
        <div className="mt-auto flex items-center gap-2">
          <div className="flex h-9 flex-1 items-center justify-between rounded-md border">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-none rounded-l-md"
              onClick={() => onDecrease(product, cartQty)}
              disabled={cartQty === 0}
            >
              <Minus aria-hidden className="size-3.5" />
              <span className="sr-only">
                Remove one {product.name} from cart
              </span>
            </Button>

            <span
              aria-live="polite"
              className="min-w-6 text-center text-sm font-medium tabular-nums"
            >
              {cartQty}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-none rounded-r-md"
              onClick={() => onIncrease(product, cartQty)}
              disabled={cartQty >= stock}
            >
              <Plus aria-hidden className="size-3.5" />
              <span className="sr-only">Add one {product.name} to cart</span>
            </Button>
          </div>

          {/* Set an exact quantity in one go */}
          <AddToCart
            stock={stock}
            cart={{
              id: product.id,
              name: product.name,
              cost_price: costPrice,
              unit_price: unitPrice,
              quantity: 1,
            }}
          />
        </div>
      )}
    </article>
  );
});

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export function POSProductGridView({
  displayedProducts,
  resetFilters,
  isAnyFilterActive,
}: POSProductGridViewProps) {
  const { settings } = useSettings();
  const {
    cartItems,
    addItemToCart,
    increaseItemQuantity,
    decreaseItemQuantity,
    removeItemFromCart,
  } = useCart();

  const lowStockThreshold =
    settings?.stock_alert_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;

  // How many of each product are already in the cart.
  const cartQuantities = useMemo(() => {
    const map = new Map<string, number>();
    cartItems.forEach((item) => map.set(item.id, item.quantity));
    return map;
  }, [cartItems]);

  // The card passes its own quantity in, so these don't depend on the cart
  // and stay stable between renders.
  const handleIncrease = useCallback(
    (product: ProductCatalogView, currentQty: number) => {
      const stock = Number(product.stock_quantity) || 0;
      if (currentQty >= stock) return;

      if (currentQty > 0) {
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
    },
    [addItemToCart, increaseItemQuantity],
  );

  const handleDecrease = useCallback(
    (product: ProductCatalogView, currentQty: number) => {
      if (currentQty <= 0) return;

      if (currentQty === 1) removeItemFromCart(product.id);
      else decreaseItemQuantity(product.id);
    },
    [decreaseItemQuantity, removeItemFromCart],
  );

  if (displayedProducts.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-1 rounded-xl border bg-card p-8 text-center">
        <p className="text-sm font-medium">
          {isAnyFilterActive ? "No products match" : "No products yet"}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {isAnyFilterActive
            ? "Try a different search, or clear the filters."
            : "Products you add will show up here."}
        </p>
        {isAnyFilterActive && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={resetFilters}
          >
            Clear filters
          </Button>
        )}
      </div>
    );
  }

  return (
    // auto-fill keeps card widths steady when a search leaves only a few results.
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3 p-2">
      {displayedProducts.map((product) => (
        <li key={product.id} className="min-w-0">
          <ProductCard
            product={product}
            cartQty={cartQuantities.get(product.id) ?? 0}
            lowStockThreshold={lowStockThreshold}
            onIncrease={handleIncrease}
            onDecrease={handleDecrease}
          />
        </li>
      ))}
    </ul>
  );
}

// "use client";

// import React, { useMemo } from "react";
// import { ProductCatalogView } from "@/types/globals";
// import {
//   Card,
//   CardContent,
//   CardFooter,
//   CardHeader,
// } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import { AddToCart } from "@/components/sales/AddToCart";
// import { currencyFormatter } from "@/config/formatter";
// import { useCart } from "@/components/providers/cart-provider";
// import { cn } from "@/lib/utils";
// import { Package, RotateCcw, Plus, Minus } from "lucide-react";

// interface POSProductGridViewProps {
//   displayedProducts: ProductCatalogView[];
//   resetFilters: () => void;
//   isAnyFilterActive: boolean;
// }

// export function POSProductGridView({
//   displayedProducts,
//   resetFilters,
//   isAnyFilterActive,
// }: POSProductGridViewProps) {
//   const {
//     cartItems,
//     addItemToCart,
//     increaseItemQuantity,
//     decreaseItemQuantity,
//     removeItemFromCart,
//   } = useCart();

//   // Filter items by client-side stock filter if applicable

//   // Quick lookup of "how many of this product are already in the cart"
//   const cartQuantities = useMemo(() => {
//     const map = new Map<string, number>();
//     cartItems.forEach((item) => map.set(item.id, item.quantity));
//     return map;
//   }, [cartItems]);

//   // Plus: adds the product if it isn't in the cart yet, otherwise bumps quantity.
//   const handleIncreaseQty = (
//     product: ProductCatalogView,
//     e: React.MouseEvent,
//   ) => {
//     e.stopPropagation();
//     const stock = Number(product.stock_quantity) || 0;
//     const currentQty = cartQuantities.get(product.id) || 0;
//     if (currentQty >= stock) return;

//     if (currentQty > 0) {
//       increaseItemQuantity(product.id);
//     } else {
//       addItemToCart({
//         id: product.id,
//         name: product.name,
//         cost_price: Number(product.cost_price) || 0,
//         unit_price: Number(product.unit_price) || 0,
//         quantity: 1,
//       });
//     }
//   };

//   // Minus: drops quantity by one, removing the item entirely once it hits 0.
//   const handleDecreaseQty = (
//     product: ProductCatalogView,
//     e: React.MouseEvent,
//   ) => {
//     e.stopPropagation();
//     const currentQty = cartQuantities.get(product.id) || 0;
//     if (currentQty <= 0) return;

//     if (currentQty === 1) {
//       removeItemFromCart(product.id);
//     } else {
//       decreaseItemQuantity(product.id);
//     }
//   };

//   return (
//     <>
//       {/* Grid View */}
//       {displayedProducts.length === 0 ? (
//         <div className="flex flex-col items-center justify-center min-h-[320px] rounded-xl border border-dashed p-8 text-center bg-card">
//           <Package className="h-12 w-12 text-muted-foreground/40 mb-3" />
//           <h4 className="text-base font-semibold text-foreground">
//             No products found
//           </h4>
//           <p className="text-sm text-muted-foreground max-w-sm mt-1">
//             No products matched your search or category filter. Try clearing
//             your filters.
//           </p>
//           {isAnyFilterActive && (
//             <Button
//               variant="outline"
//               size="sm"
//               className="mt-4 text-sm gap-1.5"
//               onClick={resetFilters}
//             >
//               <RotateCcw className="h-3.5 w-3.5" />
//               Clear All Filters
//             </Button>
//           )}
//         </div>
//       ) : (
//         <div className="@container w-full">
//           <div
//      className="
//       grid gap-3.5
//       grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))]
//     "
//           >
//             {displayedProducts.map((product) => {
//               const stock = Number(product.stock_quantity) || 0;
//               const unitPrice = Number(product.unit_price) || 0;
//               const costPrice = Number(product.cost_price) || 0;
//               const isOutOfStock = stock <= 0;
//               const cartQty = cartQuantities.get(product.id) || 0;
//               const inCart = cartQty > 0;

//               return (
//                 <Card
//                   key={product.id}
//                   className={cn(
//                     "group relative flex flex-col justify-between overflow-visible transition-all duration-200 hover:shadow-md border bg-card min-w-0",
//                     isOutOfStock
//                       ? "opacity-75 bg-muted/20 border-dashed"
//                       : inCart
//                         ? "border-primary/60 ring-1 ring-primary/20"
//                         : "hover:border-primary/50",
//                   )}
//                 >
//                   {/* In-cart quantity badge */}
//                   {inCart && (
//                     <div className="absolute -top-2 -right-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow-md">
//                       {cartQty}
//                     </div>
//                   )}

//                   {/* Header: Category & Stock Status */}
//                   <CardHeader className="p-3 pb-1.5 space-y-1.5">
//                     <div className="flex items-center justify-between gap-1.5">
//                       {/* <span className="text-[10px] font-semibold text-muted-foreground truncate max-w-[110px] uppercase tracking-wider">
//                           {product.category_name || "General"}
//                         </span> */}

//                       <Badge
//                         variant={
//                           isOutOfStock
//                             ? "destructive"
//                             : stock <= 5
//                               ? "outline"
//                               : "secondary"
//                         }
//                         className={cn(
//                           "text-[10px] font-semibold px-1.5 py-0 h-5",
//                           isOutOfStock
//                             ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
//                             : stock <= 5
//                               ? " bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
//                               : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
//                         )}
//                       >
//                         {isOutOfStock
//                           ? "Out of Stock"
//                           : stock <= 5
//                             ? `Low: ${stock}`
//                             : `${stock} in stock`}
//                       </Badge>
//                     </div>

//                     {/* Product Name */}
//                     {/* Product Name & Photo */}
//                     <div className="flex items-center gap-2.5 pt-0.5">
//                       <div className="h-10 w-10 rounded-lg border bg-muted shrink-0 overflow-hidden flex items-center justify-center">
//                         {product.photo_url || product.image ? (
//                           <img
//                             src={product.photo_url || product.image || ""}
//                             alt={product.name}
//                             className="h-full w-full object-cover"
//                             onError={(e) => {
//                               (e.target as HTMLElement).style.display = "none";
//                             }}
//                           />
//                         ) : (
//                           <Package className="h-4 w-4 text-muted-foreground/40" />
//                         )}
//                       </div>

//                       <h4
//                         className="font-bold text-sm text-foreground line-clamp-2 group-hover:text-primary transition-colors flex-1"
//                         title={product.name}
//                       >
//                         {product.name}
//                       </h4>
//                     </div>
//                     {/* <h4
//                       className="font-bold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors"
//                       title={product.name}
//                     >
//                       {product.name}
//                     </h4> */}
//                   </CardHeader>

//                   {/* Content: Description & Price */}
//                   <CardContent className="p-3 pt-0 space-y-2">
//                     {/* {product.description ? (
//                         <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2rem]">
//                           {product.description}
//                         </p>
//                       ) : (
//                         <div className="min-h-[2rem]" />
//                       )} */}

//                     {/* Large Price Highlight */}
//                     <div className="flex items-baseline justify-between p-2 rounded-lg  ">
//                       {/* <span className="text-[11px] font-medium text-muted-foreground">
//                       Price
//                     </span> */}
//                       <span className="text-base font-black text-neutral tracking-tight">
//                         {currencyFormatter(unitPrice)}
//                       </span>
//                     </div>
//                   </CardContent>

//                   {/* Footer: Quantity Stepper + Custom Quantity Add */}
//                   <CardFooter className="p-2.5 pt-2 border-t bg-muted/10 flex items-center justify-between gap-1.5">
//                     {isOutOfStock ? (
//                       <div className="w-full text-center py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-md border ">
//                         Out of Stock
//                       </div>
//                     ) : (
//                       <>
//                         {/* Plus / Minus quantity stepper — plus adds the first unit too */}
//                         <div className="flex flex-1 items-center justify-between h-9 bg-muted/50 rounded-full border overflow-hidden">
//                           <Button
//                             type="button"
//                             variant="ghost"
//                             size="icon"
//                             className="h-9 w-9 rounded-full shrink-0 disabled:opacity-30"
//                             onClick={(e) => handleDecreaseQty(product, e)}
//                             disabled={cartQty === 0}
//                             aria-label={`Remove one ${product.name} from cart`}
//                           >
//                             <Minus className="h-3.5 w-3.5" />
//                           </Button>
//                           <span className="text-sm font-semibold tabular-nums min-w-[1.5rem] text-center">
//                             {cartQty}
//                           </span>
//                           <Button
//                             type="button"
//                             variant="ghost"
//                             size="icon"
//                             className="h-9 w-9 rounded-full shrink-0 disabled:opacity-30"
//                             onClick={(e) => handleIncreaseQty(product, e)}
//                             disabled={cartQty >= stock}
//                             aria-label={`Add one ${product.name} to cart`}
//                           >
//                             <Plus className="h-3.5 w-3.5" />
//                           </Button>
//                         </div>

//                         {/* Custom Quantity Popover — set an exact quantity in one go */}
//                         <AddToCart
//                           stock={stock}
//                           cart={{
//                             id: product.id,
//                             name: product.name,
//                             cost_price: costPrice,
//                             unit_price: unitPrice,
//                             quantity: 1,
//                           }}
//                         />
//                       </>
//                     )}
//                   </CardFooter>
//                 </Card>
//               );
//             })}
//           </div>
//         </div>
//       )}
//     </>
//   );
// }
