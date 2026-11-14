/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  ActivityHeatmapData,
  HourlyActivityPoint,
  DayHourHeatmapCell,
} from "@/actions/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import {
  Clock,
  Flame,
  ShoppingBag,
  Package,
  Calendar,
  Layers,
  BarChart3,
  Grid,
  TrendingUp,
} from "lucide-react";

interface ActivityHeatmapChartProps {
  data: ActivityHeatmapData;
}

type FilterMode = "all" | "sales" | "inventory";
type ViewMode = "chart" | "grid";

export default function ActivityHeatmapChart({ data }: ActivityHeatmapChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("chart");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [hoveredCell, setHoveredCell] = useState<DayHourHeatmapCell | null>(null);

  const { hourlyDistribution, dayHourMatrix, summary } = data;

  // Compute max activity for color scale in heatmap grid
  const maxMatrixActivity = useMemo(() => {
    if (!dayHourMatrix || dayHourMatrix.length === 0) return 1;
    return Math.max(
      1,
      ...dayHourMatrix.map((c) => {
        if (filterMode === "sales") return c.salesCount;
        if (filterMode === "inventory") return c.inventoryUpdates;
        return c.totalActivity;
      }),
    );
  }, [dayHourMatrix, filterMode]);

  // Color intensity calculation for grid
  const getCellColor = (cell: DayHourHeatmapCell) => {
    const val =
      filterMode === "sales"
        ? cell.salesCount
        : filterMode === "inventory"
        ? cell.inventoryUpdates
        : cell.totalActivity;

    if (val === 0) return "bg-muted/40 text-muted-foreground border-border/30";

    const ratio = val / maxMatrixActivity;

    if (filterMode === "sales") {
      if (ratio < 0.25) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900";
      if (ratio < 0.5) return "bg-emerald-300 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-100 border-emerald-400";
      if (ratio < 0.75) return "bg-emerald-500 text-white dark:bg-emerald-600 border-emerald-600";
      return "bg-emerald-700 text-white dark:bg-emerald-500 font-bold border-emerald-800 shadow-sm";
    }

    if (filterMode === "inventory") {
      if (ratio < 0.25) return "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-900";
      if (ratio < 0.5) return "bg-sky-300 text-sky-950 dark:bg-sky-800 dark:text-sky-100 border-sky-400";
      if (ratio < 0.75) return "bg-sky-500 text-white dark:bg-sky-600 border-sky-600";
      return "bg-sky-700 text-white dark:bg-sky-500 font-bold border-sky-800 shadow-sm";
    }

    // Combined (violet / purple gradient)
    if (ratio < 0.25) return "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200 dark:border-violet-900";
    if (ratio < 0.5) return "bg-violet-300 text-violet-950 dark:bg-violet-800 dark:text-violet-100 border-violet-400";
    if (ratio < 0.75) return "bg-violet-500 text-white dark:bg-violet-600 border-violet-600";
    return "bg-violet-700 text-white dark:bg-violet-500 font-bold border-violet-800 shadow-sm";
  };

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Custom Chart Tooltip
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const item: HourlyActivityPoint = payload[0].payload;
      return (
        <div className="bg-popover/95 backdrop-blur border border-border shadow-lg rounded-lg p-3 text-sm space-y-2 max-w-xs z-50">
          <div className="flex items-center justify-between gap-3 border-b pb-1.5 font-semibold text-popover-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              {item.hourLabel} ({item.timeSlot})
            </span>
            <Badge variant="outline" className="text-[10px] font-medium">
              Last 30 Days
            </Badge>
          </div>
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
              <span className="flex items-center gap-1">
                <ShoppingBag className="h-3 w-3" />
                Sales Transactions:
              </span>
              <span className="font-semibold">{item.salesCount}</span>
            </div>
            {item.salesRevenue > 0 && (
              <div className="flex items-center justify-between text-muted-foreground pl-4">
                <span>Revenue Generated:</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(item.salesRevenue)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sky-600 dark:text-sky-400 pt-0.5">
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3" />
                Inventory Updates:
              </span>
              <span className="font-semibold">{item.inventoryUpdates}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-1 font-semibold text-foreground">
              <span>Total Activity:</span>
              <span className="text-primary">{item.totalActivity} events</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Flame className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg font-bold">
                Activity Heatmap & Peak Operational Hours
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              Analyze peak hours for sales transactions and inventory updates over the last 30 days to optimize staffing and restock workflows.
            </CardDescription>
          </div>

          {/* Controls: Filter & View Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter mode */}
            <div className="inline-flex rounded-lg border bg-muted/30 p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setFilterMode("all")}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  filterMode === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Activity
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("sales")}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  filterMode === "sales"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sales Peak
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("inventory")}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  filterMode === "inventory"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Inventory Updates
              </button>
            </div>

            {/* View Mode Toggle */}
            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as ViewMode)}
              className="w-auto"
            >
              <TabsList className="h-8 p-0.5">
                <TabsTrigger value="chart" className="text-sm h-7 px-2.5 gap-1">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Hourly Trend
                </TabsTrigger>
                <TabsTrigger value="grid" className="text-sm h-7 px-2.5 gap-1">
                  <Grid className="h-3.5 w-3.5" />
                  Day × Hour Grid
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* ── Summary KPI Highlights ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
            <div className="p-2 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Peak Sales Hour
              </p>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {summary.peakSalesHour}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({summary.peakSalesCount} sales)
                </span>
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center gap-3">
            <div className="p-2 rounded-md bg-sky-500/20 text-sky-600 dark:text-sky-400">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Peak Inventory Hour
              </p>
              <p className="text-sm font-bold text-sky-700 dark:text-sky-300">
                {summary.peakInventoryHour}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({summary.peakInventoryCount} updates)
                </span>
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center gap-3">
            <div className="p-2 rounded-md bg-violet-500/20 text-violet-600 dark:text-violet-400">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Busiest Day
              </p>
              <p className="text-sm font-bold text-violet-700 dark:text-violet-300">
                {summary.busiestDay}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({summary.busiestDayActivity} events)
                </span>
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
            <div className="p-2 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                30-Day Activity
              </p>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                {summary.totalCombinedActivity}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  total events
                </span>
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {/* VIEW 1: Hourly Distribution Chart */}
        {viewMode === "chart" && (
          <div className="space-y-3">
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={hourlyDistribution}
                  margin={{ top: 15, right: 10, left: -20, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="inventoryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis
                    dataKey="hourLabel"
                    tick={{ fontSize: 11 }}
                    interval={1}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="circle"
                    formatter={(value) => (
                      <span className="text-sm font-medium text-foreground mr-3">
                        {value}
                      </span>
                    )}
                  />

                  {/* Show appropriate series based on filter */}
                  {(filterMode === "all" || filterMode === "sales") && (
                    <Area
                      type="monotone"
                      dataKey="salesCount"
                      name="Sales Orders"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#salesGradient)"
                    />
                  )}

                  {(filterMode === "all" || filterMode === "inventory") && (
                    <Bar
                      dataKey="inventoryUpdates"
                      name="Inventory Updates"
                      fill="#0284c7"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                      opacity={0.85}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-2">
              <span>🕒 12:00 AM (Midnight)</span>
              <span>☀️ 12:00 PM (Noon)</span>
              <span>🌙 11:00 PM (Night)</span>
            </div>
          </div>
        )}

        {/* VIEW 2: 7-Day x 24-Hour Heatmap Grid */}
        {viewMode === "grid" && (
          <div className="space-y-4">
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[700px]">
                {/* Hours Header Row */}
                <div className="grid grid-cols-[60px_repeat(24,1fr)] gap-1 text-[10px] text-muted-foreground mb-1 text-center font-mono">
                  <div className="text-left font-sans font-medium pl-1">Day</div>
                  {hours.map((h) => (
                    <div key={h} className="truncate">
                      {h % 3 === 0 ? (h === 0 ? "12A" : h < 12 ? `${h}A` : h === 12 ? "12P" : `${h - 12}P`) : "·"}
                    </div>
                  ))}
                </div>

                {/* Day Rows */}
                {daysOfWeek.map((dayName, dIdx) => (
                  <div
                    key={dayName}
                    className="grid grid-cols-[60px_repeat(24,1fr)] gap-1 mb-1 items-center"
                  >
                    <div className="text-sm font-semibold text-muted-foreground pl-1">
                      {dayName}
                    </div>

                    {hours.map((h) => {
                      const cell = dayHourMatrix.find(
                        (c) => c.dayIndex === dIdx && c.hour === h,
                      ) || {
                        day: dayName,
                        dayShort: dayName,
                        dayIndex: dIdx,
                        hour: h,
                        hourLabel: `${h}:00`,
                        salesCount: 0,
                        inventoryUpdates: 0,
                        totalActivity: 0,
                        salesRevenue: 0,
                      };

                      const displayVal =
                        filterMode === "sales"
                          ? cell.salesCount
                          : filterMode === "inventory"
                          ? cell.inventoryUpdates
                          : cell.totalActivity;

                      return (
                        <div
                          key={h}
                          onMouseEnter={() => setHoveredCell(cell)}
                          onMouseLeave={() => setHoveredCell(null)}
                          className={`h-7 rounded border flex items-center justify-center text-[10px] cursor-pointer transition-all duration-150 ${getCellColor(
                            cell,
                          )} hover:scale-110 hover:z-20 hover:shadow-md`}
                          title={`${cell.day} at ${cell.hourLabel}: ${displayVal} events (${cell.salesCount} sales, ${cell.inventoryUpdates} inventory updates)`}
                        >
                          {displayVal > 0 ? displayVal : ""}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Hovered Cell Detail Strip & Legend */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/40 border text-sm">
              <div>
                {hoveredCell ? (
                  <span className="font-medium text-foreground">
                    📅 <span className="font-bold">{hoveredCell.day}</span> at{" "}
                    <span className="font-bold">{hoveredCell.hourLabel}</span>:{" "}
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      {hoveredCell.salesCount} sales
                    </span>{" "}
                    (
                    {formatCurrency(hoveredCell.salesRevenue)}
                    ) &{" "}
                    <span className="text-sky-600 dark:text-sky-400 font-semibold">
                      {hoveredCell.inventoryUpdates} inventory updates
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Hover over any grid square to inspect exact hourly sales and update metrics.
                  </span>
                )}
              </div>

              {/* Heatmap Legend */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
                <span>Low</span>
                <span className="inline-block h-3 w-4 rounded bg-muted/60 border" />
                <span
                  className={`inline-block h-3 w-4 rounded ${
                    filterMode === "sales"
                      ? "bg-emerald-200 dark:bg-emerald-900"
                      : filterMode === "inventory"
                      ? "bg-sky-200 dark:bg-sky-900"
                      : "bg-violet-200 dark:bg-violet-900"
                  }`}
                />
                <span
                  className={`inline-block h-3 w-4 rounded ${
                    filterMode === "sales"
                      ? "bg-emerald-400 dark:bg-emerald-700"
                      : filterMode === "inventory"
                      ? "bg-sky-400 dark:bg-sky-700"
                      : "bg-violet-400 dark:bg-violet-700"
                  }`}
                />
                <span
                  className={`inline-block h-3 w-4 rounded ${
                    filterMode === "sales"
                      ? "bg-emerald-600 text-white"
                      : filterMode === "inventory"
                      ? "bg-sky-600 text-white"
                      : "bg-violet-600 text-white"
                  }`}
                />
                <span>Peak</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
