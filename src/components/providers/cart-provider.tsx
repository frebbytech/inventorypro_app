"use client";
import _ from "lodash";
import { toast } from "sonner";
import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { CartItem } from "@/types/globals";

// Define the types for cart items and the context

interface CartContextType {
  cartItems: CartItem[];
  addItemToCart: (item: CartItem) => void;
  removeItemFromCart: (itemId: string) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalItemsBought: () => number;
  getTotalPrice: () => number;
  increaseItemQuantity: (itemId: string) => void;
  decreaseItemQuantity: (itemId: string) => void;
  getTotalCost: number;
  grandTotal: number;
}

// Create a Context for the cart
const CartContext = createContext<CartContextType | undefined>(undefined);

// Create a provider component
export const CartProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const navigate = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const products = localStorage.getItem("cart");
    if (!_.isEmpty(products)) {
      setCartItems(JSON.parse(products as string));
    }
  }, []);

  // Function to add an item to the cart
  const addItemToCart = (item: CartItem) => {
    setCartItems((prevItems) => {
      const existingItem = prevItems.find((i) => i.id === item.id);
      const addAmount = item.quantity && item.quantity > 0 ? item.quantity : 1;
      const maxStock =
        item.stock_quantity ?? existingItem?.stock_quantity ?? 999999;

      if (existingItem) {
        const nextQty = existingItem.quantity + addAmount;
        if (nextQty > maxStock) {
          toast.warning(
            `Cannot add more than ${maxStock} in stock for ${item.name}`,
            {
              position: "top-right",
              className: "p-4 text-amber-600 font-medium",
            },
          );
          return prevItems;
        }
        toast.success(`Updated ${item.name} quantity to ${nextQty}`, {
          className: "p-4 text-emerald-600 font-medium",
          position: "top-right",
        });
        const updated = prevItems.map((i) =>
          i.id === item.id ? { ...i, quantity: nextQty } : i,
        );
        localStorage.setItem("cart", JSON.stringify(updated));
        return updated;
      }

      if (addAmount > maxStock) {
        toast.warning(
          `Only ${maxStock} units available in stock for ${item.name}`,
          {
            position: "top-right",
            className: "p-4 text-amber-600 font-medium",
          },
        );
        return prevItems;
      }

      //     if (existingItem) {

      //  const nextQty = existingItem.quantity + addAmount;
      //       if (nextQty > maxStock) {
      //         toast.warning(`Cannot add more than ${maxStock} in stock for ${item.name}`, {
      //           position: "top-right",
      //           className: "p-4 text-amber-600 font-medium",
      //         });
      //         return prevItems;
      //       }
      //       toast.success(`Updated ${item.name} quantity to ${nextQty}`, {
      //         className: "p-4 text-emerald-600 font-medium",
      //         position: "top-right",
      //       });

      //       return prevItems.map((i) =>
      //         i.id === item.id ? { ...i, quantity: nextQty } : i,
      //       );
      //     }
      // toast(`${item?.name} added to  Cart!`, {
      //   className: "p-4",
      //   position: "top-right",
      // });
      const products = [...prevItems, { ...item, quantity: item.quantity }];
      localStorage.setItem("cart", JSON.stringify(products));
      return products;
    });
  };

  // Function to remove an item from the cart
  const removeItemFromCart = (itemId: string) => {
    setCartItems((prevItems) => {
      const products = prevItems.filter((item) => item.id !== itemId);
      localStorage.setItem("cart", JSON.stringify(products));
      // toast.info("Product removed!", {
      //   className: "p-4",
      //   position: "top-right",
      //   action: {
      //     label: "View Cart",
      //     onClick: () => navigate.push("/cart"),
      //   },
      // });
      return products;
    });
  };

  // Function to clear the cart
  const clearCart = () => {
    setCartItems([]);
    localStorage.removeItem("cart");
  };

  // Function to get the total count of items in the cart
  const getTotalItems = () => {
    return cartItems.length;
  };

  // Function to get the total count of items bought
  const getTotalItemsBought = () => {
    return _.sumBy(cartItems, (item) => Number(item?.quantity));
  };

  // Function to get the total price of items in the cart
  const getTotalPrice = () => {
    if (cartItems?.length === 0) return 0;
    return _.sumBy(cartItems, (item) => item.unit_price);
  };

  // Function to increase the quantity of a specific item
  const increaseItemQuantity = (itemId: string) => {
    setCartItems((prevItems) => {
      const products = prevItems.map((item) =>
        item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item,
      );
      localStorage.setItem("cart", JSON.stringify(products));
      return products;
    });
  };

  // Function to decrease the quantity of a specific item
  const decreaseItemQuantity = (itemId: string) => {
    setCartItems((prevItems) => {
      const products = prevItems.map((item) =>
        item.id === itemId && item.quantity > 1
          ? { ...item, quantity: item.quantity - 1 }
          : item,
      );
      localStorage.setItem("cart", JSON.stringify(products));
      return products;
    });
  };

  // Memoized value for the total sum  of cost price of items in the cart
  const getTotalCost = useMemo(() => {
    if (cartItems?.length === 0) return 0;
    // console.log(cartItems)
    return _.round(
      _.sumBy(cartItems, (item) => item?.cost_price || 0 * item.quantity),
      2,
    );
  }, [cartItems]);

  // Memoized value for the total price (grand total) of items in the cart
  const grandTotal = useMemo(() => {
    if (cartItems?.length === 0) return 0;
    return _.round(
      _.sumBy(cartItems, (item) => item.unit_price * item.quantity),
      2,
    );
  }, [cartItems]);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addItemToCart,
        removeItemFromCart,
        clearCart,
        getTotalItems,
        getTotalItemsBought,
        getTotalPrice,
        getTotalCost,
        increaseItemQuantity,
        decreaseItemQuantity,
        grandTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

// Custom hook to use the CartContext
export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
