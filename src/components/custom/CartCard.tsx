"use client";

import { Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { currencyFormatter } from "@/config/formatter";
import type { CartItem } from "@/types/globals";
import { useCart } from "../providers/cart-provider";

/** One line in the cart. Renders an <li>, so it belongs inside a <ul>. */
function CartCard({ item }: { item: CartItem }) {
  const { increaseItemQuantity, decreaseItemQuantity, removeItemFromCart } = useCart();

  const isLastUnit = item.quantity <= 1;
  const subtotal = (item.unit_price ?? 0) * (item.quantity ?? 0);

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {currencyFormatter(item.unit_price)} each
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="-mt-1 -mr-2 size-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => removeItemFromCart(item.id)}
        >
          <X aria-hidden className="size-4" />
          <span className="sr-only">Remove {item.name} from cart</span>
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div
          role="group"
          aria-label={`Quantity of ${item.name}`}
          className="inline-flex items-center rounded-md border"
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-6 rounded-none rounded-l-md"
            // At one unit, decreasing removes the line.
            onClick={() => (isLastUnit ? removeItemFromCart(item.id) : decreaseItemQuantity(item.id))}
          >
            <Minus aria-hidden className="size-3.5" />
            <span className="sr-only">
              {isLastUnit ? `Remove ${item.name} from cart` : "Decrease quantity"}
            </span>
          </Button>

          <span aria-live="polite" className="min-w-8 text-center text-sm font-medium tabular-nums">
            {item.quantity}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-none rounded-r-md"
            onClick={() => increaseItemQuantity(item.id)}
          >
            <Plus aria-hidden className="size-3.5" />
            <span className="sr-only">Increase quantity</span>
          </Button>
        </div>

        <p className="text-sm font-semibold tabular-nums">{currencyFormatter(subtotal)}</p>
      </div>
    </li>
  );
}

export default CartCard;

// import { Minus, Plus, X } from "lucide-react";
// import { Button } from "../ui/button";
// import { currencyFormatter } from "@/config/formatter";
// import { Separator } from "@/components/ui/separator";
// import { CartItem } from "@/types/globals";
// import { useCart } from "../providers/cart-provider";

// function CartCard({ item }: { item: CartItem }) {
//   const { increaseItemQuantity, decreaseItemQuantity, removeItemFromCart } =
//     useCart();

//   const handleIncrease = () => {
//     increaseItemQuantity(item?.id);
//   };

//   const handleDecrease = () => {
//     if (item?.quantity === 1) {
//       removeItemFromCart(item?.id);
//     } else {
//       decreaseItemQuantity(item?.id);
//     }
//   };

//   const subtotal = (item?.unit_price ?? 0) * (item?.quantity ?? 0);

//   return (
//     <>
//       <div className="w-full flex items-center justify-between gap-4  min-w-0">
//         {/* Left Side: Product Info Wrapper */}
//         <div className="flex flex-col gap-0.5 pt-1 min-w-0 flex-1">
//           <h4
//             className="font-bold text-sm sm:text-sm truncate"
//             title={item?.name}
//           >
//             {item?.name}
//           </h4>
//           <p className="text-primary text-sm font-medium">
//             {currencyFormatter(item?.unit_price)}
//           </p>

//           <div className="w-full flex items-center justify-between min-w-0">
//             <p className="text-muted-foreground text-sm">
//               {item?.quantity} item(s)
//             </p>
//             {/* Right Side: Actions & Totals */}
//             <div className="flex flex-[0.7] items-start gap-2 sm:gap-4 pb-1 flex-shrink-0">
//               {/* Quantity Controls - Fixed with explicit flex items-center and h-fit */}
//               <div className="flex items-center h-fit bg-muted/50 rounded-full p-0.1 border">
//                 <Button
//                   variant="ghost"
//                   size="icon"
//                   className="h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center shrink-0"
//                   onClick={handleDecrease}
//                   aria-label="Decrease quantity"
//                 >
//                   <Minus className="" />
//                 </Button>
//                 <span className="px-2 sm:px-3 text-sm font-medium min-w-[24px] text-center flex items-center justify-center leading-none">
//                   {item?.quantity}
//                 </span>
//                 <Button
//                   variant="ghost"
//                   size="icon"
//                   className="h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center shrink-0"
//                   onClick={handleIncrease}
//                   aria-label="Increase quantity"
//                 >
//                   <Plus className="" />
//                 </Button>
//               </div>

//               {/* Subtotal Display */}
//               <span className="font-bold text-sm  flex-1 text-right self-center">
//                 {currencyFormatter(subtotal)}
//               </span>

//               {/* Delete Action */}
//               <Button
//                 size="icon"
//                 variant="ghost"
//                 className="h-8 w-8 text-muted-foreground hover:text-destructive self-center"
//                 onClick={() => removeItemFromCart(item?.id)}
//                 aria-label={`Remove ${item?.name} from cart`}
//               >
//                 <X size={16} />
//               </Button>
//             </div>
//           </div>
//         </div>
//       </div>
//       <Separator />
//     </>
//   );
// }

// export default CartCard;

