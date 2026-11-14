/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Scan, Barcode } from "lucide-react";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
import {
  createProduct,
  updateProduct,
  findProductByBarcode,
} from "@/actions/products";
import { Category, InsertProduct, Product } from "@/types/globals";
import { ProductImageUpload } from "@/components/custom/ProductImageUpload";
import { BarcodeScannerModal } from "@/components/barcode/barcode-scanner-modal";

type ProductFormDialogProps = {
  categories: Category[];
  product?: Product | InsertProduct | null;
  trigger?: React.ReactNode;
};

// Zod schema – includes active (boolean) for edit mode
const productSchema = z.object({
  name: z.string().min(2, {
    message: "Product name must be at least 2 characters.",
  }),
  category_id: z.string().min(1, {
    message: "Please select a category.",
  }),
  stock_quantity: z
    .string()
    .refine((value) => !isNaN(parseInt(value)) && parseInt(value) >= 0, {
      message: "Stock must be a valid non‑negative number.",
    }),
  cost_price: z
    .string()
    .refine((value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0, {
      message: "Cost price must be a valid non‑negative number.",
    }),
  unit_price: z
    .string()
    .refine((value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0, {
      message: "Unit price must be a valid non‑negative number.",
    }),
  description: z.string().min(10, {
    message: "Description must be at least 10 characters.",
  }),
  barcode: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

type FormValues = z.infer<typeof productSchema>;

export default function ProductFormDialog({
  categories,
  product = null,
  trigger,
}: ProductFormDialogProps) {
  const isEditMode = !!product;
  const [open, setOpen] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      category_id: "",
      cost_price: "",
      unit_price: "",
      stock_quantity: "",
      barcode: "",
      active: true,
      photo_url: "",
    },
  });

  // Populate form when product changes or dialog opens
  useEffect(() => {
    if (open) {
      if (isEditMode && product) {
console.log("Resetting form with product data:", product);

        form.reset({
          name: product.name || "",
          category_id: product.category_id || "",
          cost_price: product.cost_price?.toString() || "",
          unit_price: product.unit_price?.toString() || "",
          stock_quantity: product.stock_quantity?.toString() || "",
          description: product.description || "",
          barcode: product.barcode || "",
          active: product.active ? true : false,
          photo_url: product.photo_url || (product as Product).image || "",
        });
      } else {
        form.reset({
          name: "",
          description: "",
          category_id: "",
          cost_price: "",
          unit_price: "",
          stock_quantity: "",
          barcode: "",
          active: true,
          photo_url: "",
        });
      }
    }
  }, [open, isEditMode, product, form]);

  const handleScannedBarcode = async (scannedBarcode: string) => {
    const trimmed = scannedBarcode.trim();
    if (!trimmed) return;

    // Check if scanned barcode belongs to an existing product
    const existingResult = await findProductByBarcode(trimmed);
    if (existingResult.success && existingResult.data) {
      const existingProduct = existingResult.data;
      if (!isEditMode || existingProduct.id !== product?.id) {
        toast.warning(`Barcode "${trimmed}" already assigned!`, {
          description: `Assigned to: ${existingProduct.name} (${existingProduct.category_name || "Uncategorized"})`,
          position: "top-right",
          className: "p-4 text-amber-600",
        });
      }
    }

    form.setValue("barcode", trimmed, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setScannerOpen(false);
    toast.success(`Barcode set: ${trimmed}`, { position: "top-right" });
  };

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        name: values.name,
        category_id: values.category_id,
        cost_price: parseFloat(values.cost_price),
        unit_price: parseFloat(values.unit_price),
        stock_quantity: parseInt(values.stock_quantity, 10),
        description: values.description,
        barcode: values.barcode?.trim() || null,
        active: values.active,
        photo_url: values.photo_url || null,
        image: values.photo_url || null,
      };

      let result;
      if (isEditMode && product) {
        result = await updateProduct({
          id: (product as Product).id || "",
          ...payload,
        });
      } else {
        result = await createProduct(payload);
      }

      if (result?.success) {
        form.reset();
        setOpen(false);
        toast.success(isEditMode ? "Product updated!" : "Product created!", {
          position: "top-right",
          className: "p-4 text-success text-base",
        });
      } else {
        toast.error(
          isEditMode ? "Failed to update product" : "Failed to create product",
          {
            description: result?.message || "An error occurred.",
            position: "top-right",
            className: "p-4 text-red-600",
          },
        );
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred.", {
        description: error?.message || "Please try again.",
        position: "top-right",
        className: "p-4 text-red-600",
      });
    }
  }

  // Default trigger
  const defaultTrigger = isEditMode ? (
    <Button variant="outline">
      <Pencil className="mr-2 h-4 w-4" /> Edit
    </Button>
  ) : (
    <Button>
      <Plus className="mr-2 h-4 w-4" /> Add Product
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>

      <DialogContent className="sm:max-w-screen-md flex flex-col max-h-[90vh] p-0 overflow-hidden">
        {/* Fixed Static Header */}
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
          <DialogTitle>
            {isEditMode ? "Edit Product" : "New Product"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update product details. Click save when you're done."
              : "Add new product to your stock. Click save when you're done."}
          </DialogDescription>
        </DialogHeader>

        {/* Form Container wrapping Content & Footer */}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col flex-1 overflow-hidden"
          >
            {/* Scrollable Main Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Product Photo Upload */}
              <FormField
                control={form.control}
                name="photo_url"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <ProductImageUpload
                        value={field.value}
                        onChange={field.onChange}
                        disabled={form.formState.isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Product Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Product name here"
                        type="text"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      This is your public display name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Barcode Field with Camera Scanner Option */}
              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Barcode className="h-4 w-4 text-primary" />
                        Barcode (EAN, UPC, Code 128, etc.)
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setScannerOpen(true)}
                        className="h-7 text-xs border-dashed text-primary hover:text-primary hover:bg-primary/10 gap-1.5"
                      >
                        <Scan className="h-3.5 w-3.5" /> Scan Barcode
                      </Button>
                    </FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g. 8901234567890 or scan barcode"
                          type="text"
                          className="font-mono text-xs"
                          value={field.value || ""}
                          onChange={field.onChange}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Unique barcode identifier for fast POS scanning.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <BarcodeScannerModal
                open={scannerOpen}
                onOpenChange={setScannerOpen}
                onScan={handleScannedBarcode}
                title="Scan Product Barcode"
                description="Point your camera at the product barcode to auto-fill this field."
              />

              {/* Category */}
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose a product category.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Stock Quantity */}
              <FormField
                control={form.control}
                name="stock_quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Stock quantity"
                        type="number"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Add your product stock quantity
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Cost Price & Unit Price */}
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-6">
                  <FormField
                    control={form.control}
                    name="cost_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost Price</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Cost price"
                            type="number"
                            step="0.01"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>Cost price per unit</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="col-span-6">
                  <FormField
                    control={form.control}
                    name="unit_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Price</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Unit price"
                            type="number"
                            step="0.01"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Selling price per unit
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter product description"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Active Status */}
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active Status</FormLabel>
                      <FormDescription>
                        {field.value
                          ? "Product is visible and available for sale."
                          : "Product is hidden and not available."}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Fixed Static Footer */}
            <DialogFooter className="p-6 pt-4 border-t flex-shrink-0">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? "Please Wait..."
                  : isEditMode
                    ? "Save Changes"
                    : "Add Product"}
              </Button>
            </DialogFooter>
          </form>
        </Form>

        {form.formState.isSubmitting && (
          <LoadingSpinner
            loadingText={isEditMode ? "Updating Product" : "Saving Product"}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// /* eslint-disable @typescript-eslint/no-explicit-any */
// "use client";
// import { useState, useEffect } from "react";
// import { toast } from "sonner";
// import { useForm } from "react-hook-form";
// import { zodResolver } from "@hookform/resolvers/zod";
// import * as z from "zod";
// import { Button } from "@/components/ui/button";
// import { Textarea } from "@/components/ui/textarea";
// import {
//   Form,
//   FormControl,
//   FormDescription,
//   FormField,
//   FormItem,
//   FormLabel,
//   FormMessage,
// } from "@/components/ui/form";
// import { Input } from "@/components/ui/input";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "@/components/ui/dialog";
// import { Switch } from "@/components/ui/switch";
// import { Plus, Pencil } from "lucide-react";
// import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
// import { createProduct, updateProduct } from "@/actions/products";
// import { Category, InsertProduct, Product } from "@/types/globals";
// import { ProductImageUpload } from "@/components/custom/ProductImageUpload";

// type ProductFormDialogProps = {
//   categories: Category[];
//   product?: InsertProduct | null; // if provided, we're in edit mode
//   trigger?: React.ReactNode; // optional custom trigger
// };

// // Zod schema – includes active (boolean) for edit mode
// const productSchema = z.object({
//   name: z.string().min(2, {
//     message: "Product name must be at least 2 characters.",
//   }),
//   category_id: z.string().min(1, {
//     message: "Please select a category.",
//   }),
//   stock_quantity: z
//     .string()
//     .refine((value) => !isNaN(parseInt(value)) && parseInt(value) >= 0, {
//       message: "Stock must be a valid non‑negative number.",
//     }),
//   cost_price: z
//     .string()
//     .refine((value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0, {
//       message: "Cost price must be a valid non‑negative number.",
//     }),
//   unit_price: z
//     .string()
//     .refine((value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0, {
//       message: "Unit price must be a valid non‑negative number.",
//     }),
//   description: z.string().min(10, {
//     message: "Description must be at least 10 characters.",
//   }),
//   photo_url: z.string().optional().nullable(),
//   active: z.boolean().optional(),
// });

// type FormValues = z.infer<typeof productSchema>;

// export default function ProductFormDialog({
//   categories,
//   product = null,
//   trigger,
// }: ProductFormDialogProps) {
//   const isEditMode = !!product;
//   const [open, setOpen] = useState(false);

//   const form = useForm<FormValues>({
//     resolver: zodResolver(productSchema),
//     defaultValues: {
//       name: "",
//       description: "",
//       category_id: "",
//       cost_price: "",
//       unit_price: "",
//       stock_quantity: "",
//       active: true,
//       photo_url: "",
//     },
//   });

//   // Populate form when product changes (edit mode)
//   useEffect(() => {
//     if (open && isEditMode && product) {
//       form.reset({
//         name: product.name || "",
//         category_id: product.category_id || "",
//         cost_price: product.cost_price?.toString() || "",
//         unit_price: product.unit_price?.toString() || "",
//         stock_quantity: product.stock_quantity?.toString() || "",
//         description: product.description || "",
//         active: product.active ? true : false,
//         photo_url: product.photo_url || product.image || "",
//       });
//     } else if (open && !isEditMode) {
//       form.reset({
//         name: "",
//         description: "",
//         category_id: "",
//         cost_price: "",
//         unit_price: "",
//         stock_quantity: "",
//         active: true,
//         photo_url: "",
//       });
//     }
//   }, [open, isEditMode, product, form]);

//   async function onSubmit(values: FormValues) {
//     try {
//       const payload = {
//         name: values.name,
//         category_id: values.category_id,
//         cost_price: parseFloat(values.cost_price),
//         unit_price: parseFloat(values.unit_price),
//         stock_quantity: parseInt(values.stock_quantity, 10),
//         description: values.description,
//         active: values.active,
//         photo_url: values.photo_url || null,
//         image: values.photo_url || null,
//       };

//       let result;
//       if (isEditMode && product) {
//         // Update
//         result = await updateProduct({
//           id: product.id || "",
//           ...payload,
//         });
//       } else {
//         // Create
//         result = await createProduct(payload);
//       }

//       form.reset();
//       if (result.success) {
//         setOpen(false);
//         toast.success(isEditMode ? "Product updated!" : "Product created!", {
//           position: "top-right",
//           className: "p-4 text-success text-base",
//         });
//         if (result.success) {
//           toast.success(
//             isEditMode ? "Changes Saved!" : "New Product Created!",
//             {
//               position: "top-right",
//               className: "p-4 text-success text-base",
//             },
//           );
//           setOpen(false);
//         }
//       } else {
//         toast.error(
//           isEditMode ? "Failed to update product" : "Failed to create product",
//           {
//             description: result.message,
//             position: "top-right",
//             className: "p-4 text-red-600",
//           },
//         );
//       }
//     } catch (error: any) {
//       toast.error("An unexpected error occurred.", {
//         description: error?.message || "Please try again.",
//         position: "top-right",
//         className: "p-4 text-red-600",
//       });
//     }
//   }

//   // Default trigger
//   const defaultTrigger = isEditMode ? (
//     <Button>
//       <Pencil className="h-4 w-4" /> Edit
//     </Button>
//   ) : (
//     <Button>
//       <Plus className="mr-2 h-4 w-4" /> Add Product
//     </Button>
//   );

//   return (
//     <Dialog open={open} onOpenChange={setOpen}>
//       <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
//       <DialogContent className="sm:max-w-screen-md">
//         <DialogHeader>
//           <DialogTitle>
//             {isEditMode ? "Edit Product" : "New Product"}
//           </DialogTitle>
//           <DialogDescription>
//             {isEditMode
//               ? "Update product details. Click save when you're done."
//               : "Add new product to your stock. Click save when you're done."}
//           </DialogDescription>
//         </DialogHeader>
//         <div className="h-[80svh] no-scrollbar overflow-auto p-2">
//           <Form {...form}>
//             <form
//               onSubmit={form.handleSubmit(onSubmit)}
//               className="space-y-4 mx-auto "
//             >
//               {/* Product Photo Upload (Optional) */}
//               <FormField
//                 control={form.control}
//                 name="photo_url"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormControl>
//                       <ProductImageUpload
//                         value={field.value}
//                         onChange={field.onChange}
//                         disabled={form.formState.isSubmitting}
//                       />
//                     </FormControl>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />

//               {/* Product Name */}
//               <FormField
//                 control={form.control}
//                 name="name"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>Name</FormLabel>
//                     <FormControl>
//                       <Input
//                         placeholder="Product name here"
//                         type="text"
//                         {...field}
//                       />
//                     </FormControl>
//                     <FormDescription>
//                       This is your public display name.
//                     </FormDescription>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />

//               {/* Category */}
//               <FormField
//                 control={form.control}
//                 name="category_id"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>Category</FormLabel>
//                     <Select
//                       onValueChange={field.onChange}
//                       defaultValue={field.value}
//                     >
//                       <FormControl>
//                         <SelectTrigger>
//                           <SelectValue placeholder="Select a category" />
//                         </SelectTrigger>
//                       </FormControl>
//                       <SelectContent>
//                         {categories.map((category) => (
//                           <SelectItem key={category.id} value={category.id}>
//                             {category.name}
//                           </SelectItem>
//                         ))}
//                       </SelectContent>
//                     </Select>
//                     <FormDescription>
//                       Choose a product category.
//                     </FormDescription>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />

//               {/* Stock Quantity */}
//               <FormField
//                 control={form.control}
//                 name="stock_quantity"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>Stock</FormLabel>
//                     <FormControl>
//                       <Input
//                         placeholder="Stock quantity"
//                         type="number"
//                         {...field}
//                       />
//                     </FormControl>
//                     <FormDescription>
//                       Add your product stock quantity
//                     </FormDescription>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />

//               {/* Cost Price & Unit Price */}
//               <div className="grid grid-cols-12 gap-4">
//                 <div className="col-span-6">
//                   <FormField
//                     control={form.control}
//                     name="cost_price"
//                     render={({ field }) => (
//                       <FormItem>
//                         <FormLabel>Cost Price</FormLabel>
//                         <FormControl>
//                           <Input
//                             placeholder="Cost price"
//                             type="number"
//                             step="0.01"
//                             {...field}
//                           />
//                         </FormControl>
//                         <FormDescription>Cost price per unit</FormDescription>
//                         <FormMessage />
//                       </FormItem>
//                     )}
//                   />
//                 </div>

//                 <div className="col-span-6">
//                   <FormField
//                     control={form.control}
//                     name="unit_price"
//                     render={({ field }) => (
//                       <FormItem>
//                         <FormLabel>Unit Price</FormLabel>
//                         <FormControl>
//                           <Input
//                             placeholder="Unit price"
//                             type="number"
//                             step="0.01"
//                             {...field}
//                           />
//                         </FormControl>
//                         <FormDescription>
//                           Selling price per unit
//                         </FormDescription>
//                         <FormMessage />
//                       </FormItem>
//                     )}
//                   />
//                 </div>
//               </div>

//               {/* Description */}
//               <FormField
//                 control={form.control}
//                 name="description"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>Description</FormLabel>
//                     <FormControl>
//                       <Textarea
//                         placeholder="Enter product description"
//                         className="resize-none"
//                         {...field}
//                       />
//                     </FormControl>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />

//               {/* Active Status (Switch) */}
//               <FormField
//                 control={form.control}
//                 name="active"
//                 render={({ field }) => (
//                   <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
//                     <div className="space-y-0.5">
//                       <FormLabel className="text-base">Active Status</FormLabel>
//                       <FormDescription>
//                         {field.value
//                           ? "Product is visible and available for sale."
//                           : "Product is hidden and not available."}
//                       </FormDescription>
//                     </div>
//                     <FormControl>
//                       <Switch
//                         checked={field.value}
//                         onCheckedChange={field.onChange}
//                       />
//                     </FormControl>
//                   </FormItem>
//                 )}
//               />

//               <DialogFooter>
//                 <Button type="submit" disabled={form.formState.isSubmitting}>
//                   {form.formState.isSubmitting
//                     ? "Please Wait.."
//                     : isEditMode
//                       ? "Save Changes"
//                       : "Add Product"}
//                 </Button>
//               </DialogFooter>
//             </form>
//           </Form>
//         </div>

//         {form.formState.isSubmitting && (
//           <LoadingSpinner
//             loadingText={isEditMode ? "Updating Product" : "Saving Product"}
//           />
//         )}
//       </DialogContent>
//     </Dialog>
//   );
// }
