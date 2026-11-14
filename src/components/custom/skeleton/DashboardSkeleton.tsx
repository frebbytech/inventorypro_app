"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import PageContainer from "@/components/layout/page-container";

export default function DashboardSkeleton() {
  return (
    <PageContainer scrollable>
      <div className="space-y-6 pb-12 animate-in fade-in-50 duration-300">
        {/* ── 1. Executive Header Skeleton ── */}
        <div className="flex flex-col gap-4 rounded-xl border bg-card/60 p-4 sm:p-6 shadow-xs backdrop-blur-xs lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3.5">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-48 sm:w-64" />
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-52" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Skeleton className="h-8 w-36 rounded-md" />
            <Skeleton className="h-8 w-40 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>

        {/* ── 2. Primary Executive KPI Metrics Grid Skeleton (8 Cards) ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="border-border/60 bg-card/50 overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </CardHeader>
                <CardContent className="p-4 pt-1 space-y-3">
                  <div className="space-y-1">
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                    <Skeleton className="h-4 w-24 rounded-sm" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ── 3. Navigation Tabs Bar Skeleton ── */}
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex gap-1.5 bg-muted/40 p-1 rounded-lg">
            <Skeleton className="h-7 w-32 rounded-md" />
            <Skeleton className="h-7 w-28 rounded-md" />
            <Skeleton className="h-7 w-32 rounded-md" />
            <Skeleton className="h-7 w-32 rounded-md" />
          </div>
        </div>

        {/* ── 4. Main Sales & Revenue Analytics Card Skeleton ── */}
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="p-5 pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-4 w-16 rounded-md" />
                </div>
                <Skeleton className="h-3.5 w-64" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-36 rounded-md" />
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            </div>

            {/* Quick Metrics Ribbon Skeleton */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="rounded-lg border border-border/50 bg-background/50 p-3 space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {/* Chart Canvas Area Skeleton */}
            <div className="h-[280px] w-full rounded-xl border border-dashed border-border/50 bg-muted/10 p-4 flex flex-col justify-between">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex items-end justify-between gap-2 h-44 px-2">
                {Array.from({ length: 14 }).map((_, barIdx) => (
                  <div key={barIdx} className="flex-1 flex flex-col items-center gap-1.5">
                    <Skeleton
                      className="w-full rounded-t-sm"
                      style={{ height: `${25 + (barIdx * 17) % 65}%` }}
                    />
                    <Skeleton className="h-2 w-4" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── 5. Secondary Analytics Grid (Category Breakdown & Monthly Trajectory) ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Revenue by Category Skeleton */}
          <Card className="lg:col-span-5 border-border/60 bg-card/50">
            <CardHeader className="p-5 pb-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-56" />
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4">
              <div className="flex items-center justify-center py-4">
                <Skeleton className="h-44 w-44 rounded-full border-8 border-muted/30" />
              </div>
              <div className="space-y-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <Skeleton className="h-3 w-3 rounded-full" />
                      <Skeleton className="h-3.5 w-24" />
                    </div>
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Monthly Trajectory Skeleton */}
          <Card className="lg:col-span-7 border-border/60 bg-card/50">
            <CardHeader className="p-5 pb-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3.5 w-60" />
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="h-[260px] w-full flex items-end justify-between gap-2 p-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <Skeleton
                      className="w-full rounded-t-sm"
                      style={{ height: `${20 + ((i + 1) * 23) % 70}%` }}
                    />
                    <Skeleton className="h-2 w-4" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── 6. Leaderboard Skeleton ── */}
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="p-5 pb-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-64" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── 7. Two-Column Operational Grid Skeleton (Recent Transactions & Alerts) ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Recent Transactions Table Skeleton */}
          <Card className="lg:col-span-8 border-border/60 bg-card/50">
            <CardHeader className="p-5 pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3.5 w-56" />
                </div>
                <Skeleton className="h-8 w-48 rounded-md" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/30 p-3 border-b flex justify-between">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="divide-y">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div key={idx} className="p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Column: Stock Alerts & Activity Stream Skeleton */}
          <div className="space-y-6 lg:col-span-4">
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-44" />
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-5 w-16 rounded-md" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/50">
              <CardHeader className="p-5 pb-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3.5 w-44" />
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="flex gap-3 items-start">
                    <Skeleton className="h-2 w-2 rounded-full mt-2 shrink-0" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── 8. Operational Heatmap Skeleton ── */}
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="p-5 pb-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-64" />
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="h-36 w-full rounded-lg border border-dashed p-4 flex flex-col justify-between">
              {Array.from({ length: 7 }).map((_, rowIdx) => (
                <div key={rowIdx} className="flex gap-1">
                  <Skeleton className="h-3 w-8" />
                  <div className="flex-1 flex gap-1">
                    {Array.from({ length: 24 }).map((_, colIdx) => (
                      <Skeleton key={colIdx} className="h-3 flex-1 rounded-xs" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

