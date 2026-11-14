
import { getComprehensiveAdminDashboardData } from "@/actions/dashboard";
import DashboardSkeleton from "@/components/custom/skeleton/DashboardSkeleton";
import { getPageMetadata } from "@/lib/metadata";
import { OverViewPageView } from "@/sections/overview/view";
import { Metadata } from "next";
import { Suspense } from "react";

// Explicitly force dynamic rendering
export const dynamic = "force-dynamic";

export const metadata: Metadata = getPageMetadata("/admin");

// Parallel async fetching inside Suspense boundary
async function DashboardContent() {
  const result = await getComprehensiveAdminDashboardData();

  return (
    <OverViewPageView
      fullData={result.success ? result.data : null}
      errors={{
        dashboard: result.success ? null : result.message,
      }}
    />
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}


// import {
//   getDashboardStats,
//   getSalesOverTime,
//   getTopProducts,
//   getRevenueByCategory,
//   getStockAlerts,
//   getActivityHeatmapData,
// } from "@/actions/dashboard";
// import { getSalesSummary } from "@/actions/summary";
// import DashboardSkeleton from "@/components/custom/skeleton/DashboardSkeleton";
// import { getPageMetadata } from "@/lib/metadata";
// import { OverViewPageView } from "@/sections/overview/view";
// import { Metadata } from "next";
// import { Suspense } from "react";

// export const dynamic = "force-dynamic";

// export const metadata: Metadata = getPageMetadata("/admin");

// // Fix 2: Move parallel async fetching into a nested component so Suspense works
// async function DashboardContent() {
//   const [
//     statsResult,
//     salesOverTimeResult,
//     topProductsResult,
//     revenueByCategoryResult,
//     activityHeatmapResult,
//     stockAlertsResult,
//     data,
//   ] = await Promise.all([
//     getDashboardStats(),
//     getSalesOverTime(7),
//     getTopProducts(5),
//     getRevenueByCategory(),
//     getActivityHeatmapData(30),
//     getStockAlerts(5),
//     getSalesSummary(),
//   ]);

//   return (
//     <OverViewPageView
//       stats={statsResult.success ? statsResult.data : null}
//       salesOverTime={
//         salesOverTimeResult.success ? salesOverTimeResult.data : []
//       }
//       topProducts={topProductsResult.success ? topProductsResult.data : []}
//       revenueByCategory={
//         revenueByCategoryResult.success ? revenueByCategoryResult.data : []
//       }
//       stockAlerts={stockAlertsResult.success ? stockAlertsResult.data : []}
//       activityHeatmap={
//         activityHeatmapResult.success ? activityHeatmapResult.data : null
//       }
//       data={data}
//       errors={{
//         stats: statsResult.success ? null : statsResult.message,
//         salesOverTime: salesOverTimeResult.success
//           ? null
//           : salesOverTimeResult.message,
//         topProducts: topProductsResult.success
//           ? null
//           : topProductsResult.message,
//         revenueByCategory: revenueByCategoryResult.success
//           ? null
//           : revenueByCategoryResult.message,
//         stockAlerts: stockAlertsResult.success
//           ? null
//           : stockAlertsResult.message,

//         activityHeatmap: activityHeatmapResult.success
//           ? null
//           : activityHeatmapResult.message,
//       }}
//     />
//   );
// }

// export default function DashboardPage() {
//   return (
//     <Suspense fallback={<DashboardSkeleton />}>
//       <DashboardContent />
//     </Suspense>
//   );
// }
