"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Banknote,
  CheckCircle2,
  Package,
  Receipt,
  ShoppingCart,
  Undo2,
  UserRound,
  Users2,
  type LucideIcon,
} from "lucide-react";

import type { PeriodKpiMetrics } from "@/actions/employee-summary";
import { currencyFormatter } from "@/config/formatter";
import { cn } from "@/lib/utils";

interface EmployeeSummaryKpisProps {
  metrics: PeriodKpiMetrics;
  selectedEmployeeName?: string;
  isSingleEmployeeView: boolean;
  isLoading?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Helpers & layout (module scope so nothing is rebuilt on every render)     */
/* -------------------------------------------------------------------------- */

// Fixed locale avoids server/client hydration mismatches from toLocaleString().
const countFormat = new Intl.NumberFormat("en-GH");
const oneDecimalFormat = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percentFormat = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 1 });

const formatCount = (n: number) => countFormat.format(n);
const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${formatCount(n)} ${n === 1 ? singular : plural}`;

/**
 * Every row must fill 12 columns on lg (2 on sm): the grid gap shows the
 * container background, so an unfilled row would show as a dark block.
 */
const SPAN = {
  hero: "sm:col-span-2 lg:col-span-6",
  half: "lg:col-span-3",
  third: "lg:col-span-4",
  thirdWide: "sm:col-span-2 lg:col-span-4",
  wide: "lg:col-span-6",
} as const;

const SKELETON_LAYOUT = [
  SPAN.hero,
  SPAN.half,
  SPAN.half,
  SPAN.third,
  SPAN.third,
  SPAN.thirdWide,
  SPAN.wide,
  SPAN.wide,
];

const GRID = "grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-12";

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

function KpiCell({
  label,
  icon: Icon,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { label: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <div className={cn("relative flex flex-col bg-card p-5 sm:p-6", className)} {...props}>
      <dt className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
        {label}
        <Icon aria-hidden className="size-4" />
      </dt>
      {children}
    </div>
  );
}

function Figure({ size = "md", children }: { size?: "md" | "lg"; children: ReactNode }) {
  return (
    <dd
      className={cn(
        "mt-3 min-w-0 font-semibold tracking-tight text-foreground tabular-nums",
        size === "lg" ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"
      )}
    >
      {children}
    </dd>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <dd className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-5 text-sm text-muted-foreground">
      {children}
    </dd>
  );
}

function Delta({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return null;

  const rounded = Math.round(value * 10) / 10;
  const isUp = rounded > 0;
  const isDown = rounded < 0;
  const Icon = isDown ? ArrowDownRight : ArrowUpRight;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium tabular-nums",
          isUp && "text-emerald-600 dark:text-emerald-400",
          isDown && "text-rose-600 dark:text-rose-400"
        )}
      >
        {(isUp || isDown) && <Icon aria-hidden className="size-3.5" />}
        {isUp ? "+" : isDown ? "−" : ""}
        {Math.abs(rounded)}%
      </span>
      <span>vs previous period</span>
    </span>
  );
}

function StatusDot({ className }: { className: string }) {
  return <span aria-hidden className={cn("size-1.5 rounded-full", className)} />;
}

/** Same grid and spans as the real cards, so nothing shifts when data arrives. */
function KpiSkeleton() {
  return (
    <div role="status" aria-label="Loading sales summary" className={GRID}>
      {SKELETON_LAYOUT.map((span, i) => (
        <div key={i} className={cn("flex min-h-36 flex-col bg-card p-5 sm:p-6", span)}>
          <span className="h-4 w-28 rounded bg-muted motion-safe:animate-pulse" />
          <span
            className={cn(
              "mt-4 rounded bg-muted motion-safe:animate-pulse",
              i === 0 ? "h-11 w-52" : "h-8 w-32"
            )}
          />
          <span className="mt-auto h-4 w-40 rounded bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function EmployeeSummaryKpis({
  metrics,
  selectedEmployeeName,
  isSingleEmployeeView,
  isLoading = false,
}: EmployeeSummaryKpisProps) {
  if (isLoading) return <KpiSkeleton />;

  const notCompletedCount = metrics.cancelledTransactions + metrics.refundedTransactions;
  const notCompletedAmount = metrics.cancelledAmount + metrics.refundedAmount;
  const itemsPerSale =
    metrics.completedTransactions > 0 ? metrics.totalItemsSold / metrics.completedTransactions : 0;

  return (
    <section aria-label="Sales summary">
      <dl className={GRID}>
        {/* Net revenue — the primary figure */}
        <KpiCell label="Net revenue" icon={Banknote} className={SPAN.hero + " lg:p-8"}>
          <Figure size="lg">{currencyFormatter(metrics.totalRevenue)}</Figure>
          <Footer>
            <Delta value={metrics.revenueChangePct} />
            <span>Gross {currencyFormatter(metrics.grossSales)}</span>
          </Footer>
        </KpiCell>

        {/* Transactions */}
        <KpiCell label="Transactions" icon={ShoppingCart} className={SPAN.half}>
          <Figure>{formatCount(metrics.totalTransactions)}</Figure>
          <Footer>
            <Delta value={metrics.transactionsChangePct} />
          </Footer>
        </KpiCell>

        {/* Items sold */}
        <KpiCell label="Items sold" icon={Package} className={SPAN.half}>
          <Figure>{formatCount(metrics.totalItemsSold)}</Figure>
          <Footer>
            <Delta value={metrics.itemsSoldChangePct} />
          </Footer>
        </KpiCell>

        {/* Average transaction value */}
        <KpiCell label="Average transaction value" icon={Receipt} className={SPAN.third}>
          <Figure>{currencyFormatter(metrics.averageTransactionValue)}</Figure>
          <Footer>
            <Delta value={metrics.atvChangePct} />
          </Footer>
        </KpiCell>

        {/* Success rate */}
        <KpiCell label="Success rate" icon={CheckCircle2} className={SPAN.third}>
          <Figure>{percentFormat.format(metrics.successRate)}%</Figure>
          <Footer>
            <span>{formatCount(metrics.completedTransactions)} completed</span>
            {metrics.pendingTransactions > 0 ? (
              <span className="flex items-center gap-1.5">
                <StatusDot className="bg-amber-500" />
                {formatCount(metrics.pendingTransactions)} pending
              </span>
            ) : (
              <span>None pending</span>
            )}
          </Footer>
        </KpiCell>

        {/* Cancelled and refunded */}
        <KpiCell label="Cancelled and refunded" icon={Undo2} className={SPAN.thirdWide}>
          <Figure>
            {formatCount(notCompletedCount)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {currencyFormatter(notCompletedAmount)}
            </span>
          </Figure>
          <Footer>
            <span>{formatCount(metrics.cancelledTransactions)} voided</span>
            <span>{formatCount(metrics.refundedTransactions)} refunded</span>
          </Footer>
        </KpiCell>

        {/* Top performer, or the employee being viewed */}
        <KpiCell
          label={isSingleEmployeeView ? "Employee" : "Top performer"}
          icon={isSingleEmployeeView ? UserRound : Award}
          className={SPAN.wide}
        >
          {isSingleEmployeeView ? (
            <>
              <Figure>
                <span className="block truncate">{selectedEmployeeName || "Employee"}</span>
              </Figure>
              <Footer>
                <span>Showing this employee's sales only</span>
              </Footer>
            </>
          ) : metrics.topEmployee ? (
            <>
              <Figure>
                <span className="block truncate">{metrics.topEmployee.name}</span>
              </Figure>
              <Footer>
                <span>{currencyFormatter(metrics.topEmployee.revenue)}</span>
                <span>{pluralize(metrics.topEmployee.transactions, "sale")}</span>
              </Footer>
            </>
          ) : (
            <>
              <Figure>
                <span className="text-muted-foreground">None yet</span>
              </Figure>
              <Footer>
                <span>No sales recorded in this period</span>
              </Footer>
            </>
          )}
        </KpiCell>

        {/* Workload: items per sale for one employee, transactions per employee for all */}
        <KpiCell
          label={isSingleEmployeeView ? "Items per sale" : "Transactions per employee"}
          icon={Users2}
          className={SPAN.wide}
        >
          <Figure>
            {oneDecimalFormat.format(
              isSingleEmployeeView ? itemsPerSale : metrics.avgTransactionsPerEmployee
            )}
          </Figure>
          <Footer>
            {isSingleEmployeeView ? (
              <span>Discounts given {currencyFormatter(metrics.totalDiscounts)}</span>
            ) : (
              <span>{pluralize(metrics.activeEmployeesCount, "employee")} active in this period</span>
            )}
          </Footer>
        </KpiCell>
      </dl>
    </section>
  );
}

// "use client";

// import {
//   DollarSign,
//   ShoppingCart,
//   Package,
//   TrendingUp,
//   TrendingDown,
//   CheckCircle2,
//   AlertCircle,
//   Award,
//   Users2,
//   Percent,
// } from "lucide-react";
// import { Card, CardContent } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { PeriodKpiMetrics } from "@/actions/employee-summary";
// import { currencyFormatter } from "@/config/formatter";
// import { cn } from "@/lib/utils";

// interface EmployeeSummaryKpisProps {
//   metrics: PeriodKpiMetrics;
//   selectedEmployeeName?: string;
//   isSingleEmployeeView: boolean;
//   isLoading?: boolean;
// }

// export default function EmployeeSummaryKpis({
//   metrics,
//   selectedEmployeeName,
//   isSingleEmployeeView,
//   isLoading = false,
// }: EmployeeSummaryKpisProps) {
//   const renderDeltaBadge = (pct: number | null) => {
//     if (pct === null || pct === undefined) return null;
//     const isPositive = pct >= 0;
//     return (
//       <span
//         className={cn(
//           "inline-flex items-center gap-0.5 text-sm font-semibold px-1.5 py-0.5 rounded",
//           isPositive
//             ? "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/60"
//             : "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950/60"
//         )}
//       >
//         {isPositive ? (
//           <TrendingUp className="h-3 w-3 inline" />
//         ) : (
//           <TrendingDown className="h-3 w-3 inline" />
//         )}
//         {isPositive ? "+" : ""}
//         {pct}% vs prev
//       </span>
//     );
//   };

//   if (isLoading) {
//     return (
//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
//         {Array.from({ length: 8 }).map((_, i) => (
//           <Card key={i} className="animate-pulse h-28 bg-muted/40" />
//         ))}
//       </div>
//     );
//   }

//   return (
//     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
//       {/* 1. Total Net Revenue */}
//       <Card className="border-l-4 border-l-emerald-500 shadow-xs hover:shadow-md transition-shadow">
//         <CardContent className="p-4 space-y-2">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
//               Total Net Revenue
//             </span>
//             <div className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
//               <DollarSign className="h-4 w-4" />
//             </div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold tracking-tight text-foreground">
//               {currencyFormatter(metrics.totalRevenue)}
//             </div>
//             <div className="flex items-center justify-between mt-1 flex-wrap gap-1">
//               {renderDeltaBadge(metrics.revenueChangePct)}
//               <span className="text-[11px] text-muted-foreground">
//                 Gross: {currencyFormatter(metrics.grossSales)}
//               </span>
//             </div>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 2. Total Transactions */}
//       <Card className="border-l-4 border-l-blue-500 shadow-xs hover:shadow-md transition-shadow">
//         <CardContent className="p-4 space-y-2">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
//               Total Transactions
//             </span>
//             <div className="h-8 w-8 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center">
//               <ShoppingCart className="h-4 w-4" />
//             </div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold tracking-tight text-foreground">
//               {metrics.totalTransactions.toLocaleString()}
//             </div>
//             <div className="flex items-center justify-between mt-1 flex-wrap gap-1">
//               {renderDeltaBadge(metrics.transactionsChangePct)}
//               <span className="text-[11px] text-muted-foreground">
//                 {metrics.completedTransactions} completed
//               </span>
//             </div>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 3. Items Sold */}
//       <Card className="border-l-4 border-l-indigo-500 shadow-xs hover:shadow-md transition-shadow">
//         <CardContent className="p-4 space-y-2">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
//               Items Sold
//             </span>
//             <div className="h-8 w-8 rounded-full bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
//               <Package className="h-4 w-4" />
//             </div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold tracking-tight text-foreground">
//               {metrics.totalItemsSold.toLocaleString()}
//             </div>
//             <div className="flex items-center justify-between mt-1 flex-wrap gap-1">
//               {renderDeltaBadge(metrics.itemsSoldChangePct)}
//               <span className="text-[11px] text-muted-foreground">
//                 Units moved
//               </span>
//             </div>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 4. Average Transaction Value (ATV) */}
//       <Card className="border-l-4 border-l-purple-500 shadow-xs hover:shadow-md transition-shadow">
//         <CardContent className="p-4 space-y-2">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
//               Avg Transaction Value
//             </span>
//             <div className="h-8 w-8 rounded-full bg-purple-500/10 text-purple-600 flex items-center justify-center">
//               <TrendingUp className="h-4 w-4" />
//             </div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold tracking-tight text-foreground">
//               {currencyFormatter(metrics.averageTransactionValue)}
//             </div>
//             <div className="flex items-center justify-between mt-1 flex-wrap gap-1">
//               {renderDeltaBadge(metrics.atvChangePct)}
//               <span className="text-[11px] text-muted-foreground">
//                 Per checkout
//               </span>
//             </div>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 5. Successful Transactions */}
//       <Card className="border-l-4 border-l-teal-500 shadow-xs hover:shadow-md transition-shadow">
//         <CardContent className="p-4 space-y-2">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
//               Success Rate
//             </span>
//             <div className="h-8 w-8 rounded-full bg-teal-500/10 text-teal-600 flex items-center justify-center">
//               <CheckCircle2 className="h-4 w-4" />
//             </div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold tracking-tight text-foreground flex items-baseline gap-2">
//               <span>{metrics.successRate}%</span>
//               <span className="text-sm font-normal text-muted-foreground">
//                 ({metrics.completedTransactions} txs)
//               </span>
//             </div>
//             <p className="text-[11px] text-muted-foreground mt-1">
//               {metrics.pendingTransactions > 0
//                 ? `${metrics.pendingTransactions} pending verification`
//                 : "All checkouts verified"}
//             </p>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 6. Cancelled & Refunded */}
//       <Card className="border-l-4 border-l-amber-500 shadow-xs hover:shadow-md transition-shadow">
//         <CardContent className="p-4 space-y-2">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
//               Cancelled / Refunded
//             </span>
//             <div className="h-8 w-8 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
//               <AlertCircle className="h-4 w-4" />
//             </div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold tracking-tight text-foreground flex items-baseline gap-2">
//               <span>{metrics.cancelledTransactions + metrics.refundedTransactions}</span>
//               <span className="text-sm font-normal text-muted-foreground">
//                 ({currencyFormatter(metrics.cancelledAmount + metrics.refundedAmount)})
//               </span>
//             </div>
//             <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
//               <span>{metrics.cancelledTransactions} voided</span>
//               <span>•</span>
//               <span>{metrics.refundedTransactions} refunded</span>
//             </div>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 7. Highest Performing Employee / Employee Contribution */}
//       <Card className="border-l-4 border-l-amber-600 shadow-xs hover:shadow-md transition-shadow">
//         <CardContent className="p-4 space-y-2">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
//               {isSingleEmployeeView ? "Sales Share" : "Top Performer"}
//             </span>
//             <div className="h-8 w-8 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center">
//               {isSingleEmployeeView ? <Percent className="h-4 w-4" /> : <Award className="h-4 w-4" />}
//             </div>
//           </div>
//           <div>
//             {isSingleEmployeeView ? (
//               <>
//                 <div className="text-2xl font-bold tracking-tight text-foreground">
//                   {selectedEmployeeName || "Employee"}
//                 </div>
//                 <p className="text-[11px] text-muted-foreground mt-1">
//                   Individual drilldown view active
//                 </p>
//               </>
//             ) : metrics.topEmployee ? (
//               <>
//                 <div className="text-xl font-bold tracking-tight text-foreground truncate">
//                   {metrics.topEmployee.name}
//                 </div>
//                 <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
//                   <Badge variant="outline" className="text-[10px] py-0 px-1 font-semibold text-emerald-600">
//                     {currencyFormatter(metrics.topEmployee.revenue)}
//                   </Badge>
//                   <span>{metrics.topEmployee.transactions} sales</span>
//                 </div>
//               </>
//             ) : (
//               <>
//                 <div className="text-xl font-bold tracking-tight text-muted-foreground">
//                   None
//                 </div>
//                 <p className="text-[11px] text-muted-foreground mt-1">No sales recorded</p>
//               </>
//             )}
//           </div>
//         </CardContent>
//       </Card>

//       {/* 8. Avg Transactions per Employee / Items per Sale */}
//       <Card className="border-l-4 border-l-sky-500 shadow-xs hover:shadow-md transition-shadow">
//         <CardContent className="p-4 space-y-2">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
//               {isSingleEmployeeView ? "Items / Sale" : "Txs / Employee"}
//             </span>
//             <div className="h-8 w-8 rounded-full bg-sky-500/10 text-sky-600 flex items-center justify-center">
//               <Users2 className="h-4 w-4" />
//             </div>
//           </div>
//           <div>
//             <div className="text-2xl font-bold tracking-tight text-foreground">
//               {isSingleEmployeeView
//                 ? metrics.completedTransactions > 0
//                   ? (metrics.totalItemsSold / metrics.completedTransactions).toFixed(1)
//                   : "0"
//                 : metrics.avgTransactionsPerEmployee.toFixed(1)}
//             </div>
//             <p className="text-[11px] text-muted-foreground mt-1">
//               {isSingleEmployeeView
//                 ? `Discounts: ${currencyFormatter(metrics.totalDiscounts)}`
//                 : `${metrics.activeEmployeesCount} active staff in period`}
//             </p>
//           </div>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }
