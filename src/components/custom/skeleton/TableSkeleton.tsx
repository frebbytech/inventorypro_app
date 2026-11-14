import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

const cellStyle: React.CSSProperties = {
  height: 20,
  borderRadius: 4,
  backgroundColor: "#e2e8f0",
};

const headerStyle: React.CSSProperties = {
  ...cellStyle,
  height: 18,
  marginBottom: 8,
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 16,
  padding: "12px 0",
  borderBottom: "1px solid #cbd5e1",
};

const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  columns = 5,
  className = "",
}) => {
  const headers = Array.from({ length: columns });
  const rowCells = Array.from({ length: columns });

  return (
    //    {/* Main Content Card */}
    <Card className="border-muted/40 shadow-sm overflow-hidden">
      <CardHeader className="border-b border-muted/30 bg-muted/5/30 px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40 rounded-md bg-muted/60" />
            <Skeleton className="h-4 w-64 rounded-md bg-muted/40" />
          </div>
          {/* Action Button Skeleton */}
          <Skeleton className="h-9 w-28 rounded-md bg-muted/60 shrink-0 self-start sm:self-auto" />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="w-full overflow-x-auto">
          {/* Semantic Grid Table */}
          <div className="min-w-[600px] divide-y divide-muted/20">
            {/* Table Header */}
            <div className="grid grid-cols-4 gap-6 px-6 py-4 bg-muted/10 items-center">
              <Skeleton className="h-4 w-20 bg-muted/60" />
              <Skeleton className="h-4 w-28 bg-muted/60" />
              <Skeleton className="h-4 w-16 bg-muted/60" />
              <div className="flex justify-end">
                <Skeleton className="h-4 w-24 bg-muted/60" />
              </div>
            </div>

            {/* Table Body Rows */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-4 gap-6 px-6 py-4 items-center hover:bg-muted/5 transition-colors"
              >
                {/* Subtle width variation creates a more realistic data layout */}
                <Skeleton
                  className={`h-4 rounded bg-muted/40 ${i % 2 === 0 ? "w-24" : "w-20"}`}
                />
                <Skeleton
                  className={`h-4 rounded bg-muted/40 ${i % 3 === 0 ? "w-36" : "w-28"}`}
                />
                <Skeleton
                  className={`h-4 rounded bg-muted/40 ${i % 2 === 0 ? "w-16" : "w-12"}`}
                />
                <div className="flex justify-end items-center gap-3">
                  <Skeleton className="h-4 w-20 rounded bg-muted/40" />
                  <Skeleton className="h-8 w-8 rounded-full bg-muted/50 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TableSkeleton;
