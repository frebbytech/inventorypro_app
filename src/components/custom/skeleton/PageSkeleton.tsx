import PageContainer from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton"

export default function PageSkeleton() {
  return (
    <PageContainer>

    
    <div className="w-full min-h-screen bg-slate-50 dark:bg-[#090E1A] text-slate-800 dark:text-slate-200 p-8 space-y-6 transition-colors duration-200">
      
      {/* 1. TOP HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          {/* Main Title: Suppliers (0) */}
          <Skeleton className="h-8 w-48 bg-slate-200 dark:bg-slate-800" />
          {/* Context descriptive subtitle */}
          <Skeleton className="h-4 w-[450px] max-w-full bg-slate-200 dark:bg-slate-800" />
        </div>
        
        {/* Right side Action Button: Add Supplier */}
        <div className="flex items-center justify-end">
          <Skeleton className="h-10 w-36 bg-slate-200 dark:bg-slate-800 rounded-md" />
        </div>
      </div>

      {/* 2. TABLE WRAPPER CONTAINER CARD */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-white dark:bg-[#0B1324] space-y-6 shadow-sm dark:shadow-none">
        
        {/* Table Toolbar Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Search Filter Input Box */}
          <Skeleton className="h-10 w-full max-w-xs bg-slate-200 dark:bg-slate-800 rounded-md" />
          
          {/* Interface Control Buttons Layout (Columns, Export, Refresh) */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Skeleton className="h-10 w-24 bg-slate-200 dark:bg-slate-800 rounded-md" />
            <Skeleton className="h-10 w-24 bg-slate-200 dark:bg-slate-800 rounded-md" />
            <Skeleton className="h-10 w-20 bg-slate-200 dark:bg-slate-800 rounded-md" />
          </div>
        </div>

        {/* 3. SIMULATED TABLE MATRIX WITH CENTRAL EMPTY STATE BANNER */}
        <div className="rounded-md border border-slate-200 dark:border-slate-800/60 overflow-x-auto">
          <div className="min-w-[800px]">
            
            {/* Table Header Row */}
            <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0E172A] items-center">
              <div className="col-span-1 flex items-center">
                <Skeleton className="h-4 w-4 bg-slate-300 dark:bg-slate-700 rounded" />
              </div>
              <div className="col-span-3"><Skeleton className="h-3.5 w-16 bg-slate-300 dark:bg-slate-700" /></div>
              <div className="col-span-3"><Skeleton className="h-3.5 w-20 bg-slate-300 dark:bg-slate-700" /></div>
              <div className="col-span-3"><Skeleton className="h-3.5 w-20 bg-slate-300 dark:bg-slate-700" /></div>
              <div className="col-span-2"><Skeleton className="h-3.5 w-24 bg-slate-300 dark:bg-slate-700" /></div>
            </div>

            {/* Central "No records found" Empty View Placeholder Area */}
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              {/* Central Stacked Layers Graphic / Box Icon */}
              <Skeleton className="h-12 w-12 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
              
              {/* Bold Title Message: "No records found" */}
              <Skeleton className="h-5 w-36 bg-slate-200 dark:bg-slate-800" />
              
              {/* Small descriptive secondary block lines */}
              <div className="flex flex-col items-center space-y-2">
                <Skeleton className="h-3.5 w-72 max-w-xs bg-slate-200 dark:bg-slate-800" />
                <Skeleton className="h-3.5 w-40 max-w-xs bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>

          </div>
        </div>

        {/* 4. FOOTER PAGINATION SEGMENT */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/40">
          {/* Entries status counter label */}
          <Skeleton className="h-4 w-20 bg-slate-200 dark:bg-slate-800" />
          
          {/* Page row selectors and jump action pagination buttons */}
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-24 bg-slate-200 dark:bg-slate-800" />
            <Skeleton className="h-8 w-44 bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>

      </div>
    </div>
    </PageContainer>
  )
}
