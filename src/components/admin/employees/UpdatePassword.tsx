/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Edit, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
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
  TooltipTrigger,
} from "@/components/ui/tooltip";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
import { updatePassword } from "@/actions/_actions";

type UpdatePasswordProps = {
  id: string;
};

// Password validation regex
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

const userSchema = z
  .object({
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters long" })
      .refine((password) => passwordRegex.test(password), {
        message:
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"], // Assign error message to confirmPassword field
  });

function UpdatePassword({ id }: UpdatePasswordProps) {
  const [open, setOpen] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: z.infer<typeof userSchema>) {
    try {
      const result = await updatePassword(id, values.password);

      if (result) {
        setOpen(false);
        toast.success("Password updated successfully!", {
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

  // Toggle password visibility
  const togglePasswordVisibility = () => setPasswordVisible(!passwordVisible);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              // className="text-blue-500"
              aria-label="Change Password"
            >
              <Key />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Change Password</TooltipContent>
        </Tooltip>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            Make changes to your login password.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={passwordVisible ? "text" : "password"}
                            inputMode="text"
                            placeholder="Enter your password"
                            {...field}
                          />
                          <Button
                            size="icon"
                            type="button"
                            variant="ghost"
                            className="absolute right-3 top-0 hover:bg-transparent"
                            onClick={togglePasswordVisibility}
                          >
                            {passwordVisible ? <EyeOff /> : <Eye />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={passwordVisible ? "text" : "password"}
                            inputMode="text"
                            placeholder="Confirm password"
                            {...field}
                          />
                          {/* <Button
                            size="icon"
                            type="button"
                            variant="ghost"
                            className="absolute right-3 top-0 hover:bg-transparent"
                            onClick={togglePasswordVisibility}
                          >
                            {passwordVisible ? <EyeOff /> : <Eye />}
                          </Button> */}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit">
                {form.formState.isSubmitting
                  ? "Please Wait.."
                  : "Update Changes"}
              </Button>
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

export default UpdatePassword;
