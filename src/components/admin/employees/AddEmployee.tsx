/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
import { createUser } from "@/actions/_actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// Password validation regex
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

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

  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .refine((password) => passwordRegex.test(password), {
      message:
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
    }),
});

export default function AddEmployee() {
  const router = useRouter();
  const [passwordVisible, setPasswordVisible] = useState(false);

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      firstname: "",
      lastname: "",
      username: "",
      email: "",
      phonenumber: "",
      password: "",
      role: "member",
    },
  });

  async function onSubmit(values: z.infer<typeof userSchema>) {
    try {
      const result = await createUser(values);

      if (!result.success) {
        throw new Error(result.message);
      }
      if (result.success) {
        toast.success("New User created!", {
          position: "top-right",
          className: "p-4 text-green-500",
        });
        form.reset();
      }
      router.push("/admin/employee");
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
    <Card className="mx-auto w-full">
      <CardHeader>
        <CardTitle className="text-left text-2xl font-bold flex items-center gap-2">
          {/* add back button  */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/admin/employee")}
          >
            <ArrowLeft size={20} />

            <br />
          </Button>
          <span> Employee Information</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
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
                        <Input placeholder="Enter your firstname" {...field} />
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
                      <Input placeholder="Enter your username" {...field} />
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
            </div>

            <div className="flex justify-end gap-2">
              <Button type="submit">
                {" "}
                {form.formState.isSubmitting ? "Please Wait.." : "Add User"}
              </Button>

              {/* cancel button */}
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
        {form.formState.isSubmitting && (
          <LoadingSpinner loadingText="Creating User.Please Wait..." />
        )}
      </CardContent>
    </Card>
  );
}
