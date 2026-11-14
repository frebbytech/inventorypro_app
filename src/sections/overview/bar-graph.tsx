"use client";

import { TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/currency";

const chartConfig = {
  value: {
    label: "Amount",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

type BarGraphProps = {
  data: {
    month: string;
    value: number;
  }[];
};

export function BarGraph({ data = [] }: BarGraphProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Total Monthly Sales (GHS)</CardTitle>
        <CardDescription>
          January - December {new Date().getFullYear()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Fixed: Removed ResponsiveContainer and set height class on ChartContainer */}
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value?.slice(0, 3)}
            />
            {/* Fixed: Removed mismatched yAxisId or ensure it matches the Bar component */}
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              tickFormatter={(value) => formatCurrency(value)}
           
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value) => (
                    <span className="font-mono font-medium">
                      {formatCurrency(Number(value))}
                    </span>
                  )}
                />
              }
            />

            {/* Fixed: Used config color mapping and removed missing yAxisId link */}
            <Bar
              dataKey="value"
              fill="var(--color-value)"
              radius={[4, 4, 0, 0]}
            />
             <Legend />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 font-medium leading-none">
          Trending this Year <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Showing details of monthly sales
        </div>
      </CardFooter>
    </Card>
  );
}
