/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import {
  Trash2,
  CheckCircle2,
  XCircle,
  X,
  ChevronDown,
  ToggleLeft,
  Loader2,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { removeData } from "@/actions/_actions";
import { updateProductsStatus, removeProducts } from "@/actions/products";
import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";

export interface BulkActionsProps {
  selectedIds: string[];
  table?: string;
  onClearSelection: () => void;
  showStatusUpdate?: boolean;
}

export function BulkActions({
  selectedIds,
  table = "items",
  onClearSelection,
  showStatusUpdate = true,
}: BulkActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<{
    open: boolean;
    active: boolean;
  }>({
    open: false,
    active: true,
  });

  const count = selectedIds.length;
  if (count === 0) return null;

  const handleUpdateStatus = async (active: boolean) => {
    setLoading(true);
    setLoadingText(
      active ? "Setting status to Active..." : "Setting status to Disabled...",
    );
    try {
      let res;
      if (table === "products" || table === "inventory" || table === "stocks") {
        res = await updateProductsStatus(selectedIds, active);
      } else {
        // Generic status update if applicable
        res = await updateProductsStatus(selectedIds, active);
      }

      if (!res.success) {
        throw new Error(res.message || "Failed to update status");
      }

      toast.success(
        `Status updated to ${active ? "Active" : "Disabled"} for ${count} ${
          count === 1 ? "product" : "products"
        }`,
        {
          position: "top-right",
          className: "p-4 text-emerald-600 font-medium",
        },
      );

      onClearSelection();
      router.refresh();
    } catch (error: any) {
      toast.error("Failed to update status", {
        description: error?.message || "An unexpected error occurred. Please try again.",
        position: "top-right",
        className: "p-4 text-red-600",
      });
    } finally {
      setLoading(false);
      setStatusConfirm({ open: false, active: true });
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setLoadingText(`Deleting ${count} selected ${table}...`);
    try {
      let res;
      if (table === "products" || table === "stocks") {
        res = await removeProducts(selectedIds);
      } else {
        res = await removeData({ ids: selectedIds, table });
      }

      if (!res.success) {
        throw new Error(res.message || `Failed to delete from ${table}`);
      }

      toast.success(
        `Successfully deleted ${count} ${
          count === 1 ? "item" : "items"
        } from ${table}`,
        {
          position: "top-right",
          className: "p-4 text-emerald-600 font-medium",
        },
      );

      onClearSelection();
      router.refresh();
    } catch (error: any) {
      toast.error(`Failed to delete ${table}`, {
        description: error?.message || "An unexpected error occurred. Please try again.",
        position: "top-right",
        className: "p-4 text-red-600",
      });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
    }
  };

  return (
    <>
      <div
        id="bulk-actions-toolbar"
        className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/70 dark:bg-muted/30 border border-border rounded-lg shadow-sm animate-in fade-in slide-in-from-top-1 duration-200"
      >
        <div className="flex items-center gap-2 mr-2">
          <Badge
            variant="secondary"
            className="px-2.5 py-1 text-sm font-semibold bg-primary/15 text-primary border-primary/20"
          >
            {count} {count === 1 ? "row" : "rows"} selected
          </Badge>
        </div>

        {/* Update Status Action */}
        {showStatusUpdate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id="bulk-update-status-button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-sm font-medium bg-background hover:bg-muted"
                disabled={loading}
              >
                <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />
                Update Status
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-sm text-muted-foreground">
                Set status for {count} {count === 1 ? "item" : "items"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                id="bulk-status-active-option"
                onClick={() => setStatusConfirm({ open: true, active: true })}
                className="gap-2 cursor-pointer text-emerald-600 focus:text-emerald-700 font-medium text-sm"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Set to Active
              </DropdownMenuItem>
              <DropdownMenuItem
                id="bulk-status-disabled-option"
                onClick={() => setStatusConfirm({ open: true, active: false })}
                className="gap-2 cursor-pointer text-rose-600 focus:text-rose-700 font-medium text-sm"
              >
                <XCircle className="h-4 w-4 text-rose-600" />
                Set to Disabled
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Bulk Delete Action */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger asChild>
            <Button
              id="bulk-delete-button"
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-sm font-medium"
              disabled={loading}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({count})
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. You are about to permanently
                delete{" "}
                <span className="font-semibold text-foreground">
                  {count} selected {count === 1 ? "item" : "items"}
                </span>{" "}
                from {table}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                id="bulk-delete-confirm-button"
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={loading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Deleting...
                  </>
                ) : (
                  `Delete ${count} ${count === 1 ? "Item" : "Items"}`
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Clear selection button */}
        <Button
          id="bulk-clear-selection-button"
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-8 px-2 text-sm text-muted-foreground hover:text-foreground"
          disabled={loading}
          title="Deselect all"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Deselect
        </Button>
      </div>

      {/* Confirmation Dialog for Status Update */}
      <AlertDialog
        open={statusConfirm.open}
        onOpenChange={(open) =>
          setStatusConfirm((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Status Update</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change the status of{" "}
              <span className="font-semibold text-foreground">
                {count} {count === 1 ? "product" : "products"}
              </span>{" "}
              to{" "}
              <span
                className={`font-semibold ${
                  statusConfirm.active ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {statusConfirm.active ? "Active" : "Disabled"}
              </span>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              id="bulk-status-confirm-button"
              onClick={(e) => {
                e.preventDefault();
                handleUpdateStatus(statusConfirm.active);
              }}
              disabled={loading}
              className={
                statusConfirm.active
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-rose-600 text-white hover:bg-rose-700"
              }
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                `Confirm ${statusConfirm.active ? "Activate" : "Disable"}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {loading && <LoadingSpinner loadingText={loadingText} />}
    </>
  );
}

export default BulkActions;
