import React from "react";
import { getCurrentUser } from "@/actions/_actions";
import {
  AdminDashboardFullData,
  ActivityHeatmapData,
  // getComprehensiveAdminDashboardData,
} from "@/actions/dashboard";
import { TotalCounts } from "@/types/globals";
import { AdminDashboardView } from "@/components/admin/dashboard/AdminDashboardView";

interface DashboardClientProps {
  fullData?: AdminDashboardFullData | null;
  stats?: {
    revenue: number;
    orders: number;
    aov: number;
    lowStockCount: number;
    unreadNotifications: number;
  } | null;
  salesOverTime?: { date: string; revenue: number; orders: number }[];
  topProducts?: {
    id: string;
    name: string;
    revenue: number;
    quantity: number;
  }[];
  revenueByCategory?: { category: string; revenue: number }[];
  stockAlerts?: { id: string; name: string; stock: number }[];
  activityHeatmap?: ActivityHeatmapData | null;
  data?: TotalCounts;
  errors?: Record<string, string | null>;
}

export default async function OverViewPage(props: DashboardClientProps) {
  const user = await getCurrentUser();
  const userName = user?.firstname || user?.username || "Administrator";
  const userRole = user?.role || "Admin";

  // If fullData is passed, use it directly. Otherwise fetch comprehensive dataset
  let dashboardData = props.fullData;

  // if (!dashboardData) {
  //   const res = await getComprehensiveAdminDashboardData();

  //   if (!res.success) {
  //     return;
  //   }

  //   if (res.success && res.data) {
  //     dashboardData = res.data;
  //   }
  // }

  // Fallback data structure if query fails
  if (!dashboardData) {
    const fallbackMetrics = {
      totalRevenueAllTime: Number(props.data?.totalSalesAmount) || 0,
      totalOrdersAllTime: props.stats?.orders || 0,
      totalUnitsSoldAllTime: 0,
      allTimeAov: props.stats?.aov || 0,
      todayRevenue: props.stats?.revenue || Number(props.data?.todaySales) || 0,
      todayOrders: props.stats?.orders || 0,
      todayAov: props.stats?.aov || 0,
      yesterdayRevenue: 0,
      yesterdayOrders: 0,
      todayVsYesterdayRevenueDelta: 0,
      todayVsYesterdayOrdersDelta: 0,
      thisMonthRevenue: Number(props.data?.thisMonthSales) || 0,
      thisMonthOrders: 0,
      lastMonthRevenue: 0,
      lastMonthOrders: 0,
      thisMonthVsLastMonthRevenueDelta: 0,
      totalProductsCount: Number(props.data?.products) || 0,
      totalInventoryValuation: 0,
      totalStockUnits: 0,
      outOfStockCount: 0,
      lowStockCount:
        props.stats?.lowStockCount || props.data?.lowStockCount || 0,
      totalCustomersCount: 0,
      totalSuppliersCount: Number(props.data?.suppliers) || 0,
      totalUsersCount: Number(props.data?.users) || 0,
      adminUsersCount: 1,
      cashierUsersCount: Math.max(0, (Number(props.data?.users) || 1) - 1),
      unreadNotifications:
        props.stats?.unreadNotifications ||
        props.data?.unreadNotifications ||
        0,
    };

    dashboardData = {
      metrics: fallbackMetrics,
      salesOverTime7d: props.salesOverTime || [],
      salesOverTime14d: props.salesOverTime || [],
      salesOverTime30d: props.salesOverTime || [],
      topProductsByRevenue: (props.topProducts || []).map((p) => ({
        id: p.id,
        name: p.name,
        categoryName: "General",
        revenue: p.revenue,
        quantity: p.quantity,
        sellingPrice: 0,
        percentageOfTotal: 0,
      })),
      topProductsByQuantity: (props.topProducts || []).map((p) => ({
        id: p.id,
        name: p.name,
        categoryName: "General",
        revenue: p.revenue,
        quantity: p.quantity,
        sellingPrice: 0,
        percentageOfTotal: 0,
      })),
      revenueByCategory: (props.revenueByCategory || []).map((c) => ({
        category: c.category,
        revenue: c.revenue,
        percentage: 0,
        itemCount: 0,
      })),
      totalMonthlySales: props.data?.totalMonthlySales || [],
      recentTransactions: (props.data?.topFiveRecentSales || []).map(
        (s: any) => ({
          id: s.id,
          receiptNo: `REC-${s.id?.slice(0, 6)}`,
          customerName: s.customer_name || "Walk-in Customer",
          cashierName: s.user_name || "Cashier",
          saleDate:
            typeof s.sale_date === "string"
              ? s.sale_date
              : s.sale_date?.toISOString(),
          totalAmount: Number(s.total_amount) || 0,
          amountPaid: Number(s.total_amount) || 0,
          discount: 0,
          tax: 0,
          paymentMode: s.payment_mode || "Cash",
          status: s.status || "completed",
          itemCount: s.item_count || 1,
        }),
      ),
      stockAlerts: (props.stockAlerts || []).map((a) => ({
        id: a.id,
        name: a.name,
        categoryName: "General",
        stock: a.stock,
        buyingPrice: 0,
        sellingPrice: 0,
        severity: a.stock <= 0 ? "critical" : "warning",
      })),
      recentActivity: [],
      activityHeatmap: props.activityHeatmap || null,
      serverTime: new Date().toISOString(),
    };
  }

  return (
    <AdminDashboardView
      data={dashboardData}
      userName={userName}
      userRole={userRole}
    />
  );
}
