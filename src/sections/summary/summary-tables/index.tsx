"use client";

import { useMemo, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { DateRangePicker } from "@/components/custom/DatePicker";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table/data-table";
import { DataTableResetFilter } from "@/components/ui/table/data-table-reset-filter";
import { DataTableSearch } from "@/components/ui/table/data-table-search";
import { currencyFormatter } from "@/config/formatter";
import { cn } from "@/lib/utils";
import type { SaleSummaryView } from "@/types/globals";
import { columns } from "./columns";
import { useSummaryTableFilters } from "./use-summary-table-filters";

interface SummaryTableProps {
  data: SaleSummaryView[];
  dataExports: SaleSummaryView[];
  recordsCount: number;
}

/* -------------------------------------------------------------------------- */
/*  Helpers (module scope)                                                    */
/* -------------------------------------------------------------------------- */

// Fixed locale avoids server/client hydration mismatches.
const countFormat = new Intl.NumberFormat("en-GH");
const dateFormat = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" });

function KpiCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col bg-card p-5 sm:p-6">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      {children}
    </div>
  );
}

function Figure({ children }: { children: ReactNode }) {
  return (
    <dd className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">
      {children}
    </dd>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SummaryTable({ data, dataExports, recordsCount }: SummaryTableProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  const { date, setDate, isAnyFilterActive, resetFilters, searchQuery, setPage, setSearchQuery } =
    useSummaryTableFilters();

  // Recomputed only when the exported rows change, not on every keystroke in the search box.
  const { totalSales, transactionCount, averageSale } = useMemo(() => {
    const total = dataExports.reduce((sum, sale) => sum + (Number(sale.total_amount) || 0), 0);
    const count = dataExports.length;
    return {
      totalSales: total,
      transactionCount: count,
      averageSale: count > 0 ? total / count : 0,
    };
  }, [dataExports]);

  const from = date?.from ? dateFormat.format(date.from) : null;
  const to = date?.to ? dateFormat.format(date.to) : null;

  const rangeLabel = from ? (to ? `${from} to ${to}` : `From ${from}`) : "All dates";
  const tableName = from
    ? `Sales Summary from ${from}${to ? ` to ${to}` : ""}`
    : "Sales Summary";

  return (
    <div className="space-y-6">
      <section aria-label="Sales totals">
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3">
          <KpiCell label="Total sales">
            <Figure>{currencyFormatter(totalSales)}</Figure>
            <dd className="mt-auto pt-4 text-sm text-muted-foreground">{rangeLabel}</dd>
          </KpiCell>

          <KpiCell label="Transactions">
            <Figure>{countFormat.format(transactionCount)}</Figure>
          </KpiCell>

          <KpiCell label="Average sale">
            <Figure>{currencyFormatter(averageSale)}</Figure>
          </KpiCell>
        </dl>
      </section>

      <div className="overflow-hidden rounded-xl border bg-card">
        <DataTable
          tableFilter={
            <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
              <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
                <DataTableSearch
                  searchKey="name"
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  setPage={setPage}
                />
                <DateRangePicker date={date} setDate={setDate} />
                <DataTableResetFilter isFilterActive={isAnyFilterActive} onReset={resetFilters} />
              </div>

              <div className="flex w-full items-center gap-3 lg:w-auto">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {countFormat.format(recordsCount)} {recordsCount === 1 ? "record" : "records"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={isRefreshing}
                  onClick={() => startTransition(() => router.refresh())}
                >
                  <RefreshCw aria-hidden className={cn("size-4", isRefreshing && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>
          }
          columns={columns}
          data={data}
          totalItems={recordsCount}
          dataExports={dataExports}
          tableName={tableName}
        />
      </div>
    </div>
  );
}


// "use client";

// import { useRouter } from "next/navigation";
// import { DollarSign, ShoppingBag, TrendingUp, RefreshCw } from "lucide-react";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import { DataTable } from "@/components/ui/table/data-table";
// import { DataTableResetFilter } from "@/components/ui/table/data-table-reset-filter";
// import { DataTableSearch } from "@/components/ui/table/data-table-search";
// import { DateRangePicker } from "@/components/custom/DatePicker";
// import { useSummaryTableFilters } from "./use-summary-table-filters";
// import { columns } from "./columns";
// import { currencyFormatter } from "@/config/formatter";
// import { cn } from "@/lib/utils";
// import { SaleSummaryView } from "@/types/globals";

// interface SummaryTableProps {
//   data: SaleSummaryView[];
//   dataExports: SaleSummaryView[];
//   recordsCount: number;
// }

// export default function SummaryTable({
//   data,
//   dataExports,
//   recordsCount,
// }: SummaryTableProps) {
//   const router = useRouter();

//   const {
//     date,
//     setDate,
//     isAnyFilterActive,
//     resetFilters,
//     searchQuery,
//     setPage,
//     setSearchQuery,
//   } = useSummaryTableFilters();

//   // Compute metrics from the data
//   const totalSales = dataExports.reduce(
//     (sum, sale) => sum + Number(sale.total_amount),
//     0,
//   );

//   const totalCost = 0; // Placeholder – replace with actual calculation
//   const estimatedProfit = totalSales - totalCost;

//   const metrics = [
//     {
//       title: "Total Sales",
//       value: totalSales,
//       icon: DollarSign,
//       color: "text-emerald-600",
//       bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
//       borderColor: "border-l-emerald-200 dark:border-l-emerald-800",
//     },
//     {
//       title: "Total Cost",
//       value: totalCost,
//       icon: ShoppingBag,
//       color: "text-blue-600",
//       bgColor: "bg-blue-50 dark:bg-blue-950/30",
//       borderColor: "border-l-blue-200 dark:border-l-blue-800",
//     },
//     {
//       title: "Estimated Profit",
//       value: estimatedProfit,
//       icon: TrendingUp,
//       color: estimatedProfit >= 0 ? "text-purple-600" : "text-red-600",
//       bgColor:
//         estimatedProfit >= 0
//           ? "bg-purple-50 dark:bg-purple-950/30"
//           : "bg-red-50 dark:bg-red-950/30",
//       borderColor:
//         estimatedProfit >= 0
//           ? "border-l-purple-200 dark:border-l-purple-800"
//           : "border-red-200 dark:border-red-800",
//     },
//   ];

//   return (
//     <div className="space-y-6">
//       {/* Metrics Cards */}
//       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//         {metrics.map((metric) => (
//           <Card
//             key={metric.title}
//             className={cn(
//               "border-l-4 shadow-xs hover:shadow-md transition-shadow",
//               metric.borderColor,
//             )}
//           >
//             <CardContent>
//               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//                 <CardTitle  className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
//                   {metric.title}
//                 </CardTitle>
//                 <metric.icon className={cn("h-5 w-5", metric.color)} />
//               </CardHeader>
//               <div className="text-2xl font-bold tracking-tight">
//                 {currencyFormatter(metric.value)}
//               </div>
//               <div className="flex items-center gap-1 mt-1">
//                 <Badge variant="outline" className="text-sm font-normal">
//                   {dataExports.length} transactions
//                 </Badge>
//               </div>
//             </CardContent>
//           </Card>
//         ))}
//       </div>

//       {/* Table */}
//       <div className="rounded-lg border shadow-sm overflow-hidden">
//         <DataTable
//           tableFilter={
//             <>
//               {/* Filter Bar */}
//               <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ">
//                 <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
//                   <DataTableSearch
//                     searchKey="name"
//                     searchQuery={searchQuery}
//                     setSearchQuery={setSearchQuery}
//                     setPage={setPage}
//                   />
//                   {/* Cleaned up and fully synchronized with useQueryState signatures */}
//                   <DateRangePicker date={date} setDate={setDate} />
//                   <DataTableResetFilter
//                     isFilterActive={isAnyFilterActive}
//                     onReset={resetFilters}
//                   />
//                 </div>
//                 <div className="flex items-center gap-2 w-full lg:w-auto">
//                   <Button
//                     variant="outline"
//                     size="sm"
//                     onClick={() => router.refresh()}
//                     className="gap-2"
//                   >
//                     <RefreshCw className="h-4 w-4" />
//                     Refresh
//                   </Button>
//                   <Badge variant="secondary" className="text-sm h-8 px-3">
//                     {recordsCount} total records
//                   </Badge>
//                 </div>
//               </div>
//             </>
//           }
//           columns={columns}
//           data={data}
//           totalItems={recordsCount}
//           dataExports={dataExports}
//           tableName={
//             !date?.from
//               ? "Sales Summary"
//               : `Sales Summary from ${date?.from?.toDateString() || "Date"} to ${date?.to?.toDateString() || "Date"}`
//           }
//         />
//       </div>
//     </div>
//   );
// }
