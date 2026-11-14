"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import {
  Receipt,
  User,
  CreditCard,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Copy,
  Printer,
  ExternalLink,
} from "lucide-react";
import { AdminDetailedTransaction } from "@/actions/dashboard";
import { toast } from "sonner";
import Link from "next/link";

interface AdminTransactionDetailsModalProps {
  transaction: AdminDetailedTransaction | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AdminTransactionDetailsModal({
  transaction,
  isOpen,
  onClose,
}: AdminTransactionDetailsModalProps) {
  if (!transaction) return null;

  const handleCopyReceipt = () => {
    navigator.clipboard.writeText(transaction.receiptNo || transaction.id);
    toast.success("Receipt number copied to clipboard");
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === "completed") {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      );
    }
    if (s === "refunded") {
      return (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <AlertCircle className="mr-1 h-3 w-3" />
          Refunded
        </Badge>
      );
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-primary/10 text-primary">
                <Receipt className="h-4.5 w-4.5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  Transaction Summary
                </DialogTitle>
                <DialogDescription className="text-sm">
                  Receipt #{transaction.receiptNo || transaction.id.slice(0, 8)}
                </DialogDescription>
              </div>
            </div>
            {getStatusBadge(transaction.status)}
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Key metadata grid */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
            <div>
              <span className="text-muted-foreground">Customer</span>
              <p className="font-semibold text-foreground mt-0.5">
                {transaction.customerName}
              </p>
              {transaction.customerPhone && (
                <p className="text-muted-foreground">{transaction.customerPhone}</p>
              )}
            </div>

            <div>
              <span className="text-muted-foreground">Cashier / Staff</span>
              <p className="font-semibold text-foreground mt-0.5">
                {transaction.cashierName}
              </p>
            </div>

            <div>
              <span className="text-muted-foreground">Date & Time</span>
              <p className="font-semibold text-foreground mt-0.5">
                {transaction.saleDate
                  ? format(new Date(transaction.saleDate), "PPpp")
                  : "N/A"}
              </p>
            </div>

            <div>
              <span className="text-muted-foreground">Payment Method</span>
              <p className="font-semibold capitalize text-foreground mt-0.5">
                {transaction.paymentMode}
              </p>
            </div>
          </div>

          {/* Amount Breakdown */}
          <div className="space-y-2 rounded-lg border p-3.5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Items in Cart</span>
              <span className="font-medium text-foreground">{transaction.itemCount} item(s)</span>
            </div>

            {transaction.discount > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Discount Applied</span>
                <span className="font-medium text-emerald-600">
                  -{formatCurrency(transaction.discount)}
                </span>
              </div>
            )}

            {transaction.tax > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Tax</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(transaction.tax)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-2 text-sm font-bold text-foreground">
              <span>Total Paid</span>
              <span className="text-base text-primary">
                {formatCurrency(transaction.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between border-t pt-4 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyReceipt}
            className="gap-1.5 text-sm"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy Receipt #</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-sm"
            >
              Close
            </Button>
            <Button
              asChild
              size="sm"
              className="gap-1.5 text-sm font-semibold"
            >
              <Link href="/admin/summary">
                <span>Full Ledger</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
