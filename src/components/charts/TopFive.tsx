"use client";

import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { TopProducts } from "@/types/globals";

// Configuration for shadcn chart utilities
const chartConfig = {
  quantity: {
    label: "Units Sold",
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

interface TopFiveChartProps {
  topFiveSoldProducts: TopProducts[];
}

export default function TopFiveChart({
  topFiveSoldProducts,
}: TopFiveChartProps) {
  // Memoize data to prevent redundant calculations and re-renders
  const chartData = useMemo(() => {
    return topFiveSoldProducts?.slice(0, 5) || [];
  }, [topFiveSoldProducts]);

  // Handle empty state gracefully
  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center text-sm text-muted-foreground">
        No data available
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
                formatter={(value) => `${value} units`}
              />
            }
          />
          <Pie
            data={chartData}
            dataKey="quantity"
            nameKey="name"
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
                key={`cell-${item.name || index}`}
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
