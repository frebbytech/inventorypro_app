/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React from "react";
import { toast } from "sonner";
import { Trash } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { removeSupplier } from "@/actions/suppliers";
import { useRouter } from "next/navigation";

function DeleteSupplier({ id }: { id: string }) {
  const router = useRouter();

  const handleDeleteSupplier = async () => {
    try {
      const result = await removeSupplier(id);

      if (!result.success) throw new Error(result.message);

      if (result.success) {
        toast.success("Supplier Removed!", {
          position: "top-right",
          className: "p-4 text-success",
        });
      }
      router.push("/admin/supplier"); // redirect to suppliers page
    } catch (error: any) {
      toast.error("Failed! An error has occurred.", {
        description: error?.message,
        position: "top-right",
        className: "p-4 text-red-600",
      });
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full md:w-30 py-5"
          // onClick={handleDeleteSupplier}
        >
          <Trash className="mr-2" /> Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            supplier and remove your data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteSupplier}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DeleteSupplier;
