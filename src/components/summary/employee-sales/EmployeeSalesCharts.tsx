"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { TimeSeriesPoint } from "@/actions/employee-summary";
import { currencyFormatter } from "@/config/formatter";
import {
  ArrowDownUp,
  BarChart3,
  CreditCard,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  TrendingUp,
} from "lucide-react";

interface EmployeeSalesChartsProps {
  timeSeries: TimeSeriesPoint[];
  salesByEmployee: {
    employeeId: string;
    employeeName: string;
    username: string;
    revenue: number;
    transactions: number;
    itemsSold: number;
    atv: number;
    contributionPct: number;
  }[];
  paymentModeBreakdown: {
    mode: string;
    count: number;
    amount: number;
    percentage: number;
  }[];
  isSingleEmployeeView: boolean;
  selectedEmployeeName?: string;
}

const CHART_COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#6366f1", // indigo
];

const trendChartConfig = {
  revenue: {
    label: "Net Revenue",
    color: "hsl(var(--primary))",
  },
  transactions: {
    label: "Transactions",
    color: "#3b82f6",
  },
  itemsSold: {
    label: "Items Sold",
    color: "#8b5cf6",
  },
} satisfies ChartConfig;

export default function EmployeeSalesCharts({
  timeSeries,
  salesByEmployee,
  paymentModeBreakdown,
  isSingleEmployeeView,
  selectedEmployeeName,
}: EmployeeSalesChartsProps) {
  const [trendMetric, setTrendMetric] = useState<"revenue" | "transactions" | "itemsSold">("revenue");
  const [employeeSortOrder, setEmployeeSortOrder] = useState<"desc" | "asc">("desc");

  // Sorted employee data
  const sortedEmployeeData = [...salesByEmployee].sort((a, b) => {
    return employeeSortOrder === "desc"
      ? b.revenue - a.revenue
      : a.revenue - b.revenue;
  });

  const totalTimeSeriesRevenue = timeSeries.reduce((s, p) => s + p.revenue, 0);

  return (
    <div className="space-y-6">
      {/* 1. Main Time Series Sales Trend & Volume Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Sales Revenue Trend Chart */}
        <Card className="lg:col-span-2 shadow-xs">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-primary" />
                <span>Sales & Revenue Trajectory</span>
              </CardTitle>
              <CardDescription className="text-sm">
                {isSingleEmployeeView
                  ? `Performance timeline for ${selectedEmployeeName || "selected employee"}`
                  : "Organization-wide performance over the selected period"}
              </CardDescription>
            </div>

            {/* Metric Toggle Buttons */}
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border text-sm">
              <button
                type="button"
                onClick={() => setTrendMetric("revenue")}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  trendMetric === "revenue"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Revenue
              </button>
              <button
                type="button"
                onClick={() => setTrendMetric("transactions")}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  trendMetric === "transactions"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Transactions
              </button>
              <button
                type="button"
                onClick={() => setTrendMetric("itemsSold")}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  trendMetric === "itemsSold"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Items Sold
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {timeSeries.length === 0 || totalTimeSeriesRevenue === 0 && trendMetric === "revenue" ? (
              <div className="flex h-[280px] w-full items-center justify-center text-sm text-muted-foreground bg-muted/10 rounded-lg">
                No transaction data available for the chosen date range.
              </div>
            ) : (
              <ChartContainer config={trendChartConfig} className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorItems" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="period"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                      tickFormatter={(val) =>
                        trendMetric === "revenue" ? `${currencyFormatter(val)}` : `${val}`
                      }
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as TimeSeriesPoint;
                          return (
                            <div className="bg-popover text-popover-foreground border rounded-lg p-2.5 shadow-md text-sm space-y-1">
                              <p className="font-semibold">{data.period}</p>
                              <div className="flex justify-between gap-4 text-emerald-600">
                                <span>Revenue:</span>
                                <span className="font-bold">{currencyFormatter(data.revenue)}</span>
                              </div>
                              <div className="flex justify-between gap-4 text-blue-600">
                                <span>Transactions:</span>
                                <span className="font-medium">{data.transactions} txs</span>
                              </div>
                              <div className="flex justify-between gap-4 text-indigo-600">
                                <span>Units Sold:</span>
                                <span className="font-medium">{data.itemsSold} items</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {trendMetric === "revenue" && (
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    )}
                    {trendMetric === "transactions" && (
                      <Area
                        type="monotone"
                        dataKey="transactions"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorTx)"
                      />
                    )}
                    {trendMetric === "itemsSold" && (
                      <Area
                        type="monotone"
                        dataKey="itemsSold"
                        stroke="#8b5cf6"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorItems)"
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Right 1 Col: Payment Methods Breakdown */}
        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <span>Payment Channels</span>
            </CardTitle>
            <CardDescription className="text-sm">
              Revenue breakdown by payment tender
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {paymentModeBreakdown.length === 0 ? (
              <div className="flex h-[280px] w-full items-center justify-center text-sm text-muted-foreground bg-muted/10 rounded-lg">
                No payment transactions recorded.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentModeBreakdown}
                        dataKey="amount"
                        nameKey="mode"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                      >
                        {paymentModeBreakdown.map((entry, index) => (
                          <Cell
                            key={`cell-pm-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-popover text-popover-foreground border rounded-lg p-2 shadow-md text-sm">
                                <p className="font-semibold capitalize">{data.mode}</p>
                                <p className="text-emerald-600 font-bold">{currencyFormatter(data.amount)}</p>
                                <p className="text-muted-foreground">{data.count} transactions ({data.percentage}%)</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend list with values */}
                <div className="space-y-1.5 pt-1 border-t text-sm">
                  {paymentModeBreakdown.map((pm, idx) => (
                    <div key={pm.mode} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                        <span className="capitalize text-muted-foreground">{pm.mode}</span>
                      </div>
                      <div className="flex items-center gap-2 font-medium">
                        <span>{currencyFormatter(pm.amount)}</span>
                        <span className="text-[11px] text-muted-foreground">({pm.percentage}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 2. Employee Comparative Analytics Section (When viewing All Employees) */}
      {!isSingleEmployeeView && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Sales by Employee Bar Chart */}
          <Card className="lg:col-span-2 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span>Sales by Employee Comparison</span>
                </CardTitle>
                <CardDescription className="text-sm">
                  Comparative revenue and transaction volume per staff member
                </CardDescription>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setEmployeeSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                className="h-7 text-sm gap-1"
                title="Toggle sort direction"
              >
                <ArrowDownUp className="h-3 w-3" />
                <span>{employeeSortOrder === "desc" ? "Top First" : "Lowest First"}</span>
              </Button>
            </CardHeader>
            <CardContent className="pt-2">
              {sortedEmployeeData.length === 0 ? (
                <div className="flex h-[260px] w-full items-center justify-center text-sm text-muted-foreground bg-muted/10 rounded-lg">
                  No employee sales recorded for this period.
                </div>
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sortedEmployeeData}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 30, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        tickFormatter={(val) => currencyFormatter(val)}
                      />
                      <YAxis
                        type="category"
                        dataKey="employeeName"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        width={100}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-popover text-popover-foreground border rounded-lg p-2.5 shadow-md text-sm space-y-1">
                                <p className="font-bold">{data.employeeName}</p>
                                <p className="text-[11px] text-muted-foreground">@{data.username}</p>
                                <div className="flex justify-between gap-4 text-emerald-600 font-semibold">
                                  <span>Total Sales:</span>
                                  <span>{currencyFormatter(data.revenue)}</span>
                                </div>
                                <div className="flex justify-between gap-4 text-muted-foreground">
                                  <span>Transactions:</span>
                                  <span>{data.transactions} txs</span>
                                </div>
                                <div className="flex justify-between gap-4 text-muted-foreground">
                                  <span>Avg Value:</span>
                                  <span>{currencyFormatter(data.atv)}</span>
                                </div>
                                <div className="flex justify-between gap-4 text-muted-foreground">
                                  <span>Share:</span>
                                  <span>{data.contributionPct}%</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="hsl(var(--primary))"
                        radius={[0, 4, 4, 0]}
                        barSize={20}
                      >
                        {sortedEmployeeData.map((_, index) => (
                          <Cell
                            key={`bar-cell-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right 1 Col: Employee Revenue Contribution Share (Donut Chart) */}
          <Card className="shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-primary" />
                <span>Contribution Share</span>
              </CardTitle>
              <CardDescription className="text-sm">
                Each employee&apos;s percentage share of total revenue
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {salesByEmployee.length === 0 ? (
                <div className="flex h-[260px] w-full items-center justify-center text-sm text-muted-foreground bg-muted/10 rounded-lg">
                  No employee share data available.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="h-[170px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={salesByEmployee}
                          dataKey="revenue"
                          nameKey="employeeName"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={2}
                        >
                          {salesByEmployee.map((entry, index) => (
                            <Cell
                              key={`cell-emp-pie-${entry.employeeId || index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-popover text-popover-foreground border rounded-lg p-2 shadow-md text-sm">
                                  <p className="font-bold">{data.employeeName}</p>
                                  <p className="text-emerald-600 font-bold">{currencyFormatter(data.revenue)}</p>
                                  <p className="text-muted-foreground">{data.contributionPct}% of total revenue</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* List of top contributors */}
                  <div className="space-y-1.5 pt-1 border-t text-sm max-h-24 overflow-y-auto pr-1">
                    {salesByEmployee.slice(0, 5).map((emp, idx) => (
                      <div key={emp.employeeId} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                          />
                          <span className="truncate text-muted-foreground">{emp.employeeName}</span>
                        </div>
                        <span className="font-semibold text-foreground shrink-0">{emp.contributionPct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
