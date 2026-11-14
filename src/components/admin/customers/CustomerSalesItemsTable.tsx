"use client";

import { useState } from "react";
import { MoreVertical, Loader2 } from "lucide-react";
import { currencyFormatter } from "@/config/formatter"; // adjust import
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getSalesItemsBySalesId } from "@/actions/sales";
import { Result, SaleItem } from "@/types/globals";

interface CustomerSalesItemsTableProps {
  id?: string;
}

export default function CustomerSalesItemsTable({
  id,
}: CustomerSalesItemsTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // React Query to fetch sale items
  const {
    data: items = [], // Strictly inferred as SaleItem[] due to the select option
    isPending,
    error,
  } = useQuery<Result<SaleItem[]>, Error, SaleItem[]>({
    queryKey: ["sale-items", id] as const, // Removed dialogOpen from dependencies
    queryFn: (): Promise<Result<SaleItem[]>> => {
      if (!id) return Promise.reject(new Error("Sales ID is missing"));
      return getSalesItemsBySalesId(id); // Removed redundant async/await wrapper
    },
    select: (result): SaleItem[] => {
      if (!result.success || !result.data) return [];
      return result.data;
    },
    enabled: typeof id !== "undefined" && id !== null && dialogOpen,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 0, // Clears cache instantly when dialog closes
  });

  const handleViewItems = () => {
    setDialogOpen(true);
  };

  // Handle error
  if (error) {
    toast.error("Failed to load sale items", {
      description: error.message,
    });
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewItems()}>
              View Items
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sale Items</DialogTitle>
          <DialogDescription>
            Details of items sold in sale #{id}
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : items?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No items found for this sale.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items?.map((item) => (
                <TableRow key={item?.sale_item_id}>
                  <TableCell>{item?.product_name}</TableCell>
                  <TableCell className="text-right">{item?.quantity}</TableCell>
                  <TableCell className="text-right">
                    {currencyFormatter(item?.unit_price)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {currencyFormatter(item?.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
