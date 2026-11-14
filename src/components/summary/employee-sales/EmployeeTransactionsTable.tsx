"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailedTransactionRow } from "@/actions/employee-summary";
import { currencyFormatter } from "@/config/formatter";
import TransactionDetailsModal from "./TransactionDetailsModal";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Copy,
  Check,
  CreditCard,
  Smartphone,
  Banknote,
  Landmark,
} from "lucide-react";
import { toast } from "sonner";

interface EmployeeTransactionsTableProps {
  transactions: DetailedTransactionRow[];
  totalRecords: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (sortBy: string) => void;
  isLoading?: boolean;
}

export default function EmployeeTransactionsTable({
  transactions,
  totalRecords,
  currentPage,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortOrder,
  onSortChange,
  isLoading = false,
}: EmployeeTransactionsTableProps) {
  const [selectedTx, setSelectedTx] = useState<DetailedTransactionRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleOpenDetails = (tx: DetailedTransactionRow) => {
    setSelectedTx(tx);
    setModalOpen(true);
  };

  const handleCopyReceipt = (e: React.MouseEvent, receiptNo: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(receiptNo);
    setCopiedId(receiptNo);
    toast.success("Receipt number copied");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] py-0 px-1.5 h-4">
            Completed
          </Badge>
        );
      case "refunded":
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] py-0 px-1.5 h-4">
            Refunded
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 text-[10px] py-0 px-1.5 h-4">
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 capitalize">
            {status}
          </Badge>
        );
    }
  };

  const getPaymentModeIcon = (mode: string) => {
    switch (mode.toLowerCase()) {
      case "momo":
        return <Smartphone className="h-3 w-3 text-amber-600 inline mr-1" />;
      case "card":
        return <CreditCard className="h-3 w-3 text-blue-600 inline mr-1" />;
      case "bank":
        return <Landmark className="h-3 w-3 text-purple-600 inline mr-1" />;
      case "cash":
      default:
        return <Banknote className="h-3 w-3 text-emerald-600 inline mr-1" />;
    }
  };

  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalRecords);

  return (
    <>
      <Card className="shadow-xs">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span>Detailed Transaction History</span>
            </CardTitle>
            <CardDescription className="text-sm">
              Itemized sales ledger with employee attribution and live status
            </CardDescription>
          </div>

          {/* Records count indicator */}
          <div className="text-sm text-muted-foreground">
            {totalRecords > 0 ? (
              <span>
                Showing <strong className="text-foreground">{startRecord}</strong> to{" "}
                <strong className="text-foreground">{endRecord}</strong> of{" "}
                <strong className="text-foreground">{totalRecords}</strong> transactions
              </span>
            ) : (
              <span>0 transactions</span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50 text-sm">
                <TableRow>
                  <TableHead className="w-[130px]">
                    <button
                      type="button"
                      onClick={() => onSortChange("receipt_no")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground"
                    >
                      Receipt #
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[140px]">
                    <button
                      type="button"
                      onClick={() => onSortChange("sale_date")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground"
                    >
                      Date & Time
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => onSortChange("user_name")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground"
                    >
                      Employee
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => onSortChange("customer_name")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground"
                    >
                      Customer
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[180px]">Items Summary</TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      onClick={() => onSortChange("total_amount")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground ml-auto"
                    >
                      Total Amount
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => onSortChange("status")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground"
                    >
                      Status
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right pr-4">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-sm">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={9} className="py-4 text-center">
                        <div className="h-4 bg-muted animate-pulse rounded w-4/5 mx-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No transaction records found matching the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx) => (
                    <TableRow
                      key={tx.saleId}
                      className="hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => handleOpenDetails(tx)}
                    >
                      <TableCell className="font-mono font-medium">
                        <div className="flex items-center gap-1">
                          <span className="truncate">{tx.receiptNo}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyReceipt(e, tx.receiptNo)}
                            className="text-muted-foreground hover:text-foreground p-0.5"
                            title="Copy receipt #"
                          >
                            {copiedId === tx.receiptNo ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {tx.saleDate
                          ? format(new Date(tx.saleDate), "MMM dd, yyyy HH:mm")
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{tx.employeeName}</span>
                          <span className="text-[11px] text-muted-foreground">
                            @{tx.employeeUsername}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground truncate max-w-[120px]">
                            {tx.customerName}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {tx.customerPhone || "Walk-in"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="truncate max-w-[200px] text-foreground" title={tx.itemsSummary}>
                            {tx.itemsSummary}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {tx.itemCount} {tx.itemCount === 1 ? "unit" : "units"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {currencyFormatter(tx.totalAmount)}
                      </TableCell>
                      <TableCell className="capitalize whitespace-nowrap">
                        <span className="inline-flex items-center">
                          {getPaymentModeIcon(tx.paymentMode)}
                          {tx.paymentMode}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(tx.status)}</TableCell>
                      <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDetails(tx)}
                          className="h-7 text-sm gap-1 text-primary hover:text-primary hover:bg-primary/10"
                        >
                          <Eye className="h-3 w-3" />
                          <span>View</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-t gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Rows per page:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(val) => onPageSizeChange(Number(val))}
              >
                <SelectTrigger className="h-8 w-16 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="text-sm">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                Page {currentPage} of {totalPages || 1}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line-item Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTx}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
