"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  User,
  Calendar,
  CreditCard,
  Package,
  ShoppingBag,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSalesItemsBySalesId } from "@/actions/sales";
import { currencyFormatter } from "@/config/formatter";
import { DetailedTransactionRow } from "@/actions/employee-summary";
import { toast } from "sonner";

interface TransactionDetailsModalProps {
  transaction: DetailedTransactionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TransactionDetailsModal({
  transaction,
  open,
  onOpenChange,
}: TransactionDetailsModalProps) {
  const [copied, setCopied] = useState(false);

  const saleId = transaction?.saleId;

  const {
    data: items = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["sale-items-detail", saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const res = await getSalesItemsBySalesId(saleId);
      if (!res.success || !res.data) return [];
      return res.data;
    },
    enabled: !!saleId && open,
    staleTime: 5 * 60 * 1000,
  });

  const handleCopyReceipt = () => {
    if (transaction?.receiptNo) {
      navigator.clipboard.writeText(transaction.receiptNo);
      setCopied(true);
      toast.success("Receipt number copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!transaction) return null;

  const formattedDate = transaction.saleDate
    ? format(new Date(transaction.saleDate), "PPP 'at' p")
    : "N/A";

  const getStatusBadge = (status?: string | null) => {
    switch ((status ?? "").toLowerCase()) {
      case "completed":
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">Completed</Badge>;
      case "refunded":
        return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Refunded</Badge>;
      case "cancelled":
        return <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30">Cancelled</Badge>;
      default:
        return <Badge variant="secondary" className="capitalize">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <span>Sale Details</span>
                <span className="font-mono text-base font-medium text-muted-foreground">
                  #{transaction.receiptNo}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={handleCopyReceipt}
                  title="Copy Receipt #"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </DialogTitle>
              <DialogDescription>
                Full transaction breakdown and line items
              </DialogDescription>
            </div>
            <div>{getStatusBadge(transaction.status)}</div>
          </div>
        </DialogHeader>

        <Separator />

        {/* Transaction Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 text-sm">
          <div className="p-3 bg-muted/40 rounded-lg space-y-1">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <User className="h-3.5 w-3.5" /> Employee
            </span>
            <p className="font-medium truncate">{transaction.employeeName}</p>
            <p className="text-sm text-muted-foreground truncate">@{transaction.employeeUsername}</p>
          </div>

          <div className="p-3 bg-muted/40 rounded-lg space-y-1">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <ShoppingBag className="h-3.5 w-3.5" /> Customer
            </span>
            <p className="font-medium truncate">{transaction.customerName}</p>
            <p className="text-sm text-muted-foreground truncate">{transaction.customerPhone || "Walk-in"}</p>
          </div>

          <div className="p-3 bg-muted/40 rounded-lg space-y-1">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <CreditCard className="h-3.5 w-3.5" /> Payment
            </span>
            <p className="font-medium capitalize">{transaction.paymentMode}</p>
            <p className="text-sm text-muted-foreground">
              {/* Paid: {currencyFormatter(transaction.amountPaid)} */}
            </p>
          </div>

          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-1">
            <span className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <DollarSign className="h-3.5 w-3.5" /> Total Net
            </span>
            <p className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
              {currencyFormatter(transaction.totalAmount)}
            </p>
            <p className="text-sm text-muted-foreground">{transaction.itemCount} items</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Calendar className="h-3.5 w-3.5" />
          <span>Date & Time: {formattedDate}</span>
        </div>

        {transaction.details && (
          <div className="p-2.5 bg-muted/30 rounded border text-sm text-muted-foreground italic">
            Note: {transaction.details}
          </div>
        )}

        <Separator />

        {/* Line Items Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4" />
              Products Included
            </h4>
            <span className="text-sm text-muted-foreground">
              {items.length} product entries
            </span>
          </div>

          {isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-6 text-sm text-destructive">
              Failed to load product details.
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground bg-muted/20 rounded-lg">
              No individual line item details found for this sale.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-sm">Product</TableHead>
                    <TableHead className="text-sm text-right">Unit Price</TableHead>
                    <TableHead className="text-sm text-right">Qty</TableHead>
                    <TableHead className="text-sm text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: any) => (
                    <TableRow key={item.id || item.sale_item_id}>
                      <TableCell className="text-sm font-medium">
                        {item.product_name}
                      </TableCell>
                      <TableCell className="text-sm text-right">
                        {currencyFormatter(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-sm text-right font-semibold">
                        {currencyFormatter(item.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Financial Summary */}
        <div className="space-y-1.5 pt-2 border-t text-sm">
          {transaction.discount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Discount Applied</span>
              <span className="text-amber-600 font-medium">-{currencyFormatter(transaction.discount)}</span>
            </div>
          )}
          {transaction.tax > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Tax / VAT (5%)</span>
              <span>{currencyFormatter(transaction.tax)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-sm pt-1 border-t">
            <span>Final Total</span>
            <span className="text-emerald-600 font-bold">{currencyFormatter(transaction.totalAmount)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
