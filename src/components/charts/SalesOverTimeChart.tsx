"use client";
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
  Line,
} from "recharts";
import { formatCurrency } from "@/lib/currency";

const chartConfig = {
  value: {
    label: "Amount",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

const SalesOverTimeChart = ({
  salesForLastSevenDays,
}: {
  salesForLastSevenDays: { date: string; revenue: number; orders: number }[];
}) => {
  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <BarChart data={salesForLastSevenDays}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis
          yAxisId="left"
          tickFormatter={(value) => formatCurrency(value)}
        />
        <YAxis yAxisId="right" orientation="right" />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value: any, name: any) =>
                name === "Revenue"
                  ? formatCurrency(Number(value ?? 0))
                  : Number(value ?? 0).toLocaleString()
              }
            />
          }
        />

        <Legend />
        <Bar
          yAxisId="left"
          dataKey="revenue"
          fill="hsl(var(--primary))"
          name="Revenue"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="orders"
          stroke="hsl(var(--chart-2))"
          strokeWidth={3}
          name="Orders"
        />
      </BarChart>
    </ChartContainer>
  );
};

export default SalesOverTimeChart;
