"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import {
  deleteSupplierTransaction,
  getSupplierTransactions,
} from "@/actions/supplier-transactions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currencyFormatter } from "@/config/formatter";
import { cn } from "@/lib/utils";
import type {
  SupplierInfoView,
  SupplierTransactionView,
} from "@/types/globals";
import RecordSupplierTransactionModal from "./RecordSupplierTransactionModal";
import SupplierTransactionDetailsModal from "./SupplierTransactionDetailsModal";
import {
  supplierOptionsQuery,
  supplierTransactionKeys,
} from "./supplier-transaction-queries";
import { Heading } from "@/components/ui/heading";
import PageContainer from "@/components/layout/page-container";

interface SupplierTransactionListingPageProps {
  supplierId?: string;
  hideHeader?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Helpers (module scope)                                                    */
/* -------------------------------------------------------------------------- */

// Stable references so `?? []` doesn't create a new array on every render.
const NO_TRANSACTIONS: SupplierTransactionView[] = [];
const NO_SUPPLIERS: SupplierInfoView[] = [];

// Fixed locale keeps formatting consistent between server and browser.
const countFormat = new Intl.NumberFormat("en-GH");
const dateTimeFormat = new Intl.DateTimeFormat("en-GH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "cheque", label: "Cheque" },
  { value: "credit", label: "Credit" },
];

const toNumber = (value: unknown) => Number(value) || 0;

function formatDateTime(value?: string | Date | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : dateTimeFormat.format(date);
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

function KpiCell({
  label,
  figure,
  caption,
  figureClassName,
}: {
  label: string;
  figure: ReactNode;
  caption: string;
  figureClassName?: string;
}) {
  return (
    <div className="flex flex-col bg-card p-5 sm:p-6">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl",
          figureClassName,
        )}
      >
        {figure}
      </dd>
      <dd className="mt-auto pt-4 text-sm text-muted-foreground">{caption}</dd>
    </div>
  );
}

function StatusText({ txn }: { txn: SupplierTransactionView }) {
  const dot =
    txn.status === "completed"
      ? "bg-emerald-500"
      : toNumber(txn.balance) > 0
        ? "bg-rose-500"
        : "bg-muted-foreground/50";

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {txn.status ? capitalize(txn.status) : "Unknown"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SupplierTransactionListingPage({
  supplierId,
  hideHeader = false,
}: SupplierTransactionListingPageProps) {
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState<string>(
    supplierId || "all",
  );
  const [filterPayment, setFilterPayment] = useState<string>("all");

  // Modals
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    ref: string;
  } | null>(null);

  const targetSupplier =
    supplierId || (filterSupplier !== "all" ? filterSupplier : undefined);

  /* ---- data ---- */

  const transactionsQuery = useQuery({
    queryKey: supplierTransactionKeys.list(targetSupplier),
    queryFn: async () => {
      const res = await getSupplierTransactions(targetSupplier);
      if (!res.success)
        throw new Error(res.message || "Couldn't load transactions.");
      return res.data ?? NO_TRANSACTIONS;
    },
    // Switching supplier keeps the current rows on screen (dimmed) while the next list loads.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // Same cache entry the record modal uses. The filter isn't shown when a supplier is pinned.
  const suppliersQuery = useQuery({
    ...supplierOptionsQuery(),
    enabled: !supplierId,
  });

  const transactions = transactionsQuery.data ?? NO_TRANSACTIONS;
  const suppliers = suppliersQuery.data ?? NO_SUPPLIERS;

  const invalidateLists = () =>
    queryClient.invalidateQueries({ queryKey: supplierTransactionKeys.lists });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteSupplierTransaction(id);
      if (!res.success)
        throw new Error(res.message || "Couldn't delete the transaction.");
    },
    onSuccess: () => {
      toast.success("Transaction deleted");
      setPendingDelete(null);
    },
    onError: (err) => {
      toast.error("Couldn't delete the transaction", {
        description: err.message,
      });
    },
    onSettled: invalidateLists,
  });

  const isDeleting = deleteMutation.isPending;

  /* ---- derived ---- */

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();

    return transactions.filter((txn) => {
      const matchesSearch =
        !q ||
        [
          txn.transaction_no,
          txn.supplier_name,
          txn.delivered_by,
          txn.notes,
        ].some((field) => field?.toLowerCase().includes(q));
      const matchesPayment =
        filterPayment === "all" || txn.payment_mode === filterPayment;

      return matchesSearch && matchesPayment;
    });
  }, [transactions, search, filterPayment]);

  // The figures follow the table: they add up whatever rows are showing.
  const totals = useMemo(() => {
    let value = 0;
    let balance = 0;
    let items = 0;

    for (const txn of filteredTransactions) {
      value += toNumber(txn.total_amount);
      balance += toNumber(txn.balance);
      items += toNumber(txn.total_items_count);
    }

    return { value, balance, items };
  }, [filteredTransactions]);

  const isFiltered = search.trim() !== "" || filterPayment !== "all";

  function clearFilters() {
    setSearch("");
    setFilterPayment("all");
  }

  function openDetails(id: string) {
    setSelectedTxnId(id);
    setDetailsOpen(true);
  }

  // The modal refreshes the lists itself after saving, so no onSuccess is needed here.
  const recordButton = (
    <RecordSupplierTransactionModal initialSupplierId={supplierId} />
  );

  return (
    <PageContainer>
      <div className="space-y-6">
        {!hideHeader && (
          <Heading
            title="Supplier Transactions"
            description=" Deliveries, supplier invoices, items supplied and payment status."
            button={recordButton}
          />
        )}

        <section aria-label="Totals">
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
            <KpiCell
              label="Transactions"
              figure={countFormat.format(filteredTransactions.length)}
              caption="Recorded deliveries"
            />
            <KpiCell
              label="Total value"
              figure={currencyFormatter(totals.value)}
              caption="Supply value"
            />
            <KpiCell
              label="Outstanding balance"
              figure={currencyFormatter(totals.balance)}
              caption="Owed to suppliers"
              figureClassName={
                totals.balance > 0 ? "text-destructive" : undefined
              }
            />
            <KpiCell
              label="Items supplied"
              figure={countFormat.format(totals.items)}
              caption="Product lines delivered"
            />
          </dl>
        </section>

        <section
          aria-label="Transactions"
          className="overflow-hidden rounded-xl border bg-card"
        >
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex w-full flex-1 flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  aria-label="Search transactions"
                  placeholder="Search receipt, supplier or driver"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {!supplierId && (
                <Select
                  value={filterSupplier}
                  onValueChange={setFilterSupplier}
                >
                  <SelectTrigger
                    aria-label="Filter by supplier"
                    className="w-full sm:w-48"
                  >
                    <SelectValue placeholder="All suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All suppliers</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={filterPayment} onValueChange={setFilterPayment}>
                <SelectTrigger
                  aria-label="Filter by payment mode"
                  className="w-full sm:w-44"
                >
                  <SelectValue placeholder="Payment mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payment modes</SelectItem>
                  {PAYMENT_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={transactionsQuery.isFetching}
                onClick={() => void transactionsQuery.refetch()}
              >
                <RefreshCw
                  aria-hidden
                  className={cn(
                    "size-4",
                    transactionsQuery.isFetching && "animate-spin",
                  )}
                />
                Refresh
              </Button>
              {hideHeader && recordButton}
            </div>
          </div>

          {transactionsQuery.isPending ? (
            <div
              role="status"
              aria-label="Loading transactions"
              className="space-y-3 p-4"
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : transactionsQuery.isError && !transactionsQuery.data ? (
            <div
              role="alert"
              className="flex flex-col items-center gap-3 px-5 py-12 text-center"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Couldn't load transactions
                </p>
                <p className="text-sm text-muted-foreground">
                  {transactionsQuery.error.message}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void transactionsQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {isFiltered
                  ? "No transactions match these filters."
                  : "No supplier transactions yet."}
              </p>
              {isFiltered && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div
              aria-busy={transactionsQuery.isFetching}
              className={cn(
                "transition-opacity",
                transactionsQuery.isPlaceholderData && "opacity-60",
              )}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Reference</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Delivered by</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((txn) => {
                    const ref = txn.transaction_no || txn.id.slice(0, 10);
                    const balance = toNumber(txn.balance);

                    return (
                      // The row is a mouse shortcut; the reference button is the keyboard route.
                      <TableRow
                        key={txn.id}
                        className="cursor-pointer"
                        onClick={() => openDetails(txn.id)}
                      >
                        <TableCell className="pl-4">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetails(txn.id);
                            }}
                            className="rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {ref}
                          </button>
                          <p className="text-sm text-muted-foreground">
                            {formatDateTime(txn.transaction_date)}
                          </p>
                        </TableCell>

                        <TableCell>
                          <p className="font-medium">{txn.supplier_name}</p>
                          {txn.company_name &&
                            txn.company_name !== txn.supplier_name && (
                              <p className="text-sm text-muted-foreground">
                                {txn.company_name}
                              </p>
                            )}
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {txn.delivered_by || "—"}
                        </TableCell>

                        <TableCell className="text-right tabular-nums">
                          {countFormat.format(toNumber(txn.total_items_count))}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {currencyFormatter(toNumber(txn.total_amount))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {currencyFormatter(toNumber(txn.amount_paid))}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            balance > 0
                              ? "font-medium text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {currencyFormatter(balance)}
                        </TableCell>

                        <TableCell>
                          <StatusText txn={txn} />
                        </TableCell>

                        <TableCell
                          className="pr-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetails(txn.id)}
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setPendingDelete({ id: txn.id, ref })
                            }
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <SupplierTransactionDetailsModal
          transactionId={selectedTxnId}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />

        <Dialog
          open={pendingDelete !== null}
          onOpenChange={(open) =>
            !open && !isDeleting && setPendingDelete(null)
          }
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader className="text-left">
              <DialogTitle>
                Delete transaction {pendingDelete?.ref}?
              </DialogTitle>
              <DialogDescription>This can't be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                disabled={isDeleting}
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={isDeleting}
                onClick={() =>
                  pendingDelete && deleteMutation.mutate(pendingDelete.id)
                }
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
}

// "use client";

// import { useMemo, useState, type ReactNode } from "react";
// import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { RefreshCw, Search } from "lucide-react";
// import { toast } from "sonner";

// import { getSuppliers } from "@/actions/suppliers";
// import { deleteSupplierTransaction, getSupplierTransactions } from "@/actions/supplier-transactions";
// import { Button } from "@/components/ui/button";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { Input } from "@/components/ui/input";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Skeleton } from "@/components/ui/skeleton";
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "@/components/ui/table";
// import { currencyFormatter } from "@/config/formatter";
// import { cn } from "@/lib/utils";
// import type { SupplierInfoView, SupplierTransactionView } from "@/types/globals";
// import RecordSupplierTransactionModal from "./RecordSupplierTransactionModal";
// import SupplierTransactionDetailsModal from "./SupplierTransactionDetailsModal";

// interface SupplierTransactionListingPageProps {
//   supplierId?: string;
//   hideHeader?: boolean;
// }

// /* -------------------------------------------------------------------------- */
// /*  Query keys                                                                */
// /* -------------------------------------------------------------------------- */

// /**
//  * Exported so anything that changes supplier transactions elsewhere (a payment
//  * modal, a supplier page) can invalidate `lists` and keep this page fresh.
//  */
// export const supplierTransactionKeys = {
//   lists: ["supplier-transactions", "list"] as const,
//   list: (supplierId?: string) => ["supplier-transactions", "list", supplierId ?? "all"] as const,
//   supplierOptions: ["supplier-transactions", "supplier-options"] as const,
// };

// /* -------------------------------------------------------------------------- */
// /*  Helpers (module scope)                                                    */
// /* -------------------------------------------------------------------------- */

// // Stable references so `?? []` doesn't create a new array on every render.
// const NO_TRANSACTIONS: SupplierTransactionView[] = [];
// const NO_SUPPLIERS: SupplierInfoView[] = [];

// // Fixed locale keeps formatting consistent between server and browser.
// const countFormat = new Intl.NumberFormat("en-GH");
// const dateTimeFormat = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" });

// const PAYMENT_MODES = [
//   { value: "cash", label: "Cash" },
//   { value: "bank", label: "Bank transfer" },
//   { value: "momo", label: "Mobile money" },
//   { value: "cheque", label: "Cheque" },
//   { value: "credit", label: "Credit" },
// ];

// const toNumber = (value: unknown) => Number(value) || 0;

// function formatDateTime(value?: string | Date | null) {
//   if (!value) return "N/A";
//   const date = new Date(value);
//   return Number.isNaN(date.getTime()) ? "N/A" : dateTimeFormat.format(date);
// }

// const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

// function KpiCell({
//   label,
//   figure,
//   caption,
//   figureClassName,
// }: {
//   label: string;
//   figure: ReactNode;
//   caption: string;
//   figureClassName?: string;
// }) {
//   return (
//     <div className="flex flex-col bg-card p-5 sm:p-6">
//       <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
//       <dd
//         className={cn(
//           "mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl",
//           figureClassName
//         )}
//       >
//         {figure}
//       </dd>
//       <dd className="mt-auto pt-4 text-sm text-muted-foreground">{caption}</dd>
//     </div>
//   );
// }

// function StatusText({ txn }: { txn: SupplierTransactionView }) {
//   const dot =
//     txn.status === "completed"
//       ? "bg-emerald-500"
//       : toNumber(txn.balance) > 0
//         ? "bg-rose-500"
//         : "bg-muted-foreground/50";

//   return (
//     <span className="inline-flex items-center gap-1.5 text-sm">
//       <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
//       {txn.status ? capitalize(txn.status) : "Unknown"}
//     </span>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /*  Component                                                                 */
// /* -------------------------------------------------------------------------- */

// export default function SupplierTransactionListingPage({
//   supplierId,
//   hideHeader = false,
// }: SupplierTransactionListingPageProps) {
//   const queryClient = useQueryClient();

//   // Filters
//   const [search, setSearch] = useState("");
//   const [filterSupplier, setFilterSupplier] = useState<string>(supplierId || "all");
//   const [filterPayment, setFilterPayment] = useState<string>("all");

//   // Modals
//   const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
//   const [detailsOpen, setDetailsOpen] = useState(false);
//   const [pendingDelete, setPendingDelete] = useState<{ id: string; ref: string } | null>(null);

//   const targetSupplier = supplierId || (filterSupplier !== "all" ? filterSupplier : undefined);

//   /* ---- data ---- */

//   const transactionsQuery = useQuery({
//     queryKey: supplierTransactionKeys.list(targetSupplier),
//     queryFn: async () => {
//       const res = await getSupplierTransactions(targetSupplier);
//       if (!res.success) throw new Error(res.message || "Couldn't load transactions.");
//       return res.data ?? NO_TRANSACTIONS;
//     },
//     // Switching supplier keeps the current rows on screen (dimmed) while the next list loads.
//     placeholderData: keepPreviousData,
//     staleTime: 30_000,
//   });

//   const suppliersQuery = useQuery({
//     queryKey: supplierTransactionKeys.supplierOptions,
//     queryFn: async () => {
//       const res = await getSuppliers();
//       if (!res.success) throw new Error(res.message || "Couldn't load suppliers.");
//       return res.data ?? NO_SUPPLIERS;
//     },
//     enabled: !supplierId, // the supplier filter isn't shown when one is pinned
//     staleTime: 5 * 60_000,
//   });

//   const transactions = transactionsQuery.data ?? NO_TRANSACTIONS;
//   const suppliers = suppliersQuery.data ?? NO_SUPPLIERS;

//   const invalidateLists = () => queryClient.invalidateQueries({ queryKey: supplierTransactionKeys.lists });

//   const deleteMutation = useMutation({
//     mutationFn: async (id: string) => {
//       const res = await deleteSupplierTransaction(id);
//       if (!res.success) throw new Error(res.message || "Couldn't delete the transaction.");
//     },
//     onSuccess: () => {
//       toast.success("Transaction deleted");
//       setPendingDelete(null);
//     },
//     onError: (err) => {
//       toast.error("Couldn't delete the transaction", { description: err.message });
//     },
//     onSettled: invalidateLists,
//   });

//   const isDeleting = deleteMutation.isPending;

//   /* ---- derived ---- */

//   const filteredTransactions = useMemo(() => {
//     const q = search.trim().toLowerCase();

//     return transactions.filter((txn) => {
//       const matchesSearch =
//         !q ||
//         [txn.transaction_no, txn.supplier_name, txn.delivered_by, txn.notes].some((field) =>
//           field?.toLowerCase().includes(q)
//         );
//       const matchesPayment = filterPayment === "all" || txn.payment_mode === filterPayment;

//       return matchesSearch && matchesPayment;
//     });
//   }, [transactions, search, filterPayment]);

//   // The figures follow the table: they add up whatever rows are showing.
//   const totals = useMemo(() => {
//     let value = 0;
//     let balance = 0;
//     let items = 0;

//     for (const txn of filteredTransactions) {
//       value += toNumber(txn.total_amount);
//       balance += toNumber(txn.balance);
//       items += toNumber(txn.total_items_count);
//     }

//     return { value, balance, items };
//   }, [filteredTransactions]);

//   const isFiltered = search.trim() !== "" || filterPayment !== "all";

//   function clearFilters() {
//     setSearch("");
//     setFilterPayment("all");
//   }

//   function openDetails(id: string) {
//     setSelectedTxnId(id);
//     setDetailsOpen(true);
//   }

//   const recordButton = (
//     <RecordSupplierTransactionModal initialSupplierId={supplierId} onSuccess={invalidateLists} />
//   );

//   return (
//     <div className="space-y-6">
//       {!hideHeader && (
//         <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
//           <div className="space-y-1">
//             <h2 className="text-2xl font-semibold tracking-tight">Supplier transactions</h2>
//             <p className="text-sm text-muted-foreground">
//               Deliveries, supplier invoices, items supplied and payment status.
//             </p>
//           </div>
//           {recordButton}
//         </header>
//       )}

//       <section aria-label="Totals">
//         <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
//           <KpiCell
//             label="Transactions"
//             figure={countFormat.format(filteredTransactions.length)}
//             caption="Recorded deliveries"
//           />
//           <KpiCell label="Total value" figure={currencyFormatter(totals.value)} caption="Supply value" />
//           <KpiCell
//             label="Outstanding balance"
//             figure={currencyFormatter(totals.balance)}
//             caption="Owed to suppliers"
//             figureClassName={totals.balance > 0 ? "text-destructive" : undefined}
//           />
//           <KpiCell
//             label="Items supplied"
//             figure={countFormat.format(totals.items)}
//             caption="Product lines delivered"
//           />
//         </dl>
//       </section>

//       <section aria-label="Transactions" className="overflow-hidden rounded-xl border bg-card">
//         <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
//           <div className="flex w-full flex-1 flex-col gap-3 sm:flex-row">
//             <div className="relative flex-1">
//               <Search
//                 aria-hidden
//                 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
//               />
//               <Input
//                 type="search"
//                 aria-label="Search transactions"
//                 placeholder="Search receipt, supplier or driver"
//                 value={search}
//                 onChange={(e) => setSearch(e.target.value)}
//                 className="pl-9"
//               />
//             </div>

//             {!supplierId && (
//               <Select value={filterSupplier} onValueChange={setFilterSupplier}>
//                 <SelectTrigger aria-label="Filter by supplier" className="w-full sm:w-48">
//                   <SelectValue placeholder="All suppliers" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   <SelectItem value="all">All suppliers</SelectItem>
//                   {suppliers.map((s) => (
//                     <SelectItem key={s.id} value={s.id}>
//                       {s.name}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             )}

//             <Select value={filterPayment} onValueChange={setFilterPayment}>
//               <SelectTrigger aria-label="Filter by payment mode" className="w-full sm:w-44">
//                 <SelectValue placeholder="Payment mode" />
//               </SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="all">All payment modes</SelectItem>
//                 {PAYMENT_MODES.map((mode) => (
//                   <SelectItem key={mode.value} value={mode.value}>
//                     {mode.label}
//                   </SelectItem>
//                 ))}
//               </SelectContent>
//             </Select>
//           </div>

//           <div className="flex items-center justify-end gap-2">
//             <Button
//               variant="outline"
//               size="sm"
//               className="gap-2"
//               disabled={transactionsQuery.isFetching}
//               onClick={() => void transactionsQuery.refetch()}
//             >
//               <RefreshCw
//                 aria-hidden
//                 className={cn("size-4", transactionsQuery.isFetching && "animate-spin")}
//               />
//               Refresh
//             </Button>
//             {hideHeader && recordButton}
//           </div>
//         </div>

//         {transactionsQuery.isPending ? (
//           <div role="status" aria-label="Loading transactions" className="space-y-3 p-4">
//             {Array.from({ length: 5 }).map((_, i) => (
//               <Skeleton key={i} className="h-10 w-full" />
//             ))}
//           </div>
//         ) : transactionsQuery.isError && !transactionsQuery.data ? (
//           <div role="alert" className="flex flex-col items-center gap-3 px-5 py-12 text-center">
//             <div className="space-y-1">
//               <p className="text-sm font-medium">Couldn't load transactions</p>
//               <p className="text-sm text-muted-foreground">{transactionsQuery.error.message}</p>
//             </div>
//             <Button variant="outline" size="sm" onClick={() => void transactionsQuery.refetch()}>
//               Try again
//             </Button>
//           </div>
//         ) : filteredTransactions.length === 0 ? (
//           <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
//             <p className="text-sm text-muted-foreground">
//               {isFiltered ? "No transactions match these filters." : "No supplier transactions yet."}
//             </p>
//             {isFiltered && (
//               <Button variant="outline" size="sm" onClick={clearFilters}>
//                 Clear filters
//               </Button>
//             )}
//           </div>
//         ) : (
//           <div
//             aria-busy={transactionsQuery.isFetching}
//             className={cn("transition-opacity", transactionsQuery.isPlaceholderData && "opacity-60")}
//           >
//             <Table>
//               <TableHeader>
//                 <TableRow>
//                   <TableHead className="pl-4">Reference</TableHead>
//                   <TableHead>Supplier</TableHead>
//                   <TableHead>Delivered by</TableHead>
//                   <TableHead className="text-right">Items</TableHead>
//                   <TableHead className="text-right">Total</TableHead>
//                   <TableHead className="text-right">Paid</TableHead>
//                   <TableHead className="text-right">Balance</TableHead>
//                   <TableHead>Status</TableHead>
//                   <TableHead className="pr-4 text-right">
//                     <span className="sr-only">Actions</span>
//                   </TableHead>
//                 </TableRow>
//               </TableHeader>
//               <TableBody>
//                 {filteredTransactions.map((txn) => {
//                   const ref = txn.transaction_no || txn.id.slice(0, 10);
//                   const balance = toNumber(txn.balance);

//                   return (
//                     // The row is a mouse shortcut; the reference button is the keyboard route.
//                     <TableRow key={txn.id} className="cursor-pointer" onClick={() => openDetails(txn.id)}>
//                       <TableCell className="pl-4">
//                         <button
//                           type="button"
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             openDetails(txn.id);
//                           }}
//                           className="rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
//                         >
//                           {ref}
//                         </button>
//                         <p className="text-sm text-muted-foreground">
//                           {formatDateTime(txn.transaction_date)}
//                         </p>
//                       </TableCell>

//                       <TableCell>
//                         <p className="font-medium">{txn.supplier_name}</p>
//                         {txn.company_name && txn.company_name !== txn.supplier_name && (
//                           <p className="text-sm text-muted-foreground">{txn.company_name}</p>
//                         )}
//                       </TableCell>

//                       <TableCell className="text-muted-foreground">{txn.delivered_by || "—"}</TableCell>

//                       <TableCell className="text-right tabular-nums">
//                         {countFormat.format(toNumber(txn.total_items_count))}
//                       </TableCell>
//                       <TableCell className="text-right font-medium tabular-nums">
//                         {currencyFormatter(toNumber(txn.total_amount))}
//                       </TableCell>
//                       <TableCell className="text-right tabular-nums">
//                         {currencyFormatter(toNumber(txn.amount_paid))}
//                       </TableCell>
//                       <TableCell
//                         className={cn(
//                           "text-right tabular-nums",
//                           balance > 0 ? "font-medium text-destructive" : "text-muted-foreground"
//                         )}
//                       >
//                         {currencyFormatter(balance)}
//                       </TableCell>

//                       <TableCell>
//                         <StatusText txn={txn} />
//                       </TableCell>

//                       <TableCell
//                         className="pr-4 text-right whitespace-nowrap"
//                         onClick={(e) => e.stopPropagation()}
//                       >
//                         <Button variant="ghost" size="sm" onClick={() => openDetails(txn.id)}>
//                           View
//                         </Button>
//                         <Button
//                           variant="ghost"
//                           size="sm"
//                           className="text-muted-foreground hover:text-destructive"
//                           onClick={() => setPendingDelete({ id: txn.id, ref })}
//                         >
//                           Delete
//                         </Button>
//                       </TableCell>
//                     </TableRow>
//                   );
//                 })}
//               </TableBody>
//             </Table>
//           </div>
//         )}
//       </section>

//       <SupplierTransactionDetailsModal
//         transactionId={selectedTxnId}
//         open={detailsOpen}
//         onOpenChange={setDetailsOpen}
//       />

//       <Dialog
//         open={pendingDelete !== null}
//         onOpenChange={(open) => !open && !isDeleting && setPendingDelete(null)}
//       >
//         <DialogContent className="sm:max-w-sm">
//           <DialogHeader className="text-left">
//             <DialogTitle>Delete transaction {pendingDelete?.ref}?</DialogTitle>
//             <DialogDescription>This can't be undone.</DialogDescription>
//           </DialogHeader>
//           <DialogFooter className="gap-2 sm:gap-0">
//             <Button variant="outline" disabled={isDeleting} onClick={() => setPendingDelete(null)}>
//               Cancel
//             </Button>
//             <Button
//               variant="destructive"
//               disabled={isDeleting}
//               onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
//             >
//               {isDeleting ? "Deleting…" : "Delete"}
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }
