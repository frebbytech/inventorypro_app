"use client";

import React, { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import {
  Search,
  Receipt,
  Eye,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { AdminDetailedTransaction } from "@/actions/dashboard";
import { AdminTransactionDetailsModal } from "./AdminTransactionDetailsModal";
import Link from "next/link";

interface AdminRecentTransactionsProps {
  transactions: AdminDetailedTransaction[];
}

export function AdminRecentTransactions({
  transactions = [],
}: AdminRecentTransactionsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [selectedTx, setSelectedTx] = useState<AdminDetailedTransaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchSearch =
        searchTerm === "" ||
        tx.receiptNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.cashierName?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus =
        statusFilter === "all" || tx.status?.toLowerCase() === statusFilter.toLowerCase();

      const matchPayment =
        paymentFilter === "all" ||
        tx.paymentMode?.toLowerCase().includes(paymentFilter.toLowerCase());

      return matchSearch && matchStatus && matchPayment;
    });
  }, [transactions, searchTerm, statusFilter, paymentFilter]);

  const handleOpenDetails = (tx: AdminDetailedTransaction) => {
    setSelectedTx(tx);
    setIsModalOpen(true);
  };

  const getStatusBadge = (status?: string | null) => {
    const s = (status ?? "").toLowerCase();
    if (s === "completed") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Completed
        </span>
      );
    }
    if (s === "refunded") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Refunded
        </span>
      );
    }
    return (
      <Badge variant="outline" className="text-sm capitalize">
        {status}
      </Badge>
    );
  };

  return (
    <>
      <Card className="rounded-xl border bg-card/70 shadow-xs">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold tracking-tight sm:text-lg">
                  Recent Sales Transactions
                </CardTitle>
                <Badge variant="outline" className="text-sm font-semibold">
                  {transactions.length} Latest Records
                </Badge>
              </div>
              <CardDescription className="text-sm">
                Real-time register log of retail checkouts, tenders, and receipts.
              </CardDescription>
            </div>

            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-sm font-semibold">
              <Link href="/admin/summary">
                <span>Complete Sales Report</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {/* Filtering Bar */}
          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search receipt, customer, staff..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Payment Filter */}
              <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
                {[
                  { id: "all", label: "All Tender" },
                  { id: "cash", label: "Cash" },
                  { id: "momo", label: "MoMo" },
                  { id: "card", label: "Card" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPaymentFilter(item.id)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                      paymentFilter === item.id
                        ? "bg-background text-primary shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted/20">
                  <TableHead className="w-[140px] text-sm font-semibold">Receipt #</TableHead>
                  <TableHead className="text-sm font-semibold">Customer</TableHead>
                  <TableHead className="text-sm font-semibold">Cashier</TableHead>
                  <TableHead className="text-sm font-semibold">Date & Time</TableHead>
                  <TableHead className="text-sm font-semibold">Tender</TableHead>
                  <TableHead className="text-right text-sm font-semibold">Amount</TableHead>
                  <TableHead className="text-center text-sm font-semibold">Status</TableHead>
                  <TableHead className="w-[80px] text-right text-sm font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((tx) => (
                    <TableRow
                      key={tx.id}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                      onClick={() => handleOpenDetails(tx)}
                    >
                      {/* Receipt ID */}
                      <TableCell className="font-mono text-sm font-bold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{tx.receiptNo}</span>
                        </div>
                      </TableCell>

                      {/* Customer */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 text-[10px] font-bold">
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {tx.customerName ? tx.customerName.slice(0, 2).toUpperCase() : "CU"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
                            {tx.customerName}
                          </span>
                        </div>
                      </TableCell>

                      {/* Cashier */}
                      <TableCell className="text-sm text-muted-foreground">
                        {tx.cashierName}
                      </TableCell>

                      {/* Date & Time */}
                      <TableCell className="text-sm text-muted-foreground">
                        {tx.saleDate ? format(new Date(tx.saleDate), "MMM d, h:mm a") : "N/A"}
                      </TableCell>

                      {/* Payment Method */}
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-medium capitalize">
                          {tx.paymentMode}
                        </Badge>
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="text-right font-semibold text-foreground text-sm">
                        {formatCurrency(tx.totalAmount)}
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          {tx.itemCount} item(s)
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-center">
                        {getStatusBadge(tx.status)}
                      </TableCell>

                      {/* Action */}
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDetails(tx)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                          title="View Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                      No matching sales transactions found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Details Modal */}
      <AdminTransactionDetailsModal
        transaction={selectedTx}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
