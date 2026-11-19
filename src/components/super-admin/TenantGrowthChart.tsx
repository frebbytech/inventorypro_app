"use client";

import React from "react";
import { Building2, TrendingUp } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { TenantGrowthPoint } from "@/types/super-admin";

interface TenantGrowthChartProps {
  data: TenantGrowthPoint[];
}

const chartConfig = {
  newTenants: {
    label: "New Businesses",
    theme: {
      light: "#003194",
      dark: "#60a5fa",
    },
  },
  cumulativeTenants: {
    label: "Total Businesses",
    theme: {
      light: "#059669",
      dark: "#34d399",
    },
  },
} satisfies ChartConfig;

export default function TenantGrowthChart({ data }: TenantGrowthChartProps) {
  const newLastSixMonths = data.reduce((sum, pt) => sum + pt.newTenants, 0);
  const latestPoint = data[data.length - 1];
  const dateRangeLabel =
    data.length >= 2
      ? `${data[0].monthLabel} – ${data[data.length - 1].monthLabel}`
      : latestPoint?.monthLabel || "Last 6 Months";

  return (
    <section
      aria-label="Tenant Growth Over Last 6 Months"
      className="rounded-lg border border-border bg-card p-5"
    >
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Tenant Growth (Last 6 Months)
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            New business workspaces provisioned each month and cumulative platform total
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs">
          <div>
            <span className="text-muted-foreground">6-Mo New Signups</span>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-foreground">
              +{newLastSixMonths}
            </p>
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <div>
            <span className="text-muted-foreground">
              {latestPoint ? `${latestPoint.shortMonth} New` : "This Month"}
            </span>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-foreground">
              {latestPoint?.newTenants ?? 0}
            </p>
          </div>
        </div>
      </div>

      <div className="pt-4">
        {data.length === 0 ? (
          <div className="flex h-[240px] flex-col items-center justify-center text-center">
            <Building2 className="h-7 w-7 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium text-foreground">
              No tenant history available yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Monthly provisioning trends will appear once workspaces exist.
            </p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
            <ComposedChart
              accessibilityLayer
              data={data}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="monthLabel"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => String(value).split(" ")[0] ?? String(value)}
              />
              <YAxis
                yAxisId="new"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <YAxis
                yAxisId="total"
                orientation="right"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Bar
                yAxisId="new"
                dataKey="newTenants"
                fill="var(--color-newTenants)"
                radius={[4, 4, 0, 0]}
                maxBarSize={42}
              />
              <Line
                yAxisId="total"
                type="monotone"
                dataKey="cumulativeTenants"
                stroke="var(--color-cumulativeTenants)"
                strokeWidth={2}
                dot={{ r: 3.5, strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#003194] dark:bg-[#60a5fa]" />
            <span>New Businesses (Left Axis)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 rounded-full bg-[#059669] dark:bg-[#34d399]" />
            <span>Total Cumulative Tenants (Right Axis)</span>
          </div>
        </div>
        <span className="font-mono tabular-nums">{dateRangeLabel}</span>
      </div>
    </section>
  );
}
