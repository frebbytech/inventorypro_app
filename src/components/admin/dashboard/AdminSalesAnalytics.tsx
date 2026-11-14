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
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Award,
  Package,
  ArrowUpRight,
  Sparkles,
  Layers,
  ShoppingBag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/currency";
import { AdminCategoryRevenue, AdminTopProduct } from "@/actions/dashboard";
import Link from "next/link";

interface AdminSalesAnalyticsProps {
  salesOverTime7d: { date: string; revenue: number; orders: number }[];
  salesOverTime14d: { date: string; revenue: number; orders: number }[];
  salesOverTime30d: { date: string; revenue: number; orders: number }[];
  topProductsByRevenue: AdminTopProduct[];
  topProductsByQuantity: AdminTopProduct[];
  revenueByCategory: AdminCategoryRevenue[];
  totalMonthlySales: { month: string; value: number }[];
  globalTimeframe?: string;
}

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "hsl(var(--primary))",
  },
  orders: {
    label: "Orders",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

const CATEGORY_COLORS = [
  "hsl(var(--primary))",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

export function AdminSalesAnalytics({
  salesOverTime7d,
  salesOverTime14d,
  salesOverTime30d,
  topProductsByRevenue,
  topProductsByQuantity,
  revenueByCategory,
  totalMonthlySales,
  globalTimeframe = "7d",
}: AdminSalesAnalyticsProps) {
  const [selectedRange, setSelectedRange] = useState<"7d" | "14d" | "30d">(
    "7d",
  );
  const [chartType, setChartType] = useState<"area" | "bar" | "line">("area");
  const [metricView, setMetricView] = useState<"revenue" | "orders" | "both">(
    "both",
  );
  const [productRankMode, setProductRankMode] = useState<
    "revenue" | "quantity"
  >("revenue");

  // Sync with global timeframe if compatible
  const activeSalesData = useMemo(() => {
    if (selectedRange === "30d" || globalTimeframe === "30d")
      return salesOverTime30d;
    if (selectedRange === "14d" || globalTimeframe === "14d")
      return salesOverTime14d;
    return salesOverTime7d;
  }, [
    selectedRange,
    globalTimeframe,
    salesOverTime7d,
    salesOverTime14d,
    salesOverTime30d,
  ]);

  // Analytics stats for active timeframe
  const periodStats = useMemo(() => {
    const totalRev = activeSalesData.reduce(
      (acc, curr) => acc + curr.revenue,
      0,
    );
    const totalOrd = activeSalesData.reduce(
      (acc, curr) => acc + curr.orders,
      0,
    );
    const avgDailyRev =
      activeSalesData.length > 0 ? totalRev / activeSalesData.length : 0;
    const peakDay = [...activeSalesData].sort(
      (a, b) => b.revenue - a.revenue,
    )[0];
    return {
      totalRev,
      totalOrd,
      avgDailyRev,
      peakDay: peakDay ? peakDay.date : "N/A",
      peakRev: peakDay ? peakDay.revenue : 0,
    };
  }, [activeSalesData]);

  // Monthly stats
  const monthlyStats = useMemo(() => {
    const ytdTotal = totalMonthlySales.reduce(
      (acc, curr) => acc + curr.value,
      0,
    );
    const peakMonth = [...totalMonthlySales].sort(
      (a, b) => b.value - a.value,
    )[0];
    return {
      ytdTotal,
      peakMonth: peakMonth ? peakMonth.month : "N/A",
      peakMonthVal: peakMonth ? peakMonth.value : 0,
    };
  }, [totalMonthlySales]);

  // Active top products list
  const activeTopProducts =
    productRankMode === "revenue"
      ? topProductsByRevenue
      : topProductsByQuantity;

  return (
    <div className="space-y-6">
      {/* ── 1. Main Sales & Revenue Trajectory Card ── */}
      <Card className="rounded-xl border bg-card/70 shadow-xs backdrop-blur-xs">
        <CardHeader className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold tracking-tight sm:text-xl">
                Sales & Revenue Analytics
              </CardTitle>
              <Badge
                variant="outline"
                className="border-primary/30 text-sm font-semibold text-primary"
              >
                Real-Time
              </Badge>
            </div>
            <CardDescription className="text-sm sm:text-sm">
              Revenue trajectories, transaction volume trends, and daily
              performance metrics.
            </CardDescription>
          </div>

          {/* Controls toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Days Toggle */}
            <div className="flex items-center rounded-lg border bg-muted/40 p-1">
              {(["7d", "14d", "30d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRange(r)}
                  className={`rounded px-2.5 py-1 text-sm font-medium transition-all ${
                    selectedRange === r
                      ? "bg-background text-primary shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "7d" ? "7 Days" : r === "14d" ? "14 Days" : "30 Days"}
                </button>
              ))}
            </div>

            {/* Chart Style Toggle */}
            <div className="hidden items-center rounded-lg border bg-muted/40 p-1 sm:flex">
              <button
                onClick={() => setChartType("area")}
                className={`rounded p-1.5 transition-all ${
                  chartType === "area"
                    ? "bg-background text-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Area Chart"
              >
                <TrendingUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setChartType("bar")}
                className={`rounded p-1.5 transition-all ${
                  chartType === "bar"
                    ? "bg-background text-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Bar Chart"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setChartType("line")}
                className={`rounded p-1.5 transition-all ${
                  chartType === "line"
                    ? "bg-background text-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Line Chart"
              >
                <LineChartIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {/* Quick Metrics Ribbon */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground">
                Period Revenue
              </span>
              <p className="mt-1 text-base font-bold text-foreground sm:text-lg">
                {formatCurrency(periodStats.totalRev)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground">
                Period Orders
              </span>
              <p className="mt-1 text-base font-bold text-foreground sm:text-lg">
                {periodStats.totalOrd.toLocaleString()} orders
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground">
                Daily Average
              </span>
              <p className="mt-1 text-base font-bold text-foreground sm:text-lg">
                {formatCurrency(periodStats.avgDailyRev)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground">
                Peak Day
              </span>
              <p className="mt-1 text-base font-bold text-primary sm:text-lg">
                {periodStats.peakDay} ({formatCurrency(periodStats.peakRev)})
              </p>
            </div>
          </div>

          {/* Chart Rendering */}
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            {chartType === "area" ? (
              <AreaChart
                data={activeSalesData}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                  <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(val) => formatCurrency(val)}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <ChartTooltip
                  cursor={{
                    stroke: "hsl(var(--muted-foreground))",
                    strokeWidth: 1,
                  }}
                  content={
                    <ChartTooltipContent
                      formatter={(val, name) =>
                        name === "revenue"
                          ? [formatCurrency(Number(val)), "Revenue"]
                          : [`${val} orders`, "Orders"]
                      }
                    />
                  }
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(val) => (
                    <span className="text-sm font-semibold capitalize text-foreground">
                      {val}
                    </span>
                  )}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#revenueGrad)"
                  name="revenue"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#ordersGrad)"
                  name="orders"
                />
              </AreaChart>
            ) : chartType === "bar" ? (
              <BarChart
                data={activeSalesData}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(val) => formatCurrency(val)}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                  content={
                    <ChartTooltipContent
                      formatter={(val, name) =>
                        name === "revenue"
                          ? [formatCurrency(Number(val)), "Revenue"]
                          : [`${val} orders`, "Orders"]
                      }
                    />
                  }
                />
                <Legend verticalAlign="top" height={36} />
                <Bar
                  yAxisId="left"
                  dataKey="revenue"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  name="revenue"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  name="orders"
                />
              </BarChart>
            ) : (
              <LineChart
                data={activeSalesData}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(val) => formatCurrency(val)}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(val, name) =>
                        name === "revenue"
                          ? [formatCurrency(Number(val)), "Revenue"]
                          : [`${val} orders`, "Orders"]
                      }
                    />
                  }
                />
                <Legend verticalAlign="top" height={36} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{ r: 3, fill: "hsl(var(--primary))" }}
                  name="revenue"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#3b82f6" }}
                  name="orders"
                />
              </LineChart>
            )}
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ── 2. Two-Column Analytics: Category Breakdown & Monthly Sales Trend ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Category Revenue Distribution (Donut + Breakdown) */}
        <Card className="rounded-xl border bg-card/70 shadow-xs lg:col-span-6">
          <CardHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base font-bold tracking-tight sm:text-lg">
                  Revenue by Category
                </CardTitle>
                <CardDescription className="text-sm">
                  Sales distribution across product categories.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-sm">
                {revenueByCategory.length} Categories
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {revenueByCategory.length > 0 ? (
              <div className="space-y-5">
                <ChartContainer
                  config={chartConfig}
                  className="h-[300px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(val, name) => [
                              formatCurrency(Number(val)),
                              String(name),
                            ]}
                          />
                        }
                      />
                      <Pie
                        data={revenueByCategory}
                        dataKey="revenue"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius="60%"
                        outerRadius="85%"
                        paddingAngle={3}
                      >
                        {revenueByCategory.map((entry, index) => (
                          <Cell
                            key={`cell-${entry.category || index}`}
                            fill={
                              CATEGORY_COLORS[index % CATEGORY_COLORS.length]
                            }
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>

                {/* Itemized Category Breakdown List */}
                <div className="space-y-3 border-t pt-4">
                  {revenueByCategory.slice(0, 5).map((cat, idx) => (
                    <div key={cat.category} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor:
                                CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                            }}
                          />
                          <span className="font-medium text-foreground">
                            {cat.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {formatCurrency(cat.revenue)}
                          </span>
                          <span className="text-muted-foreground">
                            ({cat.percentage}%)
                          </span>
                        </div>
                      </div>
                      <Progress
                        value={cat.percentage}
                        className="h-1.5 bg-muted"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                No category sales recorded yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Monthly Sales Trend (Current Calendar Year) */}
        <Card className="rounded-xl border bg-card/70 shadow-xs lg:col-span-6">
          <CardHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base font-bold tracking-tight sm:text-lg">
                  Monthly Sales Trajectory
                </CardTitle>
                <CardDescription className="text-sm">
                  January - December {new Date().getFullYear()} performance.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-sm text-emerald-600 dark:text-emerald-400"
              >
                YTD: {formatCurrency(monthlyStats.ytdTotal)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/20 px-3.5 py-2 text-sm">
              <span className="text-muted-foreground">
                Best Performing Month:
              </span>
              <span className="font-semibold text-foreground">
                {monthlyStats.peakMonth} (
                {formatCurrency(monthlyStats.peakMonthVal)})
              </span>
            </div>

            <ChartContainer config={chartConfig} className="h-[240px] w-full">
              <BarChart
                data={totalMonthlySales}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(val) => val.slice(0, 3)}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(val) => formatCurrency(val)}
                  className="text-[11px] font-medium fill-muted-foreground"
                />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                  content={
                    <ChartTooltipContent
                      formatter={(val) => [
                        formatCurrency(Number(val)),
                        "Revenue",
                      ]}
                    />
                  }
                />
                <Bar
                  dataKey="value"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  name="Monthly Sales"
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Top Best-Selling Products Leaderboard ── */}
      <Card className="rounded-xl border bg-card/70 shadow-xs">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold tracking-tight sm:text-lg">
                  Top Performing Products
                </CardTitle>
                <Badge variant="outline" className="text-sm font-semibold">
                  Leaderboard
                </Badge>
              </div>
              <CardDescription className="text-sm">
                Highest grossing inventory items and top volume drivers.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border bg-muted/40 p-1">
                <button
                  onClick={() => setProductRankMode("revenue")}
                  className={`rounded px-2.5 py-1 text-sm font-medium transition-all ${
                    productRankMode === "revenue"
                      ? "bg-background text-primary shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  By Revenue
                </button>
                <button
                  onClick={() => setProductRankMode("quantity")}
                  className={`rounded px-2.5 py-1 text-sm font-medium transition-all ${
                    productRankMode === "quantity"
                      ? "bg-background text-primary shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  By Volume (Units)
                </button>
              </div>

              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 text-sm font-medium"
              >
                <Link href="/admin/product">View All</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {activeTopProducts.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {activeTopProducts.slice(0, 6).map((product, index) => {
                const isGold = index === 0;
                const isSilver = index === 1;
                const isBronze = index === 2;

                return (
                  <div
                    key={product.id || index}
                    className="flex items-center justify-between rounded-xl border bg-card/50 p-4 transition-all hover:border-primary/30 hover:bg-card hover:shadow-xs"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-sm ${
                          isGold
                            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            : isSilver
                              ? "bg-slate-300/20 text-slate-600 dark:text-slate-300 border border-slate-400/30"
                              : isBronze
                                ? "bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        #{index + 1}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {product.name}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="truncate">
                            {product.categoryName}
                          </span>
                          <span>•</span>
                          <span>{product.quantity.toLocaleString()} sold</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground">
                        {formatCurrency(product.revenue)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatCurrency(product.sellingPrice)}/ea
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No sales data recorded for products yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
