/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
import { ProductCatalogView, ReStockProduct } from "@/types/globals";
import { restockProduct } from "@/actions/products";

const inventorySchema = z.object({
  // supplier: z.string().min(1, {
  //   message: "Required*",
  // }),
  // product_category: z.string().min(1, {
  //   message: "Required*",
  // }),
  quantity: z
    .string()
    .refine((value) => !isNaN(parseInt(value)), {
      message: "Quantity must be a valid number.",
    })
    .refine((value) => parseInt(value) >= 1, {
      message: "Quantity must be at least 1.",
    }),
});

type RestockProductProps = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  product: ProductCatalogView;
};
export function RestockProduct({
  open = false,
  setOpen,
  product,
}: RestockProductProps) {
  const form = useForm<z.infer<typeof inventorySchema>>({
    resolver: zodResolver(inventorySchema),
    defaultValues: {
      // supplier: "",
      quantity: "",
    },
  });

  async function onSubmit(values: z.infer<typeof inventorySchema>) {
    try {
      const payload: ReStockProduct = {
        id: product?.id,
        stock_quantity: Number(values.quantity),
      };
      const result = await restockProduct(payload);

      if (!result.success) {
        toast.error("Failed! An error has occurred.", {
          position: "top-right",
          className: "p-4 text-red-600",
        });
        return;
      }

      if (result.success) {
        setOpen(false);
        toast.success("Product Restocked successfully!", {
          position: "top-right",
          className: "p-4 text-success text-base",
        });
        form.reset();
      }
    } catch (error: any) {
      toast.error("Failed! An error has occurred.", {
        description: error?.message,
        position: "top-right",
        className: "p-4 text-red-600",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-screen-md">
        <DialogHeader>
          <DialogTitle>Restock Product</DialogTitle>
          <DialogDescription>
            Update the stock quantity for this product. Click save when
            you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4 mx-auto py-10"
            >
              <FormControl>
                <Input
                  placeholder="Metal name here"
                  type="text"
                  defaultValue={product?.name}
                  readOnly={true}
                />
              </FormControl>

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Quantity here"
                        type="number"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Add your product restock quantity
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit">
                  {form.formState.isSubmitting ? "Please Wait..." : "Restock"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>

        {form.formState.isSubmitting && (
          <LoadingSpinner loadingText="Restocking.Please Wait..." />
        )}
      </DialogContent>
    </Dialog>
  );
}
