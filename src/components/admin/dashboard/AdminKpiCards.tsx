"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  Building2,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { AdminKpiMetrics } from "@/actions/dashboard";
import CountUp from "@/components/count-up";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface AdminKpiCardsProps {
  metrics: AdminKpiMetrics;
  activeTimeframe?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers (module scope so they aren't re-created on every render)          */
/* -------------------------------------------------------------------------- */

// Fixed locale avoids server/client hydration mismatches from toLocaleString().
const numberFormat = new Intl.NumberFormat("en-GH");
const formatCount = (n: number) => numberFormat.format(n);
const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${formatCount(n)} ${n === 1 ? singular : plural}`;

interface RevenueFigures {
  label: string;
  value: number;
  orders: number;
  delta: number;
  deltaLabel: string;
}

/** Picks the revenue figures that match the selected timeframe. */
function getRevenueFigures(m: AdminKpiMetrics, timeframe: string): RevenueFigures {
  switch (timeframe) {
    case "today":
      return {
        label: "Revenue today",
        value: m.todayRevenue,
        orders: m.todayOrders,
        delta: m.todayVsYesterdayRevenueDelta,
        deltaLabel: "vs yesterday",
      };
    case "thisMonth":
      return {
        label: "Revenue this month",
        value: m.thisMonthRevenue,
        orders: m.thisMonthOrders,
        delta: m.thisMonthVsLastMonthRevenueDelta,
        deltaLabel: "vs last month",
      };
    default:
      return {
        label: "Total revenue",
        value: m.totalRevenueAllTime,
        orders: m.totalOrdersAllTime,
        delta: m.thisMonthVsLastMonthRevenueDelta,
        deltaLabel: "this month vs last month",
      };
  }
}

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
        "mt-3 font-semibold tracking-tight text-foreground tabular-nums",
        size === "lg" ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"
      )}
    >
      {children}
    </dd>
  );
}

function Footer({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <dd
      className={cn(
        "mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-5 text-sm text-muted-foreground",
        className
      )}
    >
      {children}
    </dd>
  );
}

function CellLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </Link>
  );
}

function Delta({ value, label }: { value: number; label: string }) {
  if (!Number.isFinite(value)) return null;

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
      <span>{label}</span>
    </span>
  );
}

function StatusDot({ className }: { className: string }) {
  return <span aria-hidden className={cn("size-1.5 rounded-full", className)} />;
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export function AdminKpiCards({ metrics, activeTimeframe = "7d" }: AdminKpiCardsProps) {
  const revenue = getRevenueFigures(metrics, activeTimeframe);
  const needsAttention = metrics.outOfStockCount + metrics.lowStockCount;
  const hasOutOfStock = metrics.outOfStockCount > 0;

  return (
    <section aria-label="Key business metrics">
      {/*
        One surface, hairline dividers: the grid gap shows the container's
        background, so every row must fill its 12 columns (or 2 on sm).
      */}
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-12">
        {/* Revenue — the primary figure, period-aware */}
        <KpiCell label={revenue.label} icon={Banknote} className="sm:col-span-2 lg:col-span-6 lg:p-8">
          <Figure size="lg">
            <CountUp value={revenue.value} />
          </Figure>
          <Footer>
            <Delta value={revenue.delta} label={revenue.deltaLabel} />
            <span>{pluralize(revenue.orders, "order")}</span>
          </Footer>
        </KpiCell>

        {/* Today's revenue */}
        <KpiCell label="Today's revenue" icon={TrendingUp} className="lg:col-span-3">
          <Figure>
            <CountUp value={metrics.todayRevenue} />
          </Figure>
          <Footer>
            <Delta value={metrics.todayVsYesterdayRevenueDelta} label="vs yesterday" />
            <span>{pluralize(metrics.todayOrders, "order")}</span>
          </Footer>
        </KpiCell>

        {/* Orders */}
        <KpiCell label="Orders" icon={ShoppingCart} className="lg:col-span-3">
          <Figure>
            <CountUp value={metrics.totalOrdersAllTime} format={{ notation: "standard" }} />
          </Figure>
          <Footer>
            <span>{pluralize(metrics.totalUnitsSoldAllTime, "unit")} sold</span>
          </Footer>
        </KpiCell>

        {/* Average order value */}
        <KpiCell label="Average order value" icon={Receipt} className="lg:col-span-4">
          <Figure>{formatCurrency(metrics.allTimeAov || metrics.todayAov)}</Figure>
          <Footer>
            <span>Today {formatCurrency(metrics.todayAov)}</span>
          </Footer>
        </KpiCell>

        {/* Inventory value */}
        <KpiCell label="Inventory value" icon={Boxes} className="lg:col-span-4">
          <Figure>
            <CountUp value={metrics.totalInventoryValuation} />
          </Figure>
          <Footer>
            <span>{pluralize(metrics.totalProductsCount, "product")}</span>
            <span>{pluralize(metrics.totalStockUnits, "unit")} on hand</span>
          </Footer>
        </KpiCell>

        {/* Stock alerts — the only cell that changes appearance with state */}
        <KpiCell label="Stock alerts" icon={AlertTriangle} className="sm:col-span-2 lg:col-span-4">
          {needsAttention > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-0 left-0 w-0.5",
                hasOutOfStock ? "bg-rose-500" : "bg-amber-500"
              )}
            />
          )}
          <Figure>
            {formatCount(needsAttention)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {needsAttention === 1 ? "product needs" : "products need"} restocking
            </span>
          </Figure>
          <Footer>
            {needsAttention === 0 ? (
              <span className="flex items-center gap-1.5">
                <StatusDot className="bg-emerald-500" />
                Nothing is low or out of stock
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {hasOutOfStock && (
                  <span className="flex items-center gap-1.5">
                    <StatusDot className="bg-rose-500" />
                    {formatCount(metrics.outOfStockCount)} out of stock
                  </span>
                )}
                {metrics.lowStockCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <StatusDot className="bg-amber-500" />
                    {formatCount(metrics.lowStockCount)} running low
                  </span>
                )}
              </span>
            )}
            <CellLink href="/admin/product">View products</CellLink>
          </Footer>
        </KpiCell>

        {/* Team */}
        <KpiCell label="Team" icon={Users} className="lg:col-span-6">
          <Figure>
            <CountUp value={metrics.totalUsersCount} format={{ notation: "standard" }} />
          </Figure>
          <Footer>
            <span className="flex flex-wrap gap-x-4">
              <span>{pluralize(metrics.adminUsersCount, "admin")}</span>
              <span>{pluralize(metrics.cashierUsersCount, "cashier")}</span>
            </span>
            <CellLink href="/admin/employee">Manage staff</CellLink>
          </Footer>
        </KpiCell>

        {/* Customers */}
        <KpiCell label="Customers" icon={Building2} className="lg:col-span-6">
          <Figure>
            <CountUp value={metrics.totalCustomersCount} format={{ notation: "standard" }} />
          </Figure>
          <Footer>
            <span>{pluralize(metrics.totalSuppliersCount, "supplier")}</span>
            <CellLink href="/admin/customer">View customers</CellLink>
          </Footer>
        </KpiCell>
      </dl>
    </section>
  );
}

// "use client";

// import React from "react";
// import {
//   TrendingUp,
//   DollarSign,
//   ShoppingCart,
//   Receipt,
//   AlertTriangle,
//   Users,
//   Building2,
//   ArrowUpRight,
//   ArrowDownRight,
//   Boxes,
//   Percent,
// } from "lucide-react";
// import { Card, CardContent } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { formatCurrency } from "@/lib/currency";
// import { AdminKpiMetrics } from "@/actions/dashboard";
// import CountUp from "@/components/count-up";
// import Link from "next/link";

// interface AdminKpiCardsProps {
//   metrics: AdminKpiMetrics;
//   activeTimeframe?: string;
// }

// export function AdminKpiCards({ metrics, activeTimeframe = "7d" }: AdminKpiCardsProps) {
//   // Compute display revenue and order numbers based on timeframe selection if needed
//   const displayRevenue =
//     activeTimeframe === "thisMonth"
//       ? metrics.thisMonthRevenue
//       : activeTimeframe === "today"
//       ? metrics.todayRevenue
//       : metrics.totalRevenueAllTime;

//   const displayOrders =
//     activeTimeframe === "thisMonth"
//       ? metrics.thisMonthOrders
//       : activeTimeframe === "today"
//       ? metrics.todayOrders
//       : metrics.totalOrdersAllTime;

//   // Mini sparkline paths for visual flair
//   const positiveSparkline = (
//     <svg className="h-6 w-16 text-emerald-500" viewBox="0 0 64 24" fill="none">
//       <path
//         d="M2 18 C 10 14, 18 20, 26 12 C 34 6, 44 14, 52 8 C 56 6, 60 4, 62 2"
//         stroke="currentColor"
//         strokeWidth="2.5"
//         strokeLinecap="round"
//       />
//     </svg>
//   );

//   const neutralSparkline = (
//     <svg className="h-6 w-16 text-primary" viewBox="0 0 64 24" fill="none">
//       <path
//         d="M2 14 C 12 16, 20 8, 30 12 C 40 16, 48 6, 56 8 C 58 8, 60 7, 62 6"
//         stroke="currentColor"
//         strokeWidth="2.5"
//         strokeLinecap="round"
//       />
//     </svg>
//   );

//   return (
//     <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
//       {/* 1. Total / Period Revenue Card */}
//       <Card className="group relative overflow-hidden rounded-xl border bg-card/70 p-0 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
//         <div className="absolute top-0 right-0 h-24 w-24 translate-x-6 -translate-y-6 rounded-full bg-primary/5 transition-transform group-hover:scale-110" />
//         <CardContent className="p-5">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
//               Total Revenue
//             </span>
//             <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-primary/10 text-primary">
//               <DollarSign className="h-4.5 w-4.5" />
//             </div>
//           </div>

//           <div className="mt-3">
//             <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
//               <CountUp value={metrics.totalRevenueAllTime} />
//             </div>
//           </div>

//           <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
//             <div className="flex items-center gap-1.5 font-medium">
//               {metrics.thisMonthVsLastMonthRevenueDelta >= 0 ? (
//                 <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
//                   <ArrowUpRight className="h-3 w-3" />
//                   +{metrics.thisMonthVsLastMonthRevenueDelta}%
//                 </span>
//               ) : (
//                 <span className="inline-flex items-center gap-0.5 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
//                   <ArrowDownRight className="h-3 w-3" />
//                   {metrics.thisMonthVsLastMonthRevenueDelta}%
//                 </span>
//               )}
//               <span className="text-muted-foreground">vs last month</span>
//             </div>
//             {positiveSparkline}
//           </div>
//         </CardContent>
//       </Card>

//       {/* 2. Today's Revenue */}
//       <Card className="group relative overflow-hidden rounded-xl border bg-card/70 p-0 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
//         <div className="absolute top-0 right-0 h-24 w-24 translate-x-6 -translate-y-6 rounded-full bg-emerald-500/5 transition-transform group-hover:scale-110" />
//         <CardContent className="p-5">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
//               Today&apos;s Revenue
//             </span>
//             <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
//               <TrendingUp className="h-4.5 w-4.5" />
//             </div>
//           </div>

//           <div className="mt-3">
//             <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
//               <CountUp value={metrics.todayRevenue} />
//             </div>
//           </div>

//           <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
//             <div className="flex items-center gap-1.5 font-medium">
//               {metrics.todayVsYesterdayRevenueDelta >= 0 ? (
//                 <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
//                   <ArrowUpRight className="h-3 w-3" />
//                   +{metrics.todayVsYesterdayRevenueDelta}%
//                 </span>
//               ) : (
//                 <span className="inline-flex items-center gap-0.5 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
//                   <ArrowDownRight className="h-3 w-3" />
//                   {metrics.todayVsYesterdayRevenueDelta}%
//                 </span>
//               )}
//               <span className="text-muted-foreground">vs yesterday</span>
//             </div>
//             <span className="text-sm font-medium text-muted-foreground">
//               {metrics.todayOrders} order(s) today
//             </span>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 3. Completed Orders & Volume */}
//       <Card className="group relative overflow-hidden rounded-xl border bg-card/70 p-0 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
//         <div className="absolute top-0 right-0 h-24 w-24 translate-x-6 -translate-y-6 rounded-full bg-blue-500/5 transition-transform group-hover:scale-110" />
//         <CardContent className="p-5">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
//               Total Transactions
//             </span>
//             <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-blue-500/10 text-blue-600 dark:text-blue-400">
//               <ShoppingCart className="h-4.5 w-4.5" />
//             </div>
//           </div>

//           <div className="mt-3">
//             <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
//               <CountUp value={metrics.totalOrdersAllTime} format={{ notation: "standard" }} />
//             </div>
//           </div>

//           <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
//             <div className="flex items-center gap-1.5 text-muted-foreground">
//               <Receipt className="h-3.5 w-3.5 text-primary" />
//               <span>{metrics.totalUnitsSoldAllTime.toLocaleString()} units sold</span>
//             </div>
//             {neutralSparkline}
//           </div>
//         </CardContent>
//       </Card>

//       {/* 4. Average Order Value (AOV) */}
//       <Card className="group relative overflow-hidden rounded-xl border bg-card/70 p-0 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
//         <div className="absolute top-0 right-0 h-24 w-24 translate-x-6 -translate-y-6 rounded-full bg-purple-500/5 transition-transform group-hover:scale-110" />
//         <CardContent className="p-5">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
//               Average Order Value
//             </span>
//             <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-purple-500/10 text-purple-600 dark:text-purple-400">
//               <Percent className="h-4.5 w-4.5" />
//             </div>
//           </div>

//           <div className="mt-3">
//             <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
//               {formatCurrency(metrics.allTimeAov || metrics.todayAov)}
//             </div>
//           </div>

//           <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
//             <span>Today&apos;s AOV: {formatCurrency(metrics.todayAov)}</span>
//             <Badge variant="outline" className="text-[10px] font-medium">
//               Average ticket
//             </Badge>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 5. Inventory Asset Valuation */}
//       <Card className="group relative overflow-hidden rounded-xl border bg-card/70 p-0 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
//         <CardContent className="p-5">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
//               Inventory Valuation
//             </span>
//             <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-amber-500/10 text-amber-600 dark:text-amber-400">
//               <Boxes className="h-4.5 w-4.5" />
//             </div>
//           </div>

//           <div className="mt-3">
//             <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
//               <CountUp value={metrics.totalInventoryValuation} />
//             </div>
//           </div>

//           <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
//             <span>{metrics.totalProductsCount} Catalog Items</span>
//             <span className="font-medium text-foreground">
//               {metrics.totalStockUnits.toLocaleString()} total units
//             </span>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 6. Stock & Reorder Alerts */}
//       <Card
//         className={`group relative overflow-hidden rounded-xl border p-0 shadow-xs transition-all hover:shadow-md ${
//           metrics.outOfStockCount > 0 || metrics.lowStockCount > 0
//             ? "border-amber-500/30 bg-amber-500/[0.03] hover:border-amber-500/50"
//             : "bg-card/70 hover:border-primary/40"
//         }`}
//       >
//         <CardContent className="p-5">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
//               Stock Health
//             </span>
//             <div
//               className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
//                 metrics.outOfStockCount > 0
//                   ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
//                   : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
//               }`}
//             >
//               <AlertTriangle className="h-4.5 w-4.5" />
//             </div>
//           </div>

//           <div className="mt-3 flex items-baseline gap-2">
//             <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
//               {metrics.outOfStockCount + metrics.lowStockCount}
//             </div>
//             <span className="text-sm font-medium text-muted-foreground">items need attention</span>
//           </div>

//           <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
//             <div className="flex items-center gap-2">
//               {metrics.outOfStockCount > 0 && (
//                 <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
//                   {metrics.outOfStockCount} Out of Stock
//                 </Badge>
//               )}
//               {metrics.lowStockCount > 0 && (
//                 <Badge
//                   variant="outline"
//                   className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
//                 >
//                   {metrics.lowStockCount} Low
//                 </Badge>
//               )}
//               {metrics.outOfStockCount === 0 && metrics.lowStockCount === 0 && (
//                 <span className="text-emerald-600 font-medium dark:text-emerald-400">
//                   All items healthy
//                 </span>
//               )}
//             </div>
//             <Link
//               href="/admin/product"
//               className="text-sm font-medium text-primary hover:underline"
//             >
//               View →
//             </Link>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 7. Active Team & Users */}
//       <Card className="group relative overflow-hidden rounded-xl border bg-card/70 p-0 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
//         <CardContent className="p-5">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
//               Team & Staff
//             </span>
//             <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
//               <Users className="h-4.5 w-4.5" />
//             </div>
//           </div>

//           <div className="mt-3">
//             <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
//               <CountUp value={metrics.totalUsersCount} format={{ notation: "standard" }} />
//             </div>
//           </div>

//           <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
//             <span>{metrics.adminUsersCount} Admins</span>
//             <span>{metrics.cashierUsersCount} Cashiers</span>
//             <Link href="/admin/employee" className="font-medium text-primary hover:underline">
//               Staff →
//             </Link>
//           </div>
//         </CardContent>
//       </Card>

//       {/* 8. Customers & Suppliers Network */}
//       <Card className="group relative overflow-hidden rounded-xl border bg-card/70 p-0 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
//         <CardContent className="p-5">
//           <div className="flex items-center justify-between">
//             <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
//               Customer & Vendor Base
//             </span>
//             <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-teal-500/10 text-teal-600 dark:text-teal-400">
//               <Building2 className="h-4.5 w-4.5" />
//             </div>
//           </div>

//           <div className="mt-3">
//             <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
//               <CountUp value={metrics.totalCustomersCount} format={{ notation: "standard" }} />
//             </div>
//           </div>

//           <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
//             <span>{metrics.totalSuppliersCount} Suppliers</span>
//             <Link href="/admin/customer" className="font-medium text-primary hover:underline">
//               Directory →
//             </Link>
//           </div>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }
