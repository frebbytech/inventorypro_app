"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { sendDailySalesReport } from "@/actions/daily-reports";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { DailySalesReport } from "@/types/globals";
import PageContainer from "@/components/layout/page-container";

interface DailyReportsViewProps {
  initialReports: DailySalesReport[];
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface CashierRow {
  name: string;
  count: number;
  sales: number;
}

/* -------------------------------------------------------------------------- */
/*  Helpers (module scope)                                                    */
/* -------------------------------------------------------------------------- */

// Fixed locale avoids server/client hydration mismatches.
const countFormat = new Intl.NumberFormat("en-GH");
const percentFormat = new Intl.NumberFormat("en-GH", {
  maximumFractionDigits: 1,
});
const dateFormat = new Intl.DateTimeFormat("en-GH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC", // report dates are calendar days, so don't let a timezone shift them
});

/** "2025-01-20" -> "Mon, 20 Jan 2025". Falls back to the raw text. */
function formatReportDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  momo: "Mobile money",
  bank: "Bank",
  cheque: "Cheque",
};

function paymentLabel(mode: string) {
  if (PAYMENT_LABELS[mode]) return PAYMENT_LABELS[mode];
  const text = mode.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseJson<T>(value?: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

const asArray = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const toNumber = (value: unknown) => Number(value) || 0;

const isDispatched = (report: DailySalesReport) =>
  report.status === "dispatched";

function KpiCell({
  label,
  figure,
  caption,
}: {
  label: string;
  figure: ReactNode;
  caption?: string;
}) {
  return (
    <div className="flex flex-col bg-card p-5 sm:p-6">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">
        {figure}
      </dd>
      {caption && (
        <dd className="mt-auto pt-4 text-sm text-muted-foreground">
          {caption}
        </dd>
      )}
    </div>
  );
}

function StatusText({ dispatched }: { dispatched: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          dispatched ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      {dispatched ? "Dispatched" : "Generated"}
    </span>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function DailyReportsView({
  initialReports,
}: DailyReportsViewProps) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Sending emails and texts can't be undone, so it always asks first.
  const [pendingSend, setPendingSend] = useState<{ date?: string } | null>(
    null,
  );
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  // Read straight from props: router.refresh() re-runs the server page and hands us fresh reports.
  const reports = useMemo(
    () =>
      [...initialReports].sort((a, b) =>
        b.report_date.localeCompare(a.report_date),
      ),
    [initialReports],
  );
  const latest = reports[0];
  const selectedReport = reports.find((r) => String(r.id) === selectedId);

  const latestRevenue = toNumber(latest?.total_sales_amount);
  const latestProfit = toNumber(latest?.gross_profit);
  const latestMargin =
    latest && latestRevenue > 0 ? (latestProfit / latestRevenue) * 100 : null;

  // Parsed once per selected report, not on every render.
  const details = useMemo(() => {
    if (!selectedReport) return null;

    const payments = Object.entries(
      parseJson<Record<string, unknown>>(selectedReport.payment_breakdown) ??
        {},
    )
      .map(([mode, amount]) => ({ mode, amount: toNumber(amount) }))
      .sort((a, b) => b.amount - a.amount);

    return {
      payments,
      topProducts: asArray<TopProduct>(parseJson(selectedReport.top_products)),
      cashiers: asArray<CashierRow>(parseJson(selectedReport.cashier_summary)),
    };
  }, [selectedReport]);

  async function sendReport(target: { date?: string }) {
    setSendingKey(target.date ?? "today");
    try {
      const res = await sendDailySalesReport({
        ...(target.date ? { dateStr: target.date } : {}),
        force: true,
      });

      if (res.success && (target.date || res.data)) {
        toast.success(
          target.date ? "Report sent again" : "Today's report sent",
          {
            description: "Sent using your saved report settings.",
          },
        );
        router.refresh();
      } else {
        toast.error("Couldn't send the report", {
          description: res.message || "Try again in a moment.",
        });
      }
    } catch (err) {
      toast.error("Couldn't send the report", {
        description:
          err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setSendingKey(null);
    }
  }

  const isSending = sendingKey !== null;

  return (
    <PageContainer>
      <div className="mx-auto space-y-6 print:hidden">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Daily sales reports
            </h1>
            <p className="text-sm text-muted-foreground">
              End-of-day summaries of revenue, profit, top items and staff
              sales.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isRefreshing}
              onClick={() => startRefresh(() => router.refresh())}
            >
              <RefreshCw
                aria-hidden
                className={cn("size-4", isRefreshing && "animate-spin")}
              />
              Refresh
            </Button>
            <Button
              id="eod-send-report-now-btn"
              size="sm"
              disabled={isSending}
              onClick={() => setPendingSend({})}
            >
              {sendingKey === "today" ? "Sending…" : "Send today's report"}
            </Button>
          </div>
        </header>

        <section aria-label="Latest report">
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
            <KpiCell
              label="Latest sales"
              figure={
                latest ? currencyFormatter(latest.total_sales_amount) : "—"
              }
              caption={
                latest ? formatReportDate(latest.report_date) : "No reports yet"
              }
            />
            <KpiCell
              label="Completed transactions"
              figure={
                latest
                  ? countFormat.format(toNumber(latest.completed_transactions))
                  : "—"
              }
              caption={
                latest
                  ? `${countFormat.format(toNumber(latest.total_items_sold))} items sold`
                  : undefined
              }
            />
            <KpiCell
              label="Gross profit"
              figure={latest ? currencyFormatter(latest.gross_profit) : "—"}
              caption={
                latest
                  ? `Cost ${currencyFormatter(latest.total_cost)}`
                  : undefined
              }
            />
            <KpiCell
              label="Profit margin"
              figure={
                latestMargin === null
                  ? "—"
                  : `${percentFormat.format(latestMargin)}%`
              }
              caption={latest ? "Of revenue" : undefined}
            />
          </dl>
        </section>

        <section
          aria-label="All reports"
          className="overflow-hidden rounded-xl border bg-card"
        >
          <header className="border-b px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold tracking-tight">History</h2>
            <p className="text-sm text-muted-foreground">
              Past reports, newest first.
            </p>
          </header>

          {reports.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              No reports yet. Send today's report to create the first one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5 sm:pl-6">Date</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead className="text-right">Gross profit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-5 text-right sm:pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="pl-5 font-medium whitespace-nowrap sm:pl-6">
                      {formatReportDate(report.report_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currencyFormatter(report.total_sales_amount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {countFormat.format(
                        toNumber(report.completed_transactions),
                      )}{" "}
                      orders,{" "}
                      {countFormat.format(toNumber(report.total_items_sold))}{" "}
                      items
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currencyFormatter(report.gross_profit)}
                    </TableCell>
                    <TableCell>
                      <StatusText dispatched={isDispatched(report)} />
                    </TableCell>
                    <TableCell className="pr-5 text-right whitespace-nowrap sm:pr-6">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedId(String(report.id))}
                      >
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSending}
                        onClick={() =>
                          setPendingSend({ date: report.report_date })
                        }
                      >
                        {sendingKey === report.report_date
                          ? "Sending…"
                          : "Resend"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* Report details */}
        <Dialog
          open={Boolean(selectedReport)}
          onOpenChange={(open) => !open && setSelectedId(null)}
        >
          <DialogContent
            className={cn(
              // Changed: Removed overflow-y-auto, added flex flex-col
              "max-h-[90vh] gap-0 p-0 sm:max-w-2xl flex flex-col",
              // So "Print" prints this report, not the page behind it.
              "print:absolute print:top-0 print:left-0 print:max-h-none print:w-full print:max-w-none print:translate-x-0 print:translate-y-0 print:overflow-visible print:border-0 print:shadow-none print:[&>button]:hidden",
            )}
          >
            {selectedReport && details && (
              <>
                {/* Header stays static at the top */}
                <DialogHeader className="border-b px-6 py-4 text-left shrink-0">
                  <DialogTitle>
                    {formatReportDate(selectedReport.report_date)}
                  </DialogTitle>
                  <DialogDescription asChild>
                    <div className="flex items-center gap-2">
                      <span>Daily sales report</span>
                      <StatusText dispatched={isDispatched(selectedReport)} />
                    </div>
                  </DialogDescription>
                </DialogHeader>

                {/* Added: Scrollable wrapper around the main content body */}
                <div className="flex-1 overflow-y-auto print:overflow-visible">
                  <div className="space-y-6 px-6 py-5">
                    <dl className="divide-y border-y">
                      <DetailRow label="Revenue">
                        {currencyFormatter(selectedReport.total_sales_amount)}
                      </DetailRow>
                      <DetailRow label="Total cost">
                        {currencyFormatter(selectedReport.total_cost)}
                      </DetailRow>
                      <DetailRow label="Gross profit">
                        {currencyFormatter(selectedReport.gross_profit)}
                      </DetailRow>
                      <DetailRow label="Orders">
                        {countFormat.format(
                          toNumber(selectedReport.completed_transactions),
                        )}
                      </DetailRow>
                      <DetailRow label="Items sold">
                        {countFormat.format(
                          toNumber(selectedReport.total_items_sold),
                        )}
                      </DetailRow>
                    </dl>

                    {details.payments.length > 0 && (
                      <DetailSection title="Payment methods">
                        <dl className="divide-y rounded-lg border px-3">
                          {details.payments.map(({ mode, amount }) => (
                            <DetailRow key={mode} label={paymentLabel(mode)}>
                              {currencyFormatter(amount)}
                            </DetailRow>
                          ))}
                        </dl>
                      </DetailSection>
                    )}

                    {details.topProducts.length > 0 && (
                      <DetailSection title="Top selling items">
                        <ol className="divide-y rounded-lg border px-3">
                          {details.topProducts.map((item, index) => (
                            <li
                              key={index}
                              className="flex items-baseline justify-between gap-4 py-2.5 text-sm"
                            >
                              <span className="min-w-0 truncate">
                                <span className="mr-2 text-muted-foreground tabular-nums">
                                  {index + 1}
                                </span>
                                {item.name}
                              </span>
                              <span className="shrink-0 tabular-nums">
                                <span className="mr-4 text-muted-foreground">
                                  {countFormat.format(toNumber(item.quantity))}{" "}
                                  units
                                </span>
                                <span className="font-medium">
                                  {currencyFormatter(toNumber(item.revenue))}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ol>
                      </DetailSection>
                    )}

                    {details.cashiers.length > 0 && (
                      <DetailSection title="Staff sales">
                        <ul className="divide-y rounded-lg border px-3">
                          {details.cashiers.map((staff, index) => (
                            <li
                              key={index}
                              className="flex items-baseline justify-between gap-4 py-2.5 text-sm"
                            >
                              <span className="min-w-0 truncate">
                                {staff.name}
                              </span>
                              <span className="shrink-0 tabular-nums">
                                <span className="mr-4 text-muted-foreground">
                                  {countFormat.format(toNumber(staff.count))}{" "}
                                  transactions
                                </span>
                                <span className="font-medium">
                                  {currencyFormatter(toNumber(staff.sales))}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </DetailSection>
                    )}
                  </div>
                </div>

                {/* Footer stays static at the bottom */}
                <DialogFooter className="gap-2 border-t px-6 py-4 sm:justify-between shrink-0 print:hidden">
                  <Button variant="outline" onClick={() => window.print()}>
                    Print
                  </Button>
                  <Button
                    disabled={isSending}
                    onClick={() =>
                      setPendingSend({ date: selectedReport.report_date })
                    }
                  >
                    Resend by email and SMS
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Confirm before sending */}
        <Dialog
          open={pendingSend !== null}
          onOpenChange={(open) => !open && setPendingSend(null)}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader className="text-left">
              <DialogTitle>
                {pendingSend?.date
                  ? "Send this report again?"
                  : "Send today's report?"}
              </DialogTitle>
              <DialogDescription>
                {pendingSend?.date
                  ? `The report for ${formatReportDate(pendingSend.date)} will go out again, using your saved report settings.`
                  : "Today's report will be built and sent now, using your saved report settings."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setPendingSend(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const target = pendingSend ?? {};
                  setPendingSend(null);
                  void sendReport(target);
                }}
              >
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
}

// "use client";

// import { useState } from "react";
// import { DailySalesReport } from "@/types/globals";
// import {
//   sendDailySalesReport,
//   generateDailySalesReport,
// } from "@/actions/daily-reports";
// import { currencyFormatter } from "@/config/formatter";
// import { toast } from "sonner";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "@/components/ui/table";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import {
//   BarChart3,
//   Calendar,
//   CheckCircle2,
//   Clock,
//   DollarSign,
//   Download,
//   Eye,
//   FileText,
//   Mail,
//   Printer,
//   RefreshCw,
//   Send,
//   ShoppingBag,
//   Smartphone,
//   TrendingUp,
//   UserCheck,
//   Zap,
// } from "lucide-react";

// interface DailyReportsViewProps {
//   initialReports: DailySalesReport[];
// }

// export default function DailyReportsView({
//   initialReports,
// }: DailyReportsViewProps) {
//   const [reports, setReports] = useState<DailySalesReport[]>(initialReports);
//   const [selectedReport, setSelectedReport] = useState<DailySalesReport | null>(
//     null,
//   );
//   const [isRefreshing, setIsRefreshing] = useState(false);
//   const [isGenerating, setIsGenerating] = useState(false);
//   const [resendingId, setResendingId] = useState<string | null>(null);

//   const handleRefresh = async () => {
//     setIsRefreshing(true);
//     try {
//       const res = await fetch("/api/reports/daily/trigger");
//       const json = await res.json();
//       if (json.data && Array.isArray(json.data)) {
//         setReports(json.data);
//       } else {
//         // re-fetch via action
//         window.location.reload();
//       }
//       toast.success("Reports refreshed!");
//     } catch (e) {
//       toast.error("Failed to refresh reports");
//     } finally {
//       setIsRefreshing(false);
//     }
//   };

//   const handleGenerateAndSendNow = async () => {
//     setIsGenerating(true);
//     try {
//       const res = await sendDailySalesReport({ force: true });
//       if (res.success && res.data) {
//         toast.success("Daily Sales Report Dispatched!", {
//           description: `Dispatched for today's sales via In-App, Email, and SMS.`,
//         });
//         window.location.reload();
//       } else {
//         toast.error(res.message || "Failed to dispatch daily sales report");
//       }
//     } catch (err: any) {
//       toast.error(err?.message || "Failed to trigger report dispatch");
//     } finally {
//       setIsGenerating(false);
//     }
//   };

//   const handleResendReport = async (reportDate: string) => {
//     setResendingId(reportDate);
//     try {
//       const res = await sendDailySalesReport({
//         dateStr: reportDate,
//         force: true,
//       });
//       if (res.success) {
//         toast.success(`Report for ${reportDate} resent successfully!`);
//         window.location.reload();
//       } else {
//         toast.error(res.message || "Failed to resend report");
//       }
//     } catch (err: any) {
//       toast.error("Resend error");
//     } finally {
//       setResendingId(null);
//     }
//   };

//   const parseJson = (str?: string | null) => {
//     if (!str) return null;
//     try {
//       return JSON.parse(str);
//     } catch (e) {
//       return null;
//     }
//   };

//   const latestReport = reports[0];

//   return (
//     <div className="p-6 space-y-6 max-w-7xl mx-auto">
//       {/* Top Header */}
//       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
//         <div>
//           <div className="flex items-center gap-2">
//             <h1 className="text-2xl font-bold tracking-tight text-foreground">
//               Daily Sales Reports (EOD)
//             </h1>
//             <Badge
//               variant="outline"
//               className="bg-primary/10 text-primary border-primary/20 text-xs"
//             >
//               Automated Business Closing
//             </Badge>
//           </div>
//           <p className="text-sm text-muted-foreground mt-1">
//             View historical end-of-day sales summaries, revenue metrics, top
//             selling items, and notification delivery logs.
//           </p>
//         </div>

//         <div className="flex items-center gap-2">
//           <Button
//             variant="outline"
//             size="sm"
//             onClick={handleRefresh}
//             disabled={isRefreshing}
//             className="gap-2 text-xs"
//           >
//             <RefreshCw
//               className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
//             />
//             Refresh
//           </Button>

//           <Button
//             variant="default"
//             size="sm"
//             onClick={handleGenerateAndSendNow}
//             disabled={isGenerating}
//             className="gap-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
//             id="eod-send-report-now-btn"
//           >
//             <Send
//               className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`}
//             />
//             {isGenerating
//               ? "Generating & Sending..."
//               : "Send Daily Sales Report Now"}
//           </Button>
//         </div>
//       </div>

//       {/* Summary Stat Cards */}
//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
//         <Card className="bg-card shadow-sm border">
//           <CardContent className="p-4 flex items-center justify-between">
//             <div className="space-y-1">
//               <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Latest Day Sales
//               </p>
//               <p className="text-2xl font-bold text-foreground">
//                 {latestReport
//                   ? currencyFormatter(latestReport.total_sales_amount)
//                   : "GHS 0.00"}
//               </p>
//               <p className="text-[11px] text-muted-foreground">
//                 {latestReport
//                   ? `Date: ${latestReport.report_date}`
//                   : "No reports yet"}
//               </p>
//             </div>
//             <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
//               <DollarSign className="h-6 w-6" />
//             </div>
//           </CardContent>
//         </Card>

//         <Card className="bg-card shadow-sm border">
//           <CardContent className="p-4 flex items-center justify-between">
//             <div className="space-y-1">
//               <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Completed Transactions
//               </p>
//               <p className="text-2xl font-bold text-foreground">
//                 {latestReport ? latestReport.completed_transactions : 0}
//               </p>
//               <p className="text-[11px] text-muted-foreground">
//                 Items Sold: {latestReport ? latestReport.total_items_sold : 0}
//               </p>
//             </div>
//             <div className="p-3 bg-blue-500/10 text-blue-600 rounded-xl">
//               <ShoppingBag className="h-6 w-6" />
//             </div>
//           </CardContent>
//         </Card>

//         <Card className="bg-card shadow-sm border">
//           <CardContent className="p-4 flex items-center justify-between">
//             <div className="space-y-1">
//               <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Gross Profit
//               </p>
//               <p className="text-2xl font-bold text-emerald-600">
//                 {latestReport
//                   ? currencyFormatter(latestReport.gross_profit)
//                   : "GHS 0.00"}
//               </p>
//               <p className="text-[11px] text-muted-foreground">
//                 Total Cost:{" "}
//                 {latestReport
//                   ? currencyFormatter(latestReport.total_cost)
//                   : "GHS 0.00"}
//               </p>
//             </div>
//             <div className="p-3 bg-indigo-500/10 text-indigo-600 rounded-xl">
//               <TrendingUp className="h-6 w-6" />
//             </div>
//           </CardContent>
//         </Card>

//         <Card className="bg-card shadow-sm border">
//           <CardContent className="p-4 flex items-center justify-between">
//             <div className="space-y-1">
//               <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
//                 Dispatch Status
//               </p>
//               <div className="flex items-center gap-1.5 pt-0.5">
//                 <Badge
//                   variant="outline"
//                   className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs font-semibold"
//                 >
//                   In-App Active
//                 </Badge>
//                 <Badge
//                   variant="outline"
//                   className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs font-semibold"
//                 >
//                   SMS / Email
//                 </Badge>
//               </div>
//               <p className="text-[11px] text-muted-foreground mt-1">
//                 Triggered at business closing hour
//               </p>
//             </div>
//             <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl">
//               <Clock className="h-6 w-6" />
//             </div>
//           </CardContent>
//         </Card>
//       </div>

//       {/* Reports Table Card */}
//       <Card className="border shadow-sm">
//         <CardHeader className="p-4 sm:p-6 pb-2 border-b">
//           <div className="flex items-center justify-between">
//             <div>
//               <CardTitle className="text-base font-bold flex items-center gap-2">
//                 <FileText className="h-5 w-5 text-primary" />
//                 Historical EOD Daily Sales Reports
//               </CardTitle>
//               <CardDescription className="text-xs">
//                 Review past daily sales performance, payment channels, and audit
//                 logs.
//               </CardDescription>
//             </div>
//           </div>
//         </CardHeader>
//         <CardContent className="p-0">
//           <Table>
//             <TableHeader className="bg-muted/50">
//               <TableRow>
//                 <TableHead className="text-xs font-semibold">
//                   Report Date
//                 </TableHead>
//                 <TableHead className="text-xs font-semibold">
//                   Total Revenue
//                 </TableHead>
//                 <TableHead className="text-xs font-semibold">
//                   Orders / Items
//                 </TableHead>
//                 <TableHead className="text-xs font-semibold">
//                   Gross Profit
//                 </TableHead>
//                 <TableHead className="text-xs font-semibold">Status</TableHead>
//                 <TableHead className="text-xs font-semibold">
//                   Channels Sent
//                 </TableHead>
//                 <TableHead className="text-xs font-semibold text-right">
//                   Actions
//                 </TableHead>
//               </TableRow>
//             </TableHeader>
//             <TableBody>
//               {reports.length === 0 ? (
//                 <TableRow>
//                   <TableCell
//                     colSpan={7}
//                     className="h-32 text-center text-muted-foreground text-sm"
//                   >
//                     No daily sales reports found. Click{" "}
//                     <strong>"Send Daily Sales Report Now"</strong> to generate
//                     today's report instantly.
//                   </TableCell>
//                 </TableRow>
//               ) : (
//                 reports.map((report) => {
//                   const dispatchLogs = parseJson(report.dispatch_logs);
//                   return (
//                     <TableRow key={report.id} className="hover:bg-muted/30">
//                       <TableCell className="font-semibold text-xs py-3.5">
//                         <div className="flex items-center gap-2">
//                           <Calendar className="h-4 w-4 text-primary shrink-0" />
//                           <span>{report.report_date}</span>
//                         </div>
//                       </TableCell>
//                       <TableCell className="font-bold text-xs text-foreground">
//                         {currencyFormatter(report.total_sales_amount)}
//                       </TableCell>
//                       <TableCell className="text-xs text-muted-foreground">
//                         <span className="font-medium text-foreground">
//                           {report.completed_transactions}
//                         </span>{" "}
//                         orders ({report.total_items_sold} items)
//                       </TableCell>
//                       <TableCell className="text-xs font-semibold text-emerald-600">
//                         {currencyFormatter(report.gross_profit)}
//                       </TableCell>
//                       <TableCell>
//                         <Badge
//                           variant="outline"
//                           className={
//                             report.status === "dispatched"
//                               ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[11px]"
//                               : "bg-amber-500/10 text-amber-600 border-amber-500/20 text-[11px]"
//                           }
//                         >
//                           {report.status === "dispatched"
//                             ? "Dispatched"
//                             : "Generated"}
//                         </Badge>
//                       </TableCell>
//                       <TableCell className="text-xs">
//                         <div className="flex items-center gap-1.5">
//                           <Badge
//                             variant="secondary"
//                             className="text-[10px] gap-1 px-1.5"
//                           >
//                             <Zap className="h-3 w-3 text-amber-500" /> In-App
//                           </Badge>
//                           <Badge
//                             variant="secondary"
//                             className="text-[10px] gap-1 px-1.5"
//                           >
//                             <Mail className="h-3 w-3 text-blue-500" /> Email
//                           </Badge>
//                           <Badge
//                             variant="secondary"
//                             className="text-[10px] gap-1 px-1.5"
//                           >
//                             <Smartphone className="h-3 w-3 text-emerald-500" />{" "}
//                             SMS
//                           </Badge>
//                         </div>
//                       </TableCell>
//                       <TableCell className="text-right py-2">
//                         <div className="flex items-center justify-end gap-2">
//                           <Button
//                             variant="ghost"
//                             size="sm"
//                             onClick={() => setSelectedReport(report)}
//                             className="h-8 px-2 text-xs gap-1"
//                           >
//                             <Eye className="h-3.5 w-3.5 text-primary" />
//                             View
//                           </Button>

//                           <Button
//                             variant="outline"
//                             size="sm"
//                             disabled={resendingId === report.report_date}
//                             onClick={() =>
//                               handleResendReport(report.report_date)
//                             }
//                             className="h-8 px-2 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5"
//                           >
//                             <Send
//                               className={`h-3 w-3 ${resendingId === report.report_date ? "animate-spin" : ""}`}
//                             />
//                             Resend
//                           </Button>
//                         </div>
//                       </TableCell>
//                     </TableRow>
//                   );
//                 })
//               )}
//             </TableBody>
//           </Table>
//         </CardContent>
//       </Card>

//       {/* Report Detail Dialog */}
//       {selectedReport && (
//         <Dialog
//           open={!!selectedReport}
//           onOpenChange={(open) => !open && setSelectedReport(null)}
//         >
//           <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
//             <DialogHeader>
//               <DialogTitle className="text-lg font-bold flex items-center justify-between">
//                 <span className="flex items-center gap-2">
//                   <BarChart3 className="h-5 w-5 text-primary" />
//                   Daily Sales Report ({selectedReport.report_date})
//                 </span>
//                 <Badge
//                   variant="outline"
//                   className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
//                 >
//                   {selectedReport.status}
//                 </Badge>
//               </DialogTitle>
//               <DialogDescription className="text-xs">
//                 Detailed end-of-day revenue, cost, profit margins, payment mode
//                 breakdown, and staff sales.
//               </DialogDescription>
//             </DialogHeader>

//             <div className="space-y-6 pt-2">
//               {/* Stat Grid */}
//               <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
//                 <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
//                   <p className="text-[11px] text-muted-foreground uppercase font-semibold">
//                     Total Revenue
//                   </p>
//                   <p className="text-lg font-bold text-foreground">
//                     {currencyFormatter(selectedReport.total_sales_amount)}
//                   </p>
//                 </div>
//                 <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
//                   <p className="text-[11px] text-muted-foreground uppercase font-semibold">
//                     Gross Profit
//                   </p>
//                   <p className="text-lg font-bold text-emerald-600">
//                     {currencyFormatter(selectedReport.gross_profit)}
//                   </p>
//                 </div>
//                 <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
//                   <p className="text-[11px] text-muted-foreground uppercase font-semibold">
//                     Total Orders
//                   </p>
//                   <p className="text-lg font-bold text-foreground">
//                     {selectedReport.completed_transactions}
//                   </p>
//                 </div>
//                 <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
//                   <p className="text-[11px] text-muted-foreground uppercase font-semibold">
//                     Items Sold
//                   </p>
//                   <p className="text-lg font-bold text-foreground">
//                     {selectedReport.total_items_sold}
//                   </p>
//                 </div>
//               </div>

//               {/* Payment Methods Breakdown */}
//               {selectedReport.payment_breakdown && (
//                 <div className="space-y-2">
//                   <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
//                     <DollarSign className="h-4 w-4 text-primary" />
//                     Payment Modes Breakdown
//                   </h4>
//                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
//                     {Object.entries(
//                       parseJson(selectedReport.payment_breakdown) || {},
//                     ).map(([mode, amt]) => (
//                       <div
//                         key={mode}
//                         className="p-2.5 rounded-md border bg-card text-xs flex justify-between items-center"
//                       >
//                         <span className="capitalize text-muted-foreground font-medium">
//                           {mode.replace("_", " ")}
//                         </span>
//                         <span className="font-bold text-foreground">
//                           {currencyFormatter(Number(amt) || 0)}
//                         </span>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               )}

//               {/* Top Products Sold */}
//               {selectedReport.top_products && (
//                 <div className="space-y-2">
//                   <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
//                     <ShoppingBag className="h-4 w-4 text-primary" />
//                     Top Selling Items
//                   </h4>
//                   <div className="rounded-md border divide-y bg-card text-xs">
//                     {(parseJson(selectedReport.top_products) || []).map(
//                       (item: any, idx: number) => (
//                         <div
//                           key={idx}
//                           className="p-2.5 flex items-center justify-between"
//                         >
//                           <div className="flex items-center gap-2">
//                             <span className="font-bold text-muted-foreground w-4">
//                               #{idx + 1}
//                             </span>
//                             <span className="font-semibold text-foreground">
//                               {item.name}
//                             </span>
//                           </div>
//                           <div className="flex items-center gap-4">
//                             <span className="text-muted-foreground">
//                               {item.quantity} units
//                             </span>
//                             <span className="font-bold text-emerald-600">
//                               {currencyFormatter(item.revenue)}
//                             </span>
//                           </div>
//                         </div>
//                       ),
//                     )}
//                   </div>
//                 </div>
//               )}

//               {/* Staff / Cashier Summary */}
//               {selectedReport.cashier_summary && (
//                 <div className="space-y-2">
//                   <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
//                     <UserCheck className="h-4 w-4 text-primary" />
//                     Staff Performance Breakdown
//                   </h4>
//                   <div className="rounded-md border divide-y bg-card text-xs">
//                     {(parseJson(selectedReport.cashier_summary) || []).map(
//                       (staff: any, idx: number) => (
//                         <div
//                           key={idx}
//                           className="p-2.5 flex items-center justify-between"
//                         >
//                           <span className="font-semibold text-foreground">
//                             {staff.name}
//                           </span>
//                           <div className="flex items-center gap-4">
//                             <span className="text-muted-foreground">
//                               {staff.count} transactions
//                             </span>
//                             <span className="font-bold text-foreground">
//                               {currencyFormatter(staff.sales)}
//                             </span>
//                           </div>
//                         </div>
//                       ),
//                     )}
//                   </div>
//                 </div>
//               )}

//               {/* Print / Resend Controls */}
//               <div className="flex items-center justify-between pt-4 border-t">
//                 <Button
//                   variant="outline"
//                   size="sm"
//                   onClick={() => window.print()}
//                   className="gap-2 text-xs"
//                 >
//                   <Printer className="h-3.5 w-3.5" />
//                   Print Report
//                 </Button>

//                 <Button
//                   variant="default"
//                   size="sm"
//                   onClick={() => handleResendReport(selectedReport.report_date)}
//                   className="gap-2 text-xs bg-primary"
//                 >
//                   <Send className="h-3.5 w-3.5" />
//                   Resend via Email/SMS
//                 </Button>
//               </div>
//             </div>
//           </DialogContent>
//         </Dialog>
//       )}
//     </div>
//   );
// }
