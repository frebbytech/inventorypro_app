import PageContainer from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProductsCategoriesSkeleton() {
  return (
    <PageContainer>
      (#090E1A)
      <div className="w-full min-h-screen bg-slate-50 dark:bg-[#090E1A] text-slate-800 dark:text-slate-200 p-8 space-y-6 transition-colors duration-200">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            {/* Main Title: Products Categories */}
            <Skeleton className="h-8 w-64 bg-slate-200 dark:bg-slate-800" />
            {/* Subtitle description */}
            <Skeleton className="h-4 w-96 max-w-full bg-slate-200 dark:bg-slate-800" />
          </div>

          {/* Right side Header Buttons (Bulk Import & Add Category) */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-44 bg-slate-200 dark:bg-slate-800 rounded-md" />
            <Skeleton className="h-10 w-36 bg-slate-200 dark:bg-slate-800 rounded-md" />
          </div>
        </div>

        {/* Main Container Card */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-white dark:bg-[#0B1324] space-y-6 shadow-sm dark:shadow-none">
          {/* Sub-header text: All Categories counter */}
          <div className="space-y-2">
            <Skeleton className="h-6 w-32 bg-slate-200 dark:bg-slate-800" />
            <Skeleton className="h-4 w-20 bg-slate-200 dark:bg-slate-800" />
          </div>

          {/* Filter Controls: Search Input & View Toggles */}
          <div className="flex items-center justify-between gap-4">
            {/* Search Input Box */}
            <Skeleton className="h-10 w-full max-w-md bg-slate-200 dark:bg-slate-800 rounded-md" />
            {/* View Toggles (Table / Grid) */}
            <div className="flex gap-2">
              <Skeleton className="h-10 w-16 bg-slate-200 dark:bg-slate-800 rounded-md" />
              <Skeleton className="h-10 w-16 bg-slate-200 dark:bg-slate-800 rounded-md" />
            </div>
          </div>

          {/* Categories Table Simulation */}
          <div className="rounded-md border border-slate-200 dark:border-slate-800/60 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0E172A]">
              <div className="col-span-3">
                <Skeleton className="h-4 w-16 bg-slate-300 dark:bg-slate-700" />
              </div>
              <div className="col-span-4">
                <Skeleton className="h-4 w-24 bg-slate-300 dark:bg-slate-700" />
              </div>
              <div className="col-span-3">
                <Skeleton className="h-4 w-16 bg-slate-300 dark:bg-slate-700" />
              </div>
              <div className="col-span-2 text-right flex justify-end">
                <Skeleton className="h-4 w-14 bg-slate-300 dark:bg-slate-700" />
              </div>
            </div>

            {/* Table Rows (Generates 8 rows matching the image pagination default) */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-4 p-4 items-center"
                >
                  {/* Name Column */}
                  <div className="col-span-3">
                    <Skeleton className="h-5 w-36 bg-slate-200 dark:bg-slate-800" />
                  </div>
                  {/* Description Column */}
                  <div className="col-span-4">
                    <Skeleton className="h-4 w-52 max-w-full bg-slate-200 dark:bg-slate-800" />
                  </div>
                  {/* Created Date Column */}
                  <div className="col-span-3">
                    <Skeleton className="h-4 w-24 bg-slate-200 dark:bg-slate-800" />
                  </div>
                  {/* Actions Column (Edit/Delete Button Icons) */}
                  <div className="col-span-2 flex justify-end gap-2">
                    <Skeleton className="h-8 w-8 bg-slate-200 dark:bg-slate-800 rounded-md" />
                    <Skeleton className="h-8 w-8 bg-slate-200 dark:bg-slate-800 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            {/* Page Counter Stats */}
            <Skeleton className="h-4 w-48 bg-slate-200 dark:bg-slate-800" />

            {/* Pagination control buttons */}
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
