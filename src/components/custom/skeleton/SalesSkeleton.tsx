import { Skeleton } from "@/components/ui/skeleton";

export default function SalesSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 rounded-md bg-card/70 animate-pulse md:flex-row md:h-[calc(100vh-220px)] md:min-h-[600px]">
      {/* Product Listing Area Skeleton */}
      <div className="w-full h-[500px] md:h-full md:w-[55%] flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-9 w-1/3" />
          <Skeleton className="h-9 w-1/4" />
        </div>
        <div className="grid grid-cols-2 gap-4 flex-1">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-full w-full rounded-lg" />
          ))}
        </div>
      </div>
      
      {/* Divider line representation */}
      <div className="hidden md:block w-[1px] bg-border self-stretch" />

      {/* Cart Summary Area Skeleton */}
      <div className="w-full h-[400px] md:h-full md:w-[45%] flex flex-col gap-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    </div>
  );
}
