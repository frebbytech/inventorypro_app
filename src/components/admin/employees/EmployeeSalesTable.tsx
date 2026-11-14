"use client";

import { useState } from "react";
import { MoreVertical, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { currencyFormatter } from "@/config/formatter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSalesItemsBySalesId } from "@/actions/sales";
import { EmployeeSale, Result } from "@/types/globals";

interface SaleItem {
  sale_item_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}


interface EmployeeSalesTableProps {
  sales: EmployeeSale[];
}

export default function EmployeeSalesTable({ sales }: EmployeeSalesTableProps) {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // React Query for sale items
  // React Query to fetch sale items
  const {
    data: items = [], // Strictly inferred as SaleItem[] due to the select option
    isPending,
    error,
  } = useQuery<Result<SaleItem[]>, Error, SaleItem[]>({
    queryKey: ["sale-items", selectedSaleId] as const, // Removed dialogOpen from dependencies
    queryFn: (): Promise<Result<SaleItem[]>> => {
      if (!selectedSaleId)
        return Promise.reject(new Error("Sales ID is missing"));
      return getSalesItemsBySalesId(selectedSaleId); // Removed redundant async/await wrapper
    },
    select: (result): SaleItem[] => {
      if (!result.success || !result.data) return [];
      return result.data;
    },
    enabled:
      typeof selectedSaleId !== "undefined" &&
      selectedSaleId !== null &&
      dialogOpen,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 0, // Clears cache instantly when dialog closes
  });

  const handleViewItems = (saleId: string) => {
    setSelectedSaleId(saleId);
    setDialogOpen(true);
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sale ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Payment Mode</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => (
            <TableRow key={sale.sale_id}>
              <TableCell className="font-medium">{sale.sale_id}</TableCell>
              <TableCell>{sale.customer_name || "Guest"}</TableCell>
              <TableCell>{format(new Date(sale.sale_date), "PPP")}</TableCell>
              <TableCell className="text-right font-medium">
                {currencyFormatter(sale.total_amount)}
              </TableCell>
              <TableCell className="capitalize">
                {sale.payment_mode || "—"}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {sale.status || "completed"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleViewItems(sale.sale_id)}
                    >
                      View Items
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Dialog for items */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sale Items</DialogTitle>
            <DialogDescription>
              Details of items sold in sale #{selectedSaleId}
            </DialogDescription>
          </DialogHeader>
          {isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <p>Failed to load items</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          ) : items.length === 0 ? (
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
                {items.map((item) => (
                  <TableRow key={item.sale_item_id}>
                    <TableCell>{item.product_name}</TableCell>
                    <TableCell className="text-right">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {currencyFormatter(item.unit_price)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {currencyFormatter(item.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
