/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Edit } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Customer, InsertCustomer } from "@/types/globals";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
import { updateCustomer } from "@/actions/customers";
import { Textarea } from "@/components/ui/textarea";

const customerValidationSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, {
    message: "Customer name must be at least 2 characters.",
  }),
  address: z.string().min(10, {
    message: "Description must be at least 10 characters.",
  }),
  phonenumber: z.string().refine((phone) => /^(?:\+233|0)\d{9}$/.test(phone), {
    message: "Invalid phone number format",
  }),
});

type EditCustomerData = z.infer<typeof customerValidationSchema>;

type EditCustomerProps = {
  customer: EditCustomerData;
};

function EditCustomer({ customer }: EditCustomerProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<EditCustomerData>({
    resolver: zodResolver(customerValidationSchema),
    defaultValues: customer,
  });

  useEffect(() => form.reset(customer), [form, customer]);

  async function onSubmit(values: EditCustomerData) {
    const payload = {
      id: customer?.id as string,
      ...values,
    };

    try {
      const result = await updateCustomer(payload);

      if (result) {
        setOpen(false);
        toast.success("Changes Saved!", {
          position: "top-right",
          className: "p-4 text-success text-base",
        });
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
      <DialogTrigger asChild>
        <Button variant="outline">
          <Edit className="mr-2" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-screen-md">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription>
            Make changes to your customer profile here. Click save when
            you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4 mx-auto "
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Metal name here"
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

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter customer address"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phonenumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        inputMode="tel"
                        placeholder="Enter your phone number"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit">
                  {form.formState.isSubmitting ? "Please Wait.." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>

      {form.formState.isSubmitting && (
        <LoadingSpinner loadingText="Saving Changes" />
      )}
    </Dialog>
  );
}

export default EditCustomer;
