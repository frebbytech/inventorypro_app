/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { useRouter } from "next/navigation";
import { DeleteDataProps } from "@/types/globals";
import { removeData } from "@/actions/_actions";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";

function DeleteData({ ids, table }: DeleteDataProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDeleteData = async () => {
    setLoading(true);
    try {
      const result = await removeData({ ids, table });
      if (!result) throw new Error("Failed!An unknown error has occurred.");
     
      if (result) {
        toast.success(`${table} Removed!`, {
          position: "top-right",
          className: "p-4 text-success",
        });
      }
      router.refresh(); // redirect to products page
    } catch (error: any) {
      // console.log(error.message);
      toast.error("Failed!.", {
        description: "An error has occurred.Try again later",
        // description: error.message,
        position: "top-right",
        className: "p-4 text-red-600",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {" "}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>
            <Trash2 />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              {table} and remove your data from the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteData}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {loading && <LoadingSpinner loadingText="Removing.." />}
    </>
  );
}

export default DeleteData;
