"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import PageContainer from "@/components/layout/page-container";

// Section header skeleton
const SectionHeaderSkeleton = () => (
  <div className="space-y-1">
    <Skeleton className="h-7 w-48" />
    <Skeleton className="h-4 w-64" />
  </div>
);

export default function MemberDashboardSkeleton() {
  return (
    <PageContainer>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="pb-4 border-b">
          <Skeleton className="h-8 w-72 mb-2" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>

        {/* ── Key Metrics ── */}
        <section className="space-y-4">
          <SectionHeaderSkeleton />
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Total Sales Card */}
          <Card>
            <CardHeader className="flex flex-col md:flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-8 w-32" />
              </div>
              <div className="flex flex-row gap-4">
                <div className="flex flex-col items-center px-4 py-2 bg-muted/30 rounded-lg">
                  <Skeleton className="h-3 w-12 mb-1" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <div className="flex flex-col items-center px-4 py-2 bg-muted/30 rounded-lg">
                  <Skeleton className="h-3 w-12 mb-1" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Quick Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Sales Performance ── */}
        <section className="space-y-4">
          <SectionHeaderSkeleton />
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full flex items-end justify-around gap-2 p-4">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-20 w-10 rounded-t-md"
                    style={{ height: `${20 + Math.random() * 60}%` }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-40" />
                </CardHeader>
                <CardContent>
                  <div className="flex justify-center">
                    <Skeleton className="h-[200px] w-[200px] rounded-full" />
                  </div>
                  <div className="flex justify-center gap-4 mt-4">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <Skeleton key={j} className="h-3 w-16" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full flex items-end justify-around gap-2 p-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-10 w-8 rounded-t-md"
                    style={{ height: `${20 + Math.random() * 50}%` }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Product & Inventory Insights ── */}
        <section className="space-y-4">
          <SectionHeaderSkeleton />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div
                        key={j}
                        className="flex justify-between items-center"
                      >
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-12" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
}
