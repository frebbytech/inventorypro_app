"use client";

import  { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,

} from "recharts";
import {
  Flame,
  Calendar,
} from "lucide-react";
import { ActivityHeatmapData } from "@/actions/dashboard";

interface AdminOperationalHeatmapProps {
  heatmapData: ActivityHeatmapData | null;
}

const chartConfig = {
  salesCount: {
    label: "Sales Events",
    color: "hsl(var(--primary))",
  },
  inventoryUpdates: {
    label: "Stock Updates",
    color: "#3b82f6",
  },
} satisfies ChartConfig;

export function AdminOperationalHeatmap({
  heatmapData,
}: AdminOperationalHeatmapProps) {
  const [activeView, setActiveView] = useState<"hourly" | "matrix">("hourly");

  if (!heatmapData) {
    return (
      <Card className="rounded-xl border bg-card/70 shadow-xs">
        <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          No operational activity data logged yet
        </CardContent>
      </Card>
    );
  }

  const { hourlyDistribution, summary, dayHourMatrix } = heatmapData;

  return (
    <Card className="rounded-xl border bg-card/70 shadow-xs">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold tracking-tight sm:text-lg">
                Peak Business & Register Activity
              </CardTitle>
              <Badge variant="outline" className="text-sm font-semibold">
                24-Hour Telemetry
              </Badge>
            </div>
            <CardDescription className="text-sm">
              Hourly breakdown of sales transactions and inventory restocking traffic.
            </CardDescription>
          </div>

          {/* Key Insights Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border bg-muted/20 px-2.5 py-1 text-sm">
              <Flame className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-muted-foreground">Peak Hour:</span>
              <span className="font-semibold text-foreground">{summary.peakSalesHour}</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border bg-muted/20 px-2.5 py-1 text-sm">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">Busiest Day:</span>
              <span className="font-semibold text-foreground">{summary.busiestDay}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        {/* Hourly distribution bar chart */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>24-Hour Register Volume</span>
            <span>Total Logged Operations: {summary.totalCombinedActivity}</span>
          </div>

          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <BarChart data={hourlyDistribution} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="hourLabel"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={2}
                className="text-[10px] font-medium fill-muted-foreground"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-[10px] font-medium fill-muted-foreground"
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                content={
                  <ChartTooltipContent
                    formatter={(val, name) => [
                      `${val} events`,
                      name === "salesCount" ? "Sales Transactions" : "Inventory Restocks",
                    ]}
                  />
                }
              />
              <Legend
                verticalAlign="top"
                height={30}
                formatter={(val) => (
                  <span className="text-sm capitalize font-medium text-foreground">
                    {val === "salesCount" ? "Sales Orders" : "Stock Updates"}
                  </span>
                )}
              />
              <Bar
                dataKey="salesCount"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                name="salesCount"
              />
              <Bar
                dataKey="inventoryUpdates"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                name="inventoryUpdates"
              />
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
