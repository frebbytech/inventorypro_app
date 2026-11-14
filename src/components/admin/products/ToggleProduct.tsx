/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React from "react";
import { toast } from "sonner";
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
import { Eye, EyeOff } from "lucide-react";
// import { toggleProduct } from "@/actions/products";
import { Button } from "@/components/ui/button";

function ToggleProduct({ id, active }: { id: string; active: number }) {
  const handleToggleProduct = async () => {
    try {
      // const result = await toggleProduct(id, active);
      // if (result) {
      //   toast.success("Changes Saved!", {
      //     position: "top-right",
      //     className: "p-4 text-success",
      //   });
      // }
    } catch (error: any) {
      toast.error("Failed! An error has occurred.", {
        description: error.message,
        position: "top-right",
        className: "p-4 text-red-600",
      });
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          {active === 1 ? (
            <Eye className="mr-2" />
          ) : (
            <EyeOff className="mr-2" />
          )}
          {active === 1 ? "Disable " : "Enable "}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {active === 1 ? "Disable Product" : "Enable Product"}
          </AlertDialogTitle>
          <AlertDialogDescription>Proceed with changes?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleToggleProduct}>
            Proceed
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ToggleProduct;
