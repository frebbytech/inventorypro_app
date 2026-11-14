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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
import { createSupplier, updateSupplier } from "@/actions/suppliers";
import { InsertSupplier, Supplier } from "@/types/globals";

type SupplierFormDialogProps = {
  supplier?: InsertSupplier | null; // if provided, edit mode
  trigger?: React.ReactNode;
};

// Zod schema with new fields
const supplierSchema = z.object({
  name: z.string().min(2, {
    message: "Supplier name must be at least 2 characters.",
  }),
  company_name: z.string().optional(),
  address: z.string().min(5, {
    message: "Address must be at least 5 characters.",
  }),
  phonenumber: z.string().refine((phone) => /^(?:\+233|0)\d{9}$/.test(phone), {
    message: "Invalid phone number format (e.g., 024XXXXXXX or +233XXXXXXXXX)",
  }),
  email: z
    .string()
    .email({ message: "Invalid email address" })
    .optional()
    .or(z.literal("")),
  is_active: z.boolean().optional(),
});

type FormValues = z.infer<typeof supplierSchema>;

export default function SupplierFormDialog({
  supplier = null,
  trigger,
}: SupplierFormDialogProps) {
  const isEditMode = !!supplier;
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: "",
      company_name: "",
      address: "",
      phonenumber: "",
      email: "",
      is_active: true,
    },
  });

  // Populate form when supplier changes (edit mode)
  useEffect(() => {
    if (open && isEditMode && supplier) {
      form.reset({
        name: supplier.name || "",
        company_name: supplier.company_name || "",
        address: supplier.address || "",
        phonenumber: supplier.phonenumber || "",
        email: supplier.email || "",
        is_active: supplier.is_active !== undefined ? supplier.is_active : true,
      });
    } else if (open && !isEditMode) {
      form.reset({
        name: "",
        company_name: "",
        address: "",
        phonenumber: "",
        email: "",
        is_active: true,
      });
    }
  }, [open, isEditMode, supplier, form]);

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        name: values.name,
        company_name: values.company_name || "",
        address: values.address,
        phonenumber: values.phonenumber,
        email: values.email || "",
        is_active: values.is_active,
      };

      let result;
      if (isEditMode && supplier) {
        result = await updateSupplier({
          id: supplier.id||"",
          ...payload,
        });
      } else {
        result = await createSupplier(payload);
      }

      if (!result.success) {
        throw new Error(result.message);
      }

      setOpen(false);
      toast.success(isEditMode ? "Supplier updated!" : "Supplier created!", {
        position: "top-right",
        className: "p-4 text-success text-base",
      });
      form.reset();

      if (result.success) {
        setOpen(false);
        toast.success(isEditMode ? "Supplier updated!" : "Supplier created!", {
          position: "top-right",
          className: "p-4 text-success text-base",
        });
      }
    } catch (error: any) {
      toast.error(
        isEditMode ? "Failed to update supplier" : "Failed to create supplier",
        {
          description: error?.message || "Please try again.",
          position: "top-right",
          className: "p-4 text-red-600",
        },
      );
    }
  }

  // Default trigger
  const defaultTrigger = isEditMode ? (
    <Button variant="outline" >
      <Pencil className="h-4 w-4" /> Edit
    </Button>
  ) : (
    <Button>
      <Plus className="mr-2 h-4 w-4" /> Add Supplier
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-screen-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Supplier" : "New Supplier"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update supplier details. Click save when you're done."
              : "Add a new supplier to your list. Click save when you're done."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-4 px-2 py-4  mx-auto h-[70svh] no-scrollbar overflow-auto">
                {/* Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Supplier name"
                          type="text"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        The primary contact name.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Company Name */}
                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Company name (optional)"
                          type="text"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Address */}
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter supplier address"
                          className="resize-none"
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Phone Number */}
                <FormField
                  control={form.control}
                  name="phonenumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number *</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          inputMode="tel"
                          placeholder="e.g., 024XXXXXXX"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Email */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="supplier@example.com"
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
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Active Status
                        </FormLabel>
                        <FormDescription>
                          {field.value
                            ? "Supplier is active and available."
                            : "Supplier is inactive."}
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
              <DialogFooter>
                            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting
                    ? "Please Wait.."
                    : isEditMode
                      ? "Update Changes"
                      : "Add Supplier"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
        {form.formState.isSubmitting && (
          <LoadingSpinner
            loadingText={isEditMode ? "Updating Supplier" : "Saving Supplier"}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
