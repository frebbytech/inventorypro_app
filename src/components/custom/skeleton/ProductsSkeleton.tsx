import PageContainer from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProductsSkeleton() {
  return (
    <PageContainer>
      <div className="w-full min-h-screen bg-slate-50 dark:bg-[#090E1A] text-slate-800 dark:text-slate-200 p-8 space-y-6 transition-colors duration-200">
        {/* 1. MAIN HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            {/* Page Title: Products (Count) */}
            <Skeleton className="h-8 w-56 bg-slate-200 dark:bg-slate-800" />
            {/* Context subtext explanation */}
            <Skeleton className="h-4 w-96 max-w-full bg-slate-200 dark:bg-slate-800" />
          </div>

          {/* Header Action Buttons (Bulk Import & Add Product) */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-44 bg-slate-200 dark:bg-slate-800 rounded-md" />
            <Skeleton className="h-10 w-36 bg-slate-200 dark:bg-slate-800 rounded-md" />
          </div>
        </div>

        {/* 2. ANALYTICS METRIC CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#0B1324] space-y-4 shadow-sm dark:shadow-none"
            >
              <div className="flex justify-between items-center">
                {/* Metric Label Text */}
                <Skeleton className="h-4 w-28 bg-slate-200 dark:bg-slate-800" />
                {/* Unit Currency Label or Alert Icon */}
                <Skeleton className="h-4 w-8 bg-slate-200 dark:bg-slate-800" />
              </div>
              {/* Primary Quantitative Value Display */}
              <Skeleton className="h-8 w-36 bg-slate-300 dark:bg-slate-700" />
            </div>
          ))}
        </div>

        {/* 3. MAIN TABLE & CONTROLS CONTAINER */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-white dark:bg-[#0B1324] space-y-6 shadow-sm dark:shadow-none">
          {/* Table Toolbar Actions */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Left: Input Filters */}
            <div className="flex flex-wrap items-center gap-3 flex-1 max-w-xl">
              <Skeleton className="h-10 flex-1 min-w-[200px] bg-slate-200 dark:bg-slate-800 rounded-md" />
              <Skeleton className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-md" />
            </div>
            {/* Right: Interface Display Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-10 w-24 bg-slate-200 dark:bg-slate-800 rounded-md" />
              <Skeleton className="h-10 w-16 bg-slate-200 dark:bg-slate-800 rounded-md" />
              <Skeleton className="h-10 w-16 bg-slate-200 dark:bg-slate-800 rounded-md" />
              <Skeleton className="h-10 w-24 bg-slate-200 dark:bg-slate-800 rounded-md" />
              <Skeleton className="h-10 w-24 bg-slate-200 dark:bg-slate-800 rounded-md" />
            </div>
          </div>

          {/* 4. HIGH-DENSITY INVENTORY TABLE SIMULATION */}
          <div className="rounded-md border border-slate-200 dark:border-slate-800/60 overflow-x-auto">
            <div className="min-w-[1100px]">
              {/* Expanded Table Column Headers */}
              <div className="grid grid-cols-12 gap-2 p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0E172A] items-center text-xs">
                <div className="col-span-1 flex items-center gap-2">
                  <Skeleton className="h-4 w-4 bg-slate-300 dark:bg-slate-700 rounded" />
                  <Skeleton className="h-3 w-10 bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="col-span-2">
                  <Skeleton className="h-3 w-16 bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="col-span-1.5">
                  <Skeleton className="h-3 w-16 bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="col-span-1">
                  <Skeleton className="h-3 w-12 bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="col-span-1">
                  <Skeleton className="h-3 w-12 bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="col-span-2.5">
                  <Skeleton className="h-3 w-20 bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="col-span-1">
                  <Skeleton className="h-3 w-10 bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="col-span-1">
                  <Skeleton className="h-3 w-16 bg-slate-300 dark:bg-slate-700" />
                </div>
                <div className="col-span-1 text-right flex justify-end">
                  <Skeleton className="h-3 w-12 bg-slate-300 dark:bg-slate-700" />
                </div>
              </div>

              {/* Generated Rows mirroring standard inventory density list */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-12 gap-2 p-4 items-center"
                  >
                    {/* Selection Checkbox & Thumbnail Placeholder */}
                    <div className="col-span-1 flex items-center gap-2">
                      <Skeleton className="h-4 w-4 bg-slate-200 dark:bg-slate-800 rounded" />
                      <Skeleton className="h-8 w-8 bg-slate-200 dark:bg-slate-800 rounded-md" />
                    </div>

                    {/* Product Title / Handler Identification */}
                    <div className="col-span-2">
                      <Skeleton className="h-4 w-32 bg-slate-200 dark:bg-slate-800" />
                    </div>

                    {/* Assigned Section Hierarchy Category */}
                    <div className="col-span-1.5">
                      <Skeleton className="h-4 w-24 bg-slate-200 dark:bg-slate-800" />
                    </div>

                    {/* Financial Breakdown Base Metrics */}
                    <div className="col-span-1">
                      <Skeleton className="h-4 w-8 bg-slate-200 dark:bg-slate-800" />
                    </div>
                    <div className="col-span-1">
                      <Skeleton className="h-4 w-10 bg-slate-200 dark:bg-slate-800" />
                    </div>

                    {/* Detail Body Log string blocks */}
                    <div className="col-span-2.5">
                      <Skeleton className="h-3.5 w-full bg-slate-200 dark:bg-slate-800" />
                    </div>

                    {/* Quantity Absolute Value Counter */}
                    <div className="col-span-1">
                      <Skeleton className="h-4 w-8 bg-slate-200 dark:bg-slate-800" />
                    </div>

                    {/* Stock Status Badge pill element */}
                    <div className="col-span-1">
                      <Skeleton className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded-full" />
                    </div>

                    {/* Actions Block / Context Dropdown wrapper */}
                    <div className="col-span-1 flex justify-end gap-2">
                      <Skeleton className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded-full" />
                      <Skeleton className="h-6 w-6 bg-slate-200 dark:bg-slate-800 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 5. FOOTER CONTROL SEGMENT */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <Skeleton className="h-4 w-44 bg-slate-200 dark:bg-slate-800" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-8 w-24 bg-slate-200 dark:bg-slate-800" />
              <Skeleton className="h-8 w-32 bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
