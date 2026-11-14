"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { getSupplierTransactionDetails } from "@/actions/supplier-transactions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { currencyFormatter } from "@/config/formatter";
import { cn } from "@/lib/utils";
import type { SupplierTransactionDetailView } from "@/types/globals";
import { supplierTransactionKeys } from "./supplier-transaction-queries";

interface SupplierTransactionDetailsModalProps {
  transactionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* -------------------------------------------------------------------------- */
/*  Helpers (module scope)                                                    */
/* -------------------------------------------------------------------------- */

// Fixed locale keeps formatting consistent between server and browser.
const countFormat = new Intl.NumberFormat("en-GH");
const dateTimeFormat = new Intl.DateTimeFormat("en-GH", { dateStyle: "long", timeStyle: "short" });

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  cheque: "Cheque",
  credit: "Credit (payable)",
};

const toNumber = (value: unknown) => Number(value) || 0;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
const humanize = (value: string) => capitalize(value.replace(/_/g, " "));

function formatDateTime(value?: string | Date | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateTimeFormat.format(date);
}

/**
 * "Print" prints just this dialog: everything else on the page is hidden, and the
 * dialog is laid out as a normal page. (`:has` needs a current browser.)
 */
const PRINT_CSS = `
@media print {
  body:has([data-print-area]) > *:not(:has([data-print-area])) { display: none !important; }
  body { overflow: visible !important; height: auto !important; }
  [data-slot="dialog-overlay"] { display: none !important; }
}`;

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

function StatusText({ status, balance }: { status: string; balance: number }) {
  const dot =
    status === "completed" ? "bg-emerald-500" : balance > 0 ? "bg-rose-500" : "bg-muted-foreground/50";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {status ? capitalize(status) : "Unknown"}
    </span>
  );
}

function SummaryCell({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-xl font-semibold tracking-tight tabular-nums", valueClassName)}>{value}</dd>
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div role="status" aria-label="Loading transaction" className="space-y-6 px-6 py-5">
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SupplierTransactionDetailsModal({
  transactionId,
  open,
  onOpenChange,
}: SupplierTransactionDetailsModalProps) {
  // Cached per transaction: reopening one you've already seen is instant, and it refreshes quietly.
  const detailsQuery = useQuery({
    queryKey: supplierTransactionKeys.detail(transactionId ?? ""),
    queryFn: async () => {
      const res = await getSupplierTransactionDetails(transactionId as string);
      if (!res.success || !res.data) throw new Error(res.message || "Couldn't load this transaction.");
      return res.data as SupplierTransactionDetailView;
    },
    enabled: open && !!transactionId,
    staleTime: 60_000,
  });

  const details = detailsQuery.data;
  const items = details?.items ?? [];
  const balance = toNumber(details?.balance);

  const transactionDate = formatDateTime(details?.transaction_date);
  const recordedAt = formatDateTime(details?.created_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-print-area
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl",
          "print:absolute print:top-0 print:left-0 print:block print:max-h-none print:w-full print:max-w-none print:translate-x-0 print:translate-y-0 print:overflow-visible print:border-0 print:shadow-none print:[&>button]:hidden"
        )}
      >
        <style>{PRINT_CSS}</style>

        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle>
            {details ? `Transaction ${details.transaction_no || details.id}` : "Supplier transaction"}
          </DialogTitle>
          <DialogDescription>
            {details
              ? `${details.supplier_name}${transactionDate ? `, ${transactionDate}` : ""}`
              : "Products delivered by the supplier and how they were paid for."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
          {detailsQuery.isPending && open && !!transactionId ? (
            <DetailsSkeleton />
          ) : detailsQuery.isError || !details ? (
            <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <div className="space-y-1">
                <p className="text-sm font-medium">Couldn't load this transaction</p>
                {detailsQuery.error && (
                  <p className="text-sm text-muted-foreground">{detailsQuery.error.message}</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => void detailsQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="space-y-6 px-6 py-5">
              <dl className="divide-y border-y">
                <DetailRow label="Supplier">
                  {details.supplier_name}
                  {details.company_name && details.company_name !== details.supplier_name && (
                    <span className="block font-normal text-muted-foreground">{details.company_name}</span>
                  )}
                </DetailRow>
                <DetailRow label="Delivered by">
                  {details.delivered_by || <span className="font-normal text-muted-foreground">Not specified</span>}
                </DetailRow>
                <DetailRow label="Date">
                  {transactionDate ?? <span className="font-normal text-muted-foreground">N/A</span>}
                </DetailRow>
                <DetailRow label="Payment mode">
                  {PAYMENT_LABELS[details.payment_mode] ?? humanize(details.payment_mode || "unknown")}
                </DetailRow>
                <DetailRow label="Status">
                  <StatusText status={details.status} balance={balance} />
                </DetailRow>
              </dl>

              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
                <SummaryCell label="Total" value={currencyFormatter(toNumber(details.total_amount))} />
                <SummaryCell label="Paid" value={currencyFormatter(toNumber(details.amount_paid))} />
                <SummaryCell
                  label="Balance due"
                  value={currencyFormatter(balance)}
                  valueClassName={balance > 0 ? "text-destructive" : undefined}
                />
              </dl>

              <section aria-labelledby="supplied-heading" className="space-y-2">
                <h3 id="supplied-heading" className="text-sm font-medium">
                  Products supplied ({countFormat.format(items.length)})
                </h3>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[36rem] border-collapse text-sm">
                    <thead className="bg-muted text-left text-muted-foreground">
                      <tr className="border-b">
                        <th scope="col" className="w-10 px-3 py-2 text-center font-medium">#</th>
                        <th scope="col" className="px-2 py-2 font-medium">Product</th>
                        <th scope="col" className="px-2 py-2 font-medium">Category</th>
                        <th scope="col" className="px-2 py-2 font-medium">Packaging</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Qty</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Unit price</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length > 0 ? (
                        items.map((item, index) => (
                          <tr key={item.id} className="border-b last:border-b-0">
                            <td className="px-3 py-2.5 text-center text-muted-foreground tabular-nums">
                              {index + 1}
                            </td>
                            <td className="px-2 py-2.5 font-medium">{item.product_name}</td>
                            <td className="px-2 py-2.5 text-muted-foreground">{item.category_name || "General"}</td>
                            <td className="px-2 py-2.5 text-muted-foreground">
                              {humanize(item.product_type || "boxes")}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums">
                              {countFormat.format(toNumber(item.quantity))}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums">
                              {currencyFormatter(toNumber(item.unit_price))}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                              {currencyFormatter(toNumber(item.total_price))}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                            No products were recorded for this transaction.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {details.notes && (
                <section aria-labelledby="notes-heading" className="space-y-2">
                  <h3 id="notes-heading" className="text-sm font-medium">
                    Notes
                  </h3>
                  <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
                    {details.notes}
                  </p>
                </section>
              )}

              <p className="border-t pt-4 text-sm text-muted-foreground">
                Recorded by {details.user_name || "Admin"}
                {recordedAt && ` on ${recordedAt}`}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-0 print:hidden">
          <Button variant="outline" disabled={!details} onClick={() => window.print()}>
            Print
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// "use client";

// import React, { useEffect, useState } from "react";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import { Separator } from "@/components/ui/separator";
// import {
//   Truck,
//   Calendar,
//   User,
//   Package,
//   Printer,
//   CreditCard,
//   Building,
//   FileText,
//   UserCheck,
// } from "lucide-react";
// import { format } from "date-fns";
// import { getSupplierTransactionDetails } from "@/actions/supplier-transactions";
// import { SupplierTransactionDetailView } from "@/types/globals";
// import PageSkeleton from "@/components/custom/skeleton/PageSkeleton";

// interface SupplierTransactionDetailsModalProps {
//   transactionId: string | null;
//   open: boolean;
//   onOpenChange: (open: boolean) => void;
// }

// export default function SupplierTransactionDetailsModal({
//   transactionId,
//   open,
//   onOpenChange,
// }: SupplierTransactionDetailsModalProps) {
//   const [details, setDetails] = useState<SupplierTransactionDetailView | null>(null);
//   const [loading, setLoading] = useState(false);

//   useEffect(() => {
//     if (open && transactionId) {
//       setLoading(true);
//       getSupplierTransactionDetails(transactionId)
//         .then((res) => {
//           if (res.success && res.data) {
//             setDetails(res.data);
//           } else {
//             setDetails(null);
//           }
//         })
//         .finally(() => setLoading(false));
//     }
//   }, [open, transactionId]);

//   if (!open) return null;

//   const handlePrint = () => {
//     window.print();
//   };

//   return (
//     <Dialog open={open} onOpenChange={onOpenChange}>
//       <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-none print:m-0 print:p-6 print:shadow-none">
//         <DialogHeader className="print:hidden">
//           <DialogTitle className="flex items-center justify-between text-xl">
//             <span className="flex items-center gap-2">
//               <Truck className="h-5 w-5 text-primary" />
//               Supplier Transaction Details
//             </span>
//             <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
//               <Printer className="h-4 w-4" />
//               Print Receipt
//             </Button>
//           </DialogTitle>
//           <DialogDescription>
//             Complete record of products delivered by supplier and payment breakdown.
//           </DialogDescription>
//         </DialogHeader>

//         {loading ? (
//           <div className="py-12 text-center text-muted-foreground">
//             <PageSkeleton />
//           </div>
//         ) : !details ? (
//           <div className="py-12 text-center text-muted-foreground">
//             Transaction details could not be loaded.
//           </div>
//         ) : (
//           <div className="space-y-6 pt-2 print:space-y-4">
//             {/* Header info card */}
//             <div className="p-4 rounded-xl border bg-card/60 space-y-4">
//               <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-3">
//                 <div>
//                   <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
//                     Transaction Reference
//                   </span>
//                   <h3 className="text-lg font-bold text-primary">
//                     {details.transaction_no || details.id}
//                   </h3>
//                 </div>

//                 <div className="flex items-center gap-2">
//                   <Badge variant="outline" className="capitalize">
//                     {details.payment_mode.replace("_", " ")}
//                   </Badge>
//                   <Badge
//                     variant={
//                       details.status === "completed"
//                         ? "default"
//                         : details.balance > 0
//                         ? "destructive"
//                         : "secondary"
//                     }
//                     className="capitalize"
//                   >
//                     {details.status}
//                   </Badge>
//                 </div>
//               </div>

//               {/* Grid Metadata */}
//               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
//                 <div className="space-y-1">
//                   <span className="text-muted-foreground flex items-center gap-1 font-medium">
//                     <Truck className="h-3.5 w-3.5" /> Supplier Name
//                   </span>
//                   <p className="font-semibold text-sm">{details.supplier_name}</p>
//                   {details.company_name && details.company_name !== details.supplier_name && (
//                     <p className="text-muted-foreground">({details.company_name})</p>
//                   )}
//                 </div>

//                 <div className="space-y-1">
//                   <span className="text-muted-foreground flex items-center gap-1 font-medium">
//                     <UserCheck className="h-3.5 w-3.5" /> Delivered By
//                   </span>
//                   <p className="font-semibold text-sm">{details.delivered_by || "Not Specified"}</p>
//                 </div>

//                 <div className="space-y-1">
//                   <span className="text-muted-foreground flex items-center gap-1 font-medium">
//                     <Calendar className="h-3.5 w-3.5" /> Transaction Date
//                   </span>
//                   <p className="font-semibold text-sm">
//                     {details.transaction_date
//                       ? format(new Date(details.transaction_date), "PPP p")
//                       : "N/A"}
//                   </p>
//                 </div>
//               </div>
//             </div>

//             {/* Financial Summary Cards */}
//             <div className="grid grid-cols-3 gap-3">
//               <div className="p-3 rounded-lg border bg-muted/20">
//                 <span className="text-[11px] font-medium text-muted-foreground block">
//                   Total Amount
//                 </span>
//                 <span className="text-lg font-bold text-primary">
//                   GHS {Number(details.total_amount).toFixed(2)}
//                 </span>
//               </div>

//               <div className="p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
//                 <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 block">
//                   Amount Paid
//                 </span>
//                 <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
//                   GHS {Number(details.amount_paid).toFixed(2)}
//                 </span>
//               </div>

//               <div className="p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
//                 <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 block">
//                   Balance Due
//                 </span>
//                 <span className="text-lg font-bold text-amber-700 dark:text-amber-400">
//                   GHS {Number(details.balance).toFixed(2)}
//                 </span>
//               </div>
//             </div>

//             {/* Products Supplied Itemized Table */}
//             <div className="space-y-2">
//               <h4 className="text-sm font-semibold flex items-center gap-1.5">
//                 <Package className="h-4 w-4 text-primary" />
//                 Supplied Products ({details.items?.length || 0})
//               </h4>

//               <div className="border rounded-lg overflow-x-auto">
//                 <table className="w-full text-xs">
//                   <thead className="bg-muted/70 text-muted-foreground font-semibold border-b">
//                     <tr>
//                       <th className="p-2.5 text-center w-[40px]">#</th>
//                       <th className="p-2.5 text-left">Product Name</th>
//                       <th className="p-2.5 text-left">Category</th>
//                       <th className="p-2.5 text-center">Packaging / Unit Type</th>
//                       <th className="p-2.5 text-right">Quantity</th>
//                       <th className="p-2.5 text-right">Unit Price</th>
//                       <th className="p-2.5 text-right">Total Price</th>
//                     </tr>
//                   </thead>
//                   <tbody className="divide-y">
//                     {details.items && details.items.length > 0 ? (
//                       details.items.map((item, index) => (
//                         <tr key={item.id} className="hover:bg-muted/30">
//                           <td className="p-2.5 text-center text-muted-foreground">{index + 1}</td>
//                           <td className="p-2.5 font-medium">{item.product_name}</td>
//                           <td className="p-2.5 text-muted-foreground">
//                             {item.category_name || "General"}
//                           </td>
//                           <td className="p-2.5 text-center">
//                             <Badge variant="secondary" className="capitalize text-[10px] px-2 py-0.5">
//                               {item.product_type || "boxes"}
//                             </Badge>
//                           </td>
//                           <td className="p-2.5 text-right font-semibold">{item.quantity}</td>
//                           <td className="p-2.5 text-right">
//                             GHS {Number(item.unit_price).toFixed(2)}
//                           </td>
//                           <td className="p-2.5 text-right font-bold text-primary">
//                             GHS {Number(item.total_price).toFixed(2)}
//                           </td>
//                         </tr>
//                       ))
//                     ) : (
//                       <tr>
//                         <td colSpan={7} className="p-4 text-center text-muted-foreground">
//                           No product items recorded for this transaction.
//                         </td>
//                       </tr>
//                     )}
//                   </tbody>
//                 </table>
//               </div>
//             </div>

//             {/* Notes Section if available */}
//             {details.notes && (
//               <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
//                 <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
//                   <FileText className="h-3 w-3" /> Transaction Notes
//                 </span>
//                 <p className="text-xs">{details.notes}</p>
//               </div>
//             )}

//             {/* Footer info */}
//             <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-3 border-t">
//               <span>Recorded by: {details.user_name || "Admin"}</span>
//               <span>
//                 {details.created_at ? format(new Date(details.created_at), "PPP p") : ""}
//               </span>
//             </div>
//           </div>
//         )}
//       </DialogContent>
//     </Dialog>
//   );
// }
