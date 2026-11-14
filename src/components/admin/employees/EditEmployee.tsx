/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
import { InsertUser } from "@/types/globals";
import { updateUser } from "@/actions/_actions";

type EditEmployeeProps = {
  user: InsertUser;
};

const userSchema = z.object({
  firstname: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  lastname: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  username: z.string().min(1, {
    message: "Username name is required.",
  }),
  email: z.email({
    message: "Please enter a valid email address.",
  }),
  phonenumber: z.string().refine((phone) => /^(?:\+233|0)\d{9}$/.test(phone), {
    message: "Invalid phone number format",
  }),
  role: z.enum(
    { admin: "admin", member: "member" },
    {
      error: () => ({ message: "Please select a role." }),
    },
  ),
});

function EditEmployee({ user }: EditEmployeeProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: user,
  });

  useEffect(() => form.reset(user), [form, user]);

  async function onSubmit(values: z.infer<typeof userSchema>) {
    const payload = {
      id: user?.id || "",
      ...values,
    };

    try {
      const result = await updateUser(payload);

      if (result) {
        setOpen(false);
        toast.success("Changes Saved!", {
          position: "top-right",
          className: "p-4 text-green-500",
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
       
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Edit employee"
              >
                <Edit />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Update Info</TooltipContent>
          </Tooltip>
      
      </DialogTrigger>
      <DialogContent className="max-w-screen-md">
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
          <DialogDescription>
            Make changes to your profile information.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-4">
                <div className="w-full flex flex-col md:flex-row items-center gap-2 ">
                  <FormField
                    control={form.control}
                    name="firstname"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter your firstname"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastname"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your lastname" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your username"
                          {...field}
                          readOnly
                          disabled
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          inputMode="email"
                          placeholder="Enter your email"
                          {...field}
                          readOnly
                          disabled
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
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="admin">Administrator</SelectItem>
                          <SelectItem value="member">Sales Person</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end items-center gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit">
                  {form.formState.isSubmitting
                    ? "Please Wait.."
                    : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
        {form.formState.isSubmitting && (
          <LoadingSpinner loadingText="Saving Changes.Please Wait..." />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default EditEmployee;
