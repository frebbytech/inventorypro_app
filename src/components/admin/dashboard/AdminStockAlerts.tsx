"use client";

import Link from "next/link";
import { useId, useMemo } from "react";

import type { AdminDetailedStockAlert } from "@/actions/dashboard";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface AdminStockAlertsProps {
  alerts?: AdminDetailedStockAlert[];
}

/** Products below this many units are flagged. Keep in sync with the server-side low stock count. */
const LOW_STOCK_THRESHOLD = 5;

// Stable reference so the default doesn't defeat useMemo on every render.
const NO_ALERTS: AdminDetailedStockAlert[] = [];

const TONES = {
  out: { text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
  low: { text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
} as const;

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

function StatusDot({ className }: { className: string }) {
  return <span aria-hidden className={cn("size-1.5 rounded-full", className)} />;
}

/** One pip per unit up to the threshold, so "2 left" reads at a glance. */
function StockMeter({ stock, className }: { stock: number; className: string }) {
  return (
    <span aria-hidden className="hidden items-end gap-0.5 sm:flex">
      {Array.from({ length: LOW_STOCK_THRESHOLD }, (_, i) => (
        <span
          key={i}
          className={cn("h-3.5 w-1.5 rounded-[1px]", i < stock ? className : "bg-muted")}
        />
      ))}
    </span>
  );
}

function AlertRow({ item }: { item: AdminDetailedStockAlert }) {
  const isOut = item.stock <= 0;
  const tone = isOut ? TONES.out : TONES.low;

  return (
    <li className="flex items-center gap-4 px-5 py-3 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
        <p className="truncate text-sm text-muted-foreground">{item.categoryName}</p>
      </div>

      <StockMeter stock={item.stock} className={tone.dot} />

      <div className="w-24 shrink-0 text-right">
        <p className={cn("text-sm font-medium tabular-nums", tone.text)}>
          {isOut ? "Out of stock" : `${item.stock} left`}
        </p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {formatCurrency(item.sellingPrice)}
        </p>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export function AdminStockAlerts({ alerts = NO_ALERTS }: AdminStockAlertsProps) {
  const headingId = useId();

  // Most urgent first: out of stock, then lowest stock, then by name.
  const { sorted, outCount, lowCount } = useMemo(() => {
    const sorted = [...alerts].sort(
      (a, b) => a.stock - b.stock || a.name.localeCompare(b.name)
    );
    const outCount = sorted.filter((a) => a.stock <= 0).length;
    return { sorted, outCount, lowCount: sorted.length - outCount };
  }, [alerts]);

  return (
    <section aria-labelledby={headingId} className="rounded-xl border bg-card">
      <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-1">
          <h2 id={headingId} className="text-base font-semibold tracking-tight">
            Stock alerts
          </h2>

          {sorted.length === 0 ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <StatusDot className="bg-emerald-500" />
              Nothing needs restocking
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {outCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <StatusDot className={TONES.out.dot} />
                  {outCount} out of stock
                </span>
              )}
              {lowCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <StatusDot className={TONES.low.dot} />
                  {lowCount} running low
                </span>
              )}
            </p>
          )}
        </div>

        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
          <Link href="/admin/product">Manage stock</Link>
        </Button>
      </header>

      {sorted.length > 0 ? (
        // Focusable so keyboard users can scroll a long list.
        <div
          role="region"
          aria-label="Products that need restocking"
          tabIndex={0}
          className="max-h-[26rem] overflow-y-auto rounded-b-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ul className="divide-y">
            {sorted.map((item) => (
              <AlertRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="px-5 py-10 text-sm text-muted-foreground sm:px-6">
          Every product has at least {LOW_STOCK_THRESHOLD} units in stock.
        </p>
      )}
    </section>
  );
}

// "use client";

// import React from "react";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import { Progress } from "@/components/ui/progress";
// import { formatCurrency } from "@/lib/currency";
// import { AlertTriangle, PackageX, PackagePlus, ExternalLink, ShieldCheck } from "lucide-react";
// import { AdminDetailedStockAlert } from "@/actions/dashboard";
// import Link from "next/link";

// interface AdminStockAlertsProps {
//   alerts: AdminDetailedStockAlert[];
// }

// export function AdminStockAlerts({ alerts = [] }: AdminStockAlertsProps) {
//   const criticalCount = alerts.filter((a) => a.stock <= 0).length;
//   const lowCount = alerts.filter((a) => a.stock > 0 && a.stock < 5).length;

//   return (
//     <Card className="rounded-xl border bg-card/70 shadow-xs">
//       <CardHeader className="border-b pb-4">
//         <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
//           <div className="space-y-1">
//             <div className="flex items-center gap-2">
//               <CardTitle className="text-base font-bold tracking-tight sm:text-lg">
//                 Inventory & Stock Health
//               </CardTitle>
//               {alerts.length > 0 ? (
//                 <Badge
//                   variant="destructive"
//                   className="px-2 py-0.5 text-sm font-semibold"
//                 >
//                   {alerts.length} Action Needed
//                 </Badge>
//               ) : (
//                 <Badge
//                   variant="outline"
//                   className="border-emerald-500/30 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
//                 >
//                   <ShieldCheck className="mr-1 h-3 w-3" />
//                   All Healthy
//                 </Badge>
//               )}
//             </div>
//             <CardDescription className="text-sm">
//               Real-time monitoring of depletion thresholds and replenishment alerts.
//             </CardDescription>
//           </div>

//           <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-sm font-semibold">
//             <Link href="/admin/product">
//               <span>Manage Stocks</span>
//               <ExternalLink className="h-3.5 w-3.5" />
//             </Link>
//           </Button>
//         </div>

//         {/* Quick summary badges */}
//         {alerts.length > 0 && (
//           <div className="mt-2 flex items-center gap-3 text-sm">
//             {criticalCount > 0 && (
//               <span className="flex items-center gap-1.5 font-medium text-rose-600 dark:text-rose-400">
//                 <PackageX className="h-3.5 w-3.5" />
//                 {criticalCount} Out of Stock
//               </span>
//             )}
//             {lowCount > 0 && (
//               <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
//                 <AlertTriangle className="h-3.5 w-3.5" />
//                 {lowCount} Low Stock (&lt;5 units)
//               </span>
//             )}
//           </div>
//         )}
//       </CardHeader>

//       <CardContent className="p-4 sm:p-6">
//         {alerts.length > 0 ? (
//           <div className="flex flex-wrap gap-3 w-full">
//             {alerts.map((item) => {
//               const isOut = item.stock <= 0;
//               const percent = Math.min(100, Math.max(0, (item.stock / 5) * 100));

//               return (
//                 <div
//                   key={item.id}
//                   className={`w-full flex flex-col justify-between rounded-xl border p-3.5 transition-all hover:shadow-xs ${
//                     isOut
//                       ? "border-rose-500/30 bg-rose-500/[0.03] hover:border-rose-500/50"
//                       : "border-amber-500/30 bg-amber-500/[0.03] hover:border-amber-500/50"
//                   }`}
//                 >
//                   <div className="flex items-start justify-between gap-2">
//                     <div className="space-y-0.5">
//                       <p className="text-sm font-bold text-foreground truncate max-w-[180px]">
//                         {item.name}
//                       </p>
//                       <p className="text-[11px] text-muted-foreground">
//                         {item.categoryName}
//                       </p>
//                     </div>

//                     <Badge
//                       variant={isOut ? "destructive" : "outline"}
//                       className={`text-[10px] font-semibold shrink-0 ${
//                         !isOut
//                           ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
//                           : ""
//                       }`}
//                     >
//                       {isOut ? "Out of Stock" : `${item.stock} left`}
//                     </Badge>
//                   </div>

//                   <div className="mt-3 space-y-1.5">
//                     <div className="flex items-center justify-between text-[11px] text-muted-foreground">
//                       <span>Threshold: 5 units</span>
//                       <span className="font-semibold text-foreground">
//                         {formatCurrency(item.sellingPrice)}
//                       </span>
//                     </div>
//                     <Progress
//                       value={percent}
//                       className={`h-1.5 ${
//                         isOut ? "bg-rose-500/20" : "bg-amber-500/20"
//                       }`}
//                     />
//                   </div>
//                 </div>
//               );
//             })}
//           </div>
//         ) : (
//           <div className="flex flex-col items-center justify-center py-8 text-center">
//             <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
//               <ShieldCheck className="h-6 w-6" />
//             </div>
//             <p className="mt-3 text-sm font-semibold text-foreground">
//               Inventory Levels Are Optimal
//             </p>
//             <p className="mt-1 text-sm text-muted-foreground max-w-sm">
//               All registered products are well stocked above the minimum threshold of 5 units.
//             </p>
//           </div>
//         )}
//       </CardContent>
//     </Card>
//   );
// }
