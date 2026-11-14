/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { Dispatch, SetStateAction, useState } from "react";
import { useForm } from "react-hook-form";
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
import { toast } from "sonner";
import { InsertSalesCustomer } from "@/types/globals";

const userSchema = z.object({
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  phonenumber: z.string().refine((phone) => /^(?:\+233|0)\d{9}$/.test(phone), {
    message: "Invalid phone number format",
  }),
});

type UserInfoProps = {
  user: InsertSalesCustomer;
  setUser: Dispatch<SetStateAction<InsertSalesCustomer>>;
};

export function UserInfo({ setUser, user }: UserInfoProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: user,
  });

  async function onSubmit(values: z.infer<typeof userSchema>) {
    try {
      localStorage.setItem("order-user-details", JSON.stringify(values));
      setUser(values);
      toast.success("Changes Saved!", {
        position: "top-right",
        className: "p-4 text-green-500",
      });
      setOpen(false);
    } catch (error: any) {
      toast.error("Failed! An error has occurred.", {
        description: error?.message,
        position: "top-right",
        className: "p-4 text-red-600",
      });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">Edit</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 mr-2" sideOffset={10}>
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">User Information</h4>
            <p className="text-sm text-muted-foreground">
              Make changes to user information.
            </p>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your name" {...field} />
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
              </div>

              <Button type="submit" className="w-full">
              
                {form.formState.isSubmitting ? "Please Wait.." : "Save"}
              </Button>
            </form>
          </Form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
