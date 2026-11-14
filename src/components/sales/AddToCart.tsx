"use client";

import { useForm, type Resolver } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PlusCircleIcon } from "lucide-react";
import { useCart } from "../providers/cart-provider";
import { useState, useEffect } from "react";
import { CartItem } from "@/types/globals";

export interface CartItems {
  id: string;
  name: string;
  quantity: number | unknown;
  unit_price: number;
  cost_price?: number;
}
// 1. Pulled stock check directly into schema for declarative validation
const createCartSchema = (stock: number) =>
  z.object({
    id: z.string(),
    name: z.string().min(2, {
      message: "Name must be at least 2 characters.",
    }),
    // quantity: z.coerce
    //   .number()
    //   .min(1, { message: "Quantity must be at least 1." })
    //   .max(stock, { message: `Only ${stock} items available in stock.` }),
    quantity: z
      .string()
      .refine((value) => !isNaN(parseInt(value)) && parseInt(value) >= 0, {
        message: "Stock must be a valid non‑negative number.",
      }),
    cost_price: z.number().optional(),
    unit_price: z.number(), // Form inputs emit strings; coerced to prevent type bugs
  });

type AddToCartProps = {
  cart: CartItem;
  stock: number;
};

type CartFormValues = z.infer<ReturnType<typeof createCartSchema>>;

export function AddToCart({ cart, stock }: AddToCartProps) {
  const { addItemToCart } = useCart();
  const [open, setOpen] = useState(false);

  // 2. Dynamic schema instantiation captures live stock changes
  const cartSchema = createCartSchema(stock);

  // const extendedCartSchema = cartSchema.extend({
  //   quantity: z
  //     .number()
  //     .min(1, { message: "Quantity must be at least 1." })
  //     .max(stock, { message: `Only ${stock} items available in stock.` }),
  // });

  const form = useForm<CartFormValues>({
    resolver: zodResolver(cartSchema),
    defaultValues: {
      ...cart,
      quantity: "1", // UX: Default to 1 instead of duplicating full stock/previous values
    },
  });

  // 3. Keep form values synced if the parent product changes
  useEffect(() => {
    form.reset({ ...cart, quantity: "1" });
  }, [cart, form]);

  function onSubmit(values: CartFormValues) {
    addItemToCart({
      ...values,
      quantity: Number(values?.quantity),
      
    } as CartItem);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen} >
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Add product to cart">
          <PlusCircleIcon className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 mr-2 bg-card" sideOffset={10}>
        <div className="grid gap-4">
          <div className="space-y-1">
            <h4 className="font-medium leading-none  text-foreground">Product Details</h4>
            <p className="text-sm text-muted-foreground">
              Available Stock:{" "}
              <span className="font-semibold text-foreground">{stock}</span>
            </p>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-3">
                {/* <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          readOnly
                          className="bg-muted cursor-not-allowed"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Price</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          readOnly
                          className="bg-muted cursor-not-allowed"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                /> */}

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Enter Quantity</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="1"
                          type="number"
                          min={1}
                          max={stock}
                          {...field}
                          className="text-foreground"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" className="w-full" disabled={stock < 1}>
                {form.formState.isSubmitting ? "Please Wait..." : "Add To Cart"}
              </Button>
            </form>
          </Form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
