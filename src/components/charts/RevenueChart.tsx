"use client";

import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/currency";

// Configuration for shadcn chart utilities
const chartConfig = {
  revenue: {
    label: "Revenue",
  },
} satisfies ChartConfig;

// CSS variable names matching your Tailwind/Shadcn theme
const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface RevenueByCategoryItem {
  category: string;
  revenue: number;
}

interface RevenueChartProps {
  revenueByCategory: RevenueByCategoryItem[];
}

export default function RevenueChart({ revenueByCategory }: RevenueChartProps) {
  // Memoize data to prevent redundant canvas updates
  const chartData = useMemo(() => {
    return revenueByCategory || [];
  }, [revenueByCategory]);

  // Handle empty state gracefully
  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center text-sm text-muted-foreground">
        No revenue data available
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value) => formatCurrency(Number(value))}
              />
            }
          />
          <Pie
            data={chartData}
            dataKey="revenue"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="80%"
            paddingAngle={2}
           label={({ name, percent }) =>
    `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`
  }
          >
            {chartData.map((item, index) => (
              <Cell
                key={`cell-${item.category || index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Legend
            iconType="circle"
            layout="horizontal"
            verticalAlign="bottom"
            align="center"
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
