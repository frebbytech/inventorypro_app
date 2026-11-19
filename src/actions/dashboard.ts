"use server";

import db from "@/db/knex";
import { Result } from "@/types/globals";
import {
  format,
  subDays,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";
import T from "lodash/fp/T";
import { getCurrentUser } from "./_actions";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { checkRole } from "@/utils/roles";

export interface AdminKpiMetrics {
  totalRevenueAllTime: number;
  totalOrdersAllTime: number;
  totalUnitsSoldAllTime: number;
  allTimeAov: number;

  todayRevenue: number;
  todayOrders: number;
  todayAov: number;
  yesterdayRevenue: number;
  yesterdayOrders: number;
  todayVsYesterdayRevenueDelta: number; // percentage change
  todayVsYesterdayOrdersDelta: number; // percentage change

  thisMonthRevenue: number;
  thisMonthOrders: number;
  lastMonthRevenue: number;
  lastMonthOrders: number;
  thisMonthVsLastMonthRevenueDelta: number; // percentage change

  totalProductsCount: number;
  totalInventoryValuation: number;
  totalStockUnits: number;
  outOfStockCount: number;
  lowStockCount: number;

  totalCustomersCount: number;
  totalSuppliersCount: number;
  totalUsersCount: number;
  adminUsersCount: number;
  cashierUsersCount: number;

  unreadNotifications: number;
}

export interface AdminDetailedTransaction {
  id: string;
  receiptNo: string;
  customerName: string;
  customerPhone?: string;
  cashierName: string;
  saleDate: string;
  totalAmount: number;
  amountPaid: number;
  discount: number;
  tax: number;
  paymentMode: string;
  status: string;
  itemCount: number;
}

export interface AdminDetailedStockAlert {
  id: string;
  name: string;
  categoryName: string;
  stock: number;
  buyingPrice: number;
  sellingPrice: number;
  severity: "critical" | "warning" | "healthy";
}

export interface AdminActivityItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  userName?: string;
  createdAt: string;
  severity: "info" | "success" | "warning" | "critical";
}

export interface AdminCategoryRevenue {
  category: string;
  revenue: number;
  percentage: number;
  itemCount: number;
}

export interface AdminTopProduct {
  id: string;
  name: string;
  categoryName: string;
  revenue: number;
  quantity: number;
  sellingPrice: number;
  percentageOfTotal: number;
}

export interface AdminDashboardFullData {
  metrics: AdminKpiMetrics;
  salesOverTime7d: { date: string; revenue: number; orders: number }[];
  salesOverTime14d: { date: string; revenue: number; orders: number }[];
  salesOverTime30d: { date: string; revenue: number; orders: number }[];
  topProductsByRevenue: AdminTopProduct[];
  topProductsByQuantity: AdminTopProduct[];
  revenueByCategory: AdminCategoryRevenue[];
  totalMonthlySales: { month: string; value: number }[];
  recentTransactions: AdminDetailedTransaction[];
  stockAlerts: AdminDetailedStockAlert[];
  recentActivity: AdminActivityItem[];
  activityHeatmap: ActivityHeatmapData | null;
  serverTime: string;
}

export interface HourlyActivityPoint {
  hour: number;
  hourLabel: string;
  timeSlot: string;
  salesCount: number;
  inventoryUpdates: number;
  totalActivity: number;
  salesRevenue: number;
}

export interface DayHourHeatmapCell {
  day: string;
  dayShort: string;
  dayIndex: number;
  hour: number;
  hourLabel: string;
  salesCount: number;
  inventoryUpdates: number;
  totalActivity: number;
  salesRevenue: number;
}

export interface ActivityHeatmapData {
  hourlyDistribution: HourlyActivityPoint[];
  dayHourMatrix: DayHourHeatmapCell[];
  summary: {
    peakSalesHour: string;
    peakSalesCount: number;
    peakInventoryHour: string;
    peakInventoryCount: number;
    busiestDay: string;
    busiestDayActivity: number;
    totalSalesEvents: number;
    totalInventoryEvents: number;
    totalCombinedActivity: number;
    totalSalesRevenue: number;
  };
}

// ──────────────────────────────────────────────────────────────
// 1. Main stats: revenue, orders, AOV, low stock, unread notifs
// ──────────────────────────────────────────────────────────────
export async function getDashboardStats(): Promise<
  Result<{
    revenue: number;
    orders: number;
    aov: number;
    lowStockCount: number;
    unreadNotifications: number;
  }>
> {
  try {
    

    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Not Authorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    // Revenue and orders for today
    const today = format(new Date(), "yyyy-MM-dd");
    const todayStats = await db("v_sale_summary")
      .where("tenant_id", tenantId)
      .andWhere("status", "completed")
      .andWhereRaw("DATE(sale_date) = ?", today)
      .first(
        db.raw(
          "COUNT(*) as orders, SUM(total_amount) as revenue, AVG(total_amount) as aov",
        ),
      );

    const revenue = Number(todayStats?.revenue) || 0;
    const orders = Number(todayStats?.orders) || 0;
    const aov = Number(todayStats?.aov) || 0;

    const lowStockCount = await db("products")
      .where("tenant_id", tenantId)
      .andWhere("stock_quantity", "<", 5)
      .count("id as count")
      .first()
      .then((r: any) => Number(r?.count) || 0);

    // Unread notifications for the current user
    const unreadNotifications = await db("notifications")
      .where("tenant_id", tenantId)
      .andWhere("user_id", currentUser?.id)
      .andWhere("is_read", false)
      .count("id as count")
      .first()
      .then((r: any) => Number(r?.count) || 0);

    return Result.ok({
      revenue,
      orders,
      aov,
      lowStockCount,
      unreadNotifications,
    });
  } catch (error: any) {
    console.error("Failed to fetch dashboard stats:", error);
    return Result.fail(error?.message || "Failed to fetch dashboard stats");
  }
}

// ──────────────────────────────────────────────────────────────
// 2. Sales over time (last N days)
// ──────────────────────────────────────────────────────────────

export async function getSalesOverTime(
  days: number = 7,
  tenantIdOverride?: string,
): Promise<Result<{ date: string; revenue: number; orders: number }[]>> {
  try {
    let tenantId = tenantIdOverride;
    if (!tenantId) {
      const currentUser = await getCurrentUser();
      if (!currentUser?.id) return Result.fail("Not Authorized");
      tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;
    }

    const now = new Date();
    const startDate = startOfDay(subDays(now, days - 1));
    const endDate = endOfDay(now);

    // 1. Fetch DB data — avoid wrapping sale_date in a function so SQLite
    //    can use an index on the column directly in WHERE/GROUP BY/ORDER BY
    const results = await db("v_sale_summary")
      .select(db.raw("date(sale_date) as date_str"))
      .sum({ revenue: "total_amount" })
      .count({ orders: "sale_id" })
      .where({ status: "completed", tenant_id: tenantId })
      .whereBetween("sale_date", [
        startDate.toISOString(),
        endDate.toISOString(),
      ])
      .groupByRaw("date(sale_date)")
      .orderByRaw("date(sale_date) ASC");

    // Convert results array to a lookup Map for O(1) access
    const dbMap = new Map<string, { revenue: number; orders: number }>(
      results.map((row: any) => [
        row.date_str,
        { revenue: Number(row.revenue) || 0, orders: Number(row.orders) || 0 },
      ]),
    );

    const salesForLastSevenDays: {
      date: string;
      revenue: number;
      orders: number;
    }[] = [];

    // 2. Generate final structure in a single, lightweight loop
    for (let i = 0; i < days; i++) {
      const currentDate = subDays(now, days - 1 - i);
      const isoKey = format(currentDate, "yyyy-MM-dd");
      const displayDate = format(currentDate, "MMM d");

      const dbMatch = dbMap.get(isoKey);

      salesForLastSevenDays.push({
        date: displayDate,
        revenue: dbMatch ? dbMatch.revenue : 0,
        orders: dbMatch ? dbMatch.orders : 0,
      });
    }

    return Result.ok(salesForLastSevenDays);
  } catch (error: any) {
    console.error("Failed to fetch sales over time:", error);

    return Result.fail(error?.message || "Failed to fetch sales over time");
  }
}

// ──────────────────────────────────────────────────────────────
// 3. Top products by revenue
// ──────────────────────────────────────────────────────────────
export async function getTopProducts(
  limit: number = 5,
): Promise<
  Result<{ id: string; name: string; revenue: number; quantity: number }[]>
> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Not Authorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const results = await db("sale_items as si")
      .join("products as p", "si.product_id", "p.id")
      .join("sales as s", "si.sales_id", "s.id")
      .select(
        "p.id",
        "p.name",
        db.raw("SUM(si.quantity * si.unit_price) as revenue"),
        db.raw("SUM(si.quantity) as quantity"),
      )
      .where("s.status", "completed")
      .andWhere("s.tenant_id", tenantId)
      .andWhere("p.tenant_id", tenantId)
      .groupBy("p.id", "p.name")
      .orderByRaw("revenue DESC")
      .limit(limit);

    const formatted = results.map((row: any) => ({
      id: row.id,
      name: row.name,
      revenue: Number(row.revenue) || 0,
      quantity: Number(row.quantity) || 0,
    }));

    return Result.ok(formatted);
  } catch (error: any) {
    console.error("Failed to fetch top products:", error);
    return Result.fail(error?.message || "Failed to fetch top products");
  }
}

// ──────────────────────────────────────────────────────────────
// 4. Revenue by category
// ──────────────────────────────────────────────────────────────
export async function getRevenueByCategory(): Promise<
  Result<{ category: string; revenue: number }[]>
> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Not Authorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const results = await db("sale_items as si")
      .join("products as p", "si.product_id", "p.id")
      .join("product_categories as c", "p.category_id", "c.id")
      .join("sales as s", "si.sales_id", "s.id")
      .select(
        "c.name as category",
        db.raw("SUM(si.quantity * si.unit_price) as revenue"),
      )
      .where("s.status", "completed")
      .andWhere("s.tenant_id", tenantId)
      .andWhere("p.tenant_id", tenantId)
      .groupBy("c.id", "c.name")
      .orderByRaw("revenue DESC");

    const formatted = results.map((row: any) => ({
      category: row.category,
      revenue: Number(row.revenue) || 0,
    }));

    return Result.ok(formatted);
  } catch (error: any) {
    console.error("Failed to fetch revenue by category:", error);
    return Result.fail(error?.message || "Failed to fetch revenue by category");
  }
}

// ──────────────────────────────────────────────────────────────
// 5. Recent sales (last N)
// ──────────────────────────────────────────────────────────────
// export async function getRecentSales(
//   limit: number = 10,
// ): Promise<
//   Result<{ id: string; customer: string; total: number; date: string }[]>
// > {
//   try {
//     const results = await db("v_sale_summary")
//       .select(
//         "sale_id as id",
//         "customer_name as customer",
//         "total_amount as total",
//         "sale_date as date",
//       )
//       .where("status", "completed")
//       .orderBy("sale_date", "desc")
//       .limit(limit);

//     const formatted = results.map((row: any) => ({
//       id: row.id,
//       customer: row.customer || "Guest",
//       total: Number(row.total) || 0,
//       date: format(new Date(row.date), "MMM d, yyyy h:mm a"),
//     }));

//     return Result.ok(formatted);
//   } catch (error: any) {
//     console.error("Failed to fetch recent sales:", error);
//     return Result.fail(error?.message || "Failed to fetch recent sales");
//   }
// }

// ──────────────────────────────────────────────────────────────
// 6. Stock alerts (products below threshold)
// ──────────────────────────────────────────────────────────────
export async function getStockAlerts(
  threshold: number = 5,
): Promise<Result<{ id: string; name: string; stock: number }[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Not Authorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const results = await db("products")
      .select("id", "name", "stock_quantity as stock")
      .where("tenant_id", tenantId)
      .andWhere("stock_quantity", "<", threshold)
      .orderBy("stock_quantity", "asc");

    return Result.ok(results);
  } catch (error: any) {
    console.error("Failed to fetch stock alerts:", error);
    return Result.fail(error?.message || "Failed to fetch stock alerts");
  }
}

// ──────────────────────────────────────────────────────────────
// 7. Top products by quantity sold (for pie chart)
// ──────────────────────────────────────────────────────────────
export async function getTopProductsByQuantity(
  limit: number = 10,
): Promise<Result<{ id: string; name: string; quantity: number }[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Not Authorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const results = await db("sale_items as si")
      .join("products as p", "si.product_id", "p.id")
      .join("sales as s", "si.sales_id", "s.id")
      .select("p.id", "p.name", db.raw("SUM(si.quantity) as quantity"))
      .where("s.status", "completed")
      .andWhere("s.tenant_id", tenantId)
      .andWhere("p.tenant_id", tenantId)
      .groupBy("p.id", "p.name")
      .orderByRaw("quantity DESC")
      .limit(limit);

    const formatted = results.map((row: any) => ({
      id: row.id,
      name: row.name,
      quantity: Number(row.quantity) || 0,
    }));

    return Result.ok(formatted);
  } catch (error) {
    console.error("Failed to fetch top products by quantity:", error);
    return Result.fail("Failed to fetch top products by quantity");
  }
}

// ──────────────────────────────────────────────────────────────
// 8. Activity Heatmap & Peak Hours (Last 30 Days)
// ──────────────────────────────────────────────────────────────

export async function getActivityHeatmapData(
  days: number = 30,
  tenantIdOverride?: string,
): Promise<Result<ActivityHeatmapData>> {
  try {
    let tenantId = tenantIdOverride;
    if (!tenantId) {
      const currentUser = await getCurrentUser();
      if (!currentUser?.id) return Result.fail("Not Authorized");
      tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;
    }

    const now = new Date();
    const startDate = startOfDay(subDays(now, days - 1));
    const endDate = endOfDay(now);

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // 1. Fetch Sales over the period
    let salesRows: any[] = [];
    try {
      salesRows = await db("v_sale_summary")
        .select("sale_id", "sale_date", "total_amount", "status")
        .where("tenant_id", tenantId)
        .andWhere("status", "completed")
        .andWhereBetween("sale_date", [startIso, endIso]);
    } catch {
      // Fallback to direct sales table if view is not accessible
      try {
        salesRows = await db("sales")
          .select(
            "id as sale_id",
            "created_at as sale_date",
            "total_amount",
            "status",
          )
          .where("tenant_id", tenantId)
          .andWhere("status", "completed")
          .andWhereBetween("created_at", [startIso, endIso]);
      } catch {
        salesRows = [];
      }
    }

    // 2. Fetch Inventory Updates & Restocks over the period
    let inventoryEventRows: any[] = [];
    try {
      const auditRows = await db("audit_logs")
        .select("id", "entity_type", "action", "created_at")
        .where("tenant_id", tenantId)
        .whereIn("entity_type", ["inventory", "products", "stocks"])
        .andWhereBetween("created_at", [startIso, endIso]);

      inventoryEventRows.push(...auditRows);
    } catch {
      // ignore
    }

    try {
      const invRecords = await db("inventory")
        .select("id", "updated_at", "created_at", "restock_date")
        .where("tenant_id", tenantId)
        .whereBetween("updated_at", [startIso, endIso]);

      inventoryEventRows.push(...invRecords);
    } catch {
      // ignore
    }

    // Days representation
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const fullDayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    // Helper for Hour Label
    const formatHourLabel = (h: number) => {
      if (h === 0) return "12 AM";
      if (h === 12) return "12 PM";
      return h < 12 ? `${h} AM` : `${h - 12} PM`;
    };

    const formatTimeSlot = (h: number) => {
      const start = String(h).padStart(2, "0") + ":00";
      const end = String((h + 1) % 24).padStart(2, "0") + ":00";
      return `${start} - ${end}`;
    };

    // Initialize 24-hour distribution map
    const hourlyMap = new Map<
      number,
      { salesCount: number; inventoryUpdates: number; salesRevenue: number }
    >();

    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { salesCount: 0, inventoryUpdates: 0, salesRevenue: 0 });
    }

    // Initialize 7-day x 24-hour matrix map: "dayIndex-hour" -> stats
    const dayHourMap = new Map<
      string,
      { salesCount: number; inventoryUpdates: number; salesRevenue: number }
    >();

    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        dayHourMap.set(`${d}-${h}`, {
          salesCount: 0,
          inventoryUpdates: 0,
          salesRevenue: 0,
        });
      }
    }

    // Aggregate Sales by Day and Hour
    let totalSalesRevenue = 0;
    let totalSalesEvents = 0;

    for (const sale of salesRows) {
      const dateVal = sale.sale_date || sale.created_at;
      if (!dateVal) continue;

      const dateObj = new Date(dateVal);
      if (isNaN(dateObj.getTime())) continue;

      const hour = dateObj.getHours();
      const dayIndex = dateObj.getDay();
      const amount = Number(sale.total_amount) || 0;

      totalSalesEvents++;
      totalSalesRevenue += amount;

      const hourEntry = hourlyMap.get(hour);
      if (hourEntry) {
        hourEntry.salesCount += 1;
        hourEntry.salesRevenue += amount;
      }

      const matrixEntry = dayHourMap.get(`${dayIndex}-${hour}`);
      if (matrixEntry) {
        matrixEntry.salesCount += 1;
        matrixEntry.salesRevenue += amount;
      }
    }

    // Aggregate Inventory Updates by Day and Hour
    let totalInventoryEvents = 0;

    for (const inv of inventoryEventRows) {
      const dateVal = inv.created_at || inv.updated_at || inv.restock_date;
      if (!dateVal) continue;

      const dateObj = new Date(dateVal);
      if (isNaN(dateObj.getTime())) continue;

      const hour = dateObj.getHours();
      const dayIndex = dateObj.getDay();

      totalInventoryEvents++;

      const hourEntry = hourlyMap.get(hour);
      if (hourEntry) {
        hourEntry.inventoryUpdates += 1;
      }

      const matrixEntry = dayHourMap.get(`${dayIndex}-${hour}`);
      if (matrixEntry) {
        matrixEntry.inventoryUpdates += 1;
      }
    }

    // Build hourlyDistribution array
    const hourlyDistribution: HourlyActivityPoint[] = [];
    let maxSalesHour = 0;
    let maxSalesCount = 0;
    let maxInvHour = 0;
    let maxInvCount = 0;

    for (let h = 0; h < 24; h++) {
      const entry = hourlyMap.get(h)!;
      const totalActivity = entry.salesCount + entry.inventoryUpdates;

      if (entry.salesCount > maxSalesCount) {
        maxSalesCount = entry.salesCount;
        maxSalesHour = h;
      }

      if (entry.inventoryUpdates > maxInvCount) {
        maxInvCount = entry.inventoryUpdates;
        maxInvHour = h;
      }

      hourlyDistribution.push({
        hour: h,
        hourLabel: formatHourLabel(h),
        timeSlot: formatTimeSlot(h),
        salesCount: entry.salesCount,
        inventoryUpdates: entry.inventoryUpdates,
        totalActivity,
        salesRevenue: entry.salesRevenue,
      });
    }

    // Build dayHourMatrix
    const dayHourMatrix: DayHourHeatmapCell[] = [];
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];

    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const entry = dayHourMap.get(`${d}-${h}`)!;
        const total = entry.salesCount + entry.inventoryUpdates;
        dayTotals[d] += total;

        dayHourMatrix.push({
          day: fullDayNames[d],
          dayShort: dayNames[d],
          dayIndex: d,
          hour: h,
          hourLabel: formatHourLabel(h),
          salesCount: entry.salesCount,
          inventoryUpdates: entry.inventoryUpdates,
          totalActivity: total,
          salesRevenue: entry.salesRevenue,
        });
      }
    }

    // Find busiest day
    let busiestDayIdx = 0;
    let busiestDayTotal = 0;
    for (let d = 0; d < 7; d++) {
      if (dayTotals[d] > busiestDayTotal) {
        busiestDayTotal = dayTotals[d];
        busiestDayIdx = d;
      }
    }

    return Result.ok({
      hourlyDistribution,
      dayHourMatrix,
      summary: {
        peakSalesHour: formatHourLabel(maxSalesHour),
        peakSalesCount: maxSalesCount,
        peakInventoryHour: formatHourLabel(maxInvHour),
        peakInventoryCount: maxInvCount,
        busiestDay: fullDayNames[busiestDayIdx],
        busiestDayActivity: busiestDayTotal,
        totalSalesEvents,
        totalInventoryEvents,
        totalCombinedActivity: totalSalesEvents + totalInventoryEvents,
        totalSalesRevenue,
      },
    });
  } catch (error: any) {
    console.error("Failed to fetch activity heatmap data:", error);
    return Result.fail(
      error?.message || "Failed to fetch activity heatmap data",
    );
  }
}

// ──────────────────────────────────────────────────────────────
// 9. Comprehensive Admin Dashboard Data Aggregation
// ──────────────────────────────────────────────────────────────

/**
 * Drop-in replacement for `getComprehensiveAdminDashboardData`.
 *
 * Paste this in place of the original function. It assumes the same
 * surrounding imports/types as your existing file (`db`, `Result`,
 * `getCurrentUser`, the `date-fns` helpers, `getSalesOverTime`,
 * `getActivityHeatmapData`, and the `Admin*` types). Two additions you'll
 * need to import if they aren't already in scope: `checkRole` from
 * "@/utils/roles" and `startOfMonth`/`endOfMonth`/`subMonths` from
 * "date-fns" (the last two were missing before, which is part of the
 * last-month bug below).
 *
 * If this lives in the same file as the employee-sales-summary action,
 * dedupe `dbBound` / `num` / `round1` / `round2` / `SALE_DATES_ARE_UTC`
 * against that file instead of redefining them here.
 */

// Set to match how `sales.date` / `v_activity_logs.created_at` are stored.
// See the same flag in the sales-summary rewrite — it must agree with
// whatever convention your columns actually use.
const SALE_DATES_ARE_UTC = true;

function dbBound(d: Date): string {
  return SALE_DATES_ARE_UTC
    ? d.toISOString().slice(0, 19).replace("T", " ")
    : format(d, "yyyy-MM-dd HH:mm:ss");
}

const num = (v: any) => Number(v) || 0;
const round1 = (n: number) => Math.round((Number(n) || 0) * 10) / 10;

function pctChange(current: number, previous: number): number {
  // Matches the original's behaviour (0 baseline -> 100 if current > 0,
  // else 0) rather than the sales-summary file's `null`-on-no-baseline
  // convention, since AdminKpiMetrics types these deltas as `number`.
  if (!previous) return current > 0 ? 100 : 0;
  return round1(((current - previous) / previous) * 100);
}

export async function getComprehensiveAdminDashboardData(): Promise<
  Result<AdminDashboardFullData>
> {
  try {


   const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Not Authorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    if (currentUser.role !== "admin") {
      throw new Error("Forbidden: admin access required");
    }

    const now = new Date();

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const yesterdayStart = startOfDay(subDays(now, 1));
    const yesterdayEnd = endOfDay(subDays(now, 1));
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfDay(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const periodStatsP = db("sales")
      .where("tenant_id", tenantId)
      .andWhere("status", "completed")
      .select(
        db.raw(
          `
          COUNT(*)          as all_time_orders,
          SUM(total_amount) as all_time_revenue,
          AVG(total_amount) as all_time_aov,
          SUM(CASE WHEN datetime(date) BETWEEN datetime(?) AND datetime(?) THEN 1 ELSE 0 END)             as today_orders,
          SUM(CASE WHEN datetime(date) BETWEEN datetime(?) AND datetime(?) THEN total_amount ELSE 0 END)  as today_revenue,
          SUM(CASE WHEN datetime(date) BETWEEN datetime(?) AND datetime(?) THEN 1 ELSE 0 END)             as yesterday_orders,
          SUM(CASE WHEN datetime(date) BETWEEN datetime(?) AND datetime(?) THEN total_amount ELSE 0 END)  as yesterday_revenue,
          SUM(CASE WHEN datetime(date) BETWEEN datetime(?) AND datetime(?) THEN 1 ELSE 0 END)             as this_month_orders,
          SUM(CASE WHEN datetime(date) BETWEEN datetime(?) AND datetime(?) THEN total_amount ELSE 0 END)  as this_month_revenue,
          SUM(CASE WHEN datetime(date) BETWEEN datetime(?) AND datetime(?) THEN 1 ELSE 0 END)             as last_month_orders,
          SUM(CASE WHEN datetime(date) BETWEEN datetime(?) AND datetime(?) THEN total_amount ELSE 0 END)  as last_month_revenue
          `,
          [
            dbBound(todayStart),
            dbBound(todayEnd),
            dbBound(todayStart),
            dbBound(todayEnd),
            dbBound(yesterdayStart),
            dbBound(yesterdayEnd),
            dbBound(yesterdayStart),
            dbBound(yesterdayEnd),
            dbBound(thisMonthStart),
            dbBound(thisMonthEnd),
            dbBound(thisMonthStart),
            dbBound(thisMonthEnd),
            dbBound(lastMonthStart),
            dbBound(lastMonthEnd),
            dbBound(lastMonthStart),
            dbBound(lastMonthEnd),
          ],
        ),
      )
      .first();

    const totalUnitsSoldP = db("sale_items as si")
      .join("sales as s", "si.sales_id", "s.id")
      .where("s.tenant_id", tenantId)
      .andWhere("s.status", "completed")
      .sum("si.quantity as totalUnits")
      .first();

    const productStatsP = db("products")
      .where("tenant_id", tenantId)
      .select(
        db.raw(`
          COUNT(*)                                  as totalProducts,
          SUM(stock_quantity * unit_price)           as totalValuation,
          SUM(stock_quantity)                        as totalUnits,
          SUM(CASE WHEN stock_quantity <= 0 THEN 1 ELSE 0 END)                         as outOfStock,
          SUM(CASE WHEN stock_quantity > 0 AND stock_quantity < 5 THEN 1 ELSE 0 END)   as lowStock
        `),
      )
      .first();

    const customersCountP = db("customers")
      .where("tenant_id", tenantId)
      .count("id as count")
      .first()
      .catch(() => ({ count: 0 }));

    const suppliersCountP = db("suppliers")
      .where("tenant_id", tenantId)
      .count("id as count")
      .first()
      .catch(() => ({ count: 0 }));

    const roleCountsP = db("users")
      .where("tenant_id", tenantId)
      .select("role")
      .count("id as count")
      .groupBy("role")
      .catch(() => [] as any[]);

    const unreadNotifP = db("notifications")
      .where("tenant_id", tenantId)
      .andWhere("user_id", currentUser.id)
      .andWhere("is_read", false)
      .count("id as count")
      .first()
      .catch(() => ({ count: 0 }));

    const salesOverTimeP = Promise.all([
      getSalesOverTime(7, tenantId),
      getSalesOverTime(14, tenantId),
      getSalesOverTime(30, tenantId),
    ]);

    const topProductsByRevenueP = db("sale_items as si")
      .join("products as p", "si.product_id", "p.id")
      .leftJoin("product_categories as c", "p.category_id", "c.id")
      .join("sales as s", "si.sales_id", "s.id")
      .select(
        "p.id",
        "p.name",
        "p.unit_price",
        db.raw("COALESCE(c.name, 'Uncategorized') as category_name"),
        db.raw("SUM(si.quantity * si.unit_price) as revenue"),
        db.raw("SUM(si.quantity) as quantity"),
      )
      .where("s.tenant_id", tenantId)
      .andWhere("p.tenant_id", tenantId)
      .andWhere("s.status", "completed")
      .groupBy("p.id", "p.name", "p.unit_price", "c.name")
      .orderByRaw("revenue DESC")
      .limit(10);

    const topProductsByQuantityP = db("sale_items as si")
      .join("products as p", "si.product_id", "p.id")
      .leftJoin("product_categories as c", "p.category_id", "c.id")
      .join("sales as s", "si.sales_id", "s.id")
      .select(
        "p.id",
        "p.name",
        "p.unit_price",
        db.raw("COALESCE(c.name, 'Uncategorized') as category_name"),
        db.raw("SUM(si.quantity * si.unit_price) as revenue"),
        db.raw("SUM(si.quantity) as quantity"),
      )
      .where("s.tenant_id", tenantId)
      .andWhere("p.tenant_id", tenantId)
      .andWhere("s.status", "completed")
      .groupBy("p.id", "p.name", "p.unit_price", "c.name")
      .orderByRaw("quantity DESC")
      .limit(10);

    const categoryP = db("sale_items as si")
      .join("products as p", "si.product_id", "p.id")
      .leftJoin("product_categories as c", "p.category_id", "c.id")
      .join("sales as s", "si.sales_id", "s.id")
      .select(
        db.raw("COALESCE(c.name, 'General') as category"),
        db.raw("SUM(si.quantity * si.unit_price) as revenue"),
        db.raw("SUM(si.quantity) as item_count"),
      )
      .where("s.tenant_id", tenantId)
      .andWhere("p.tenant_id", tenantId)
      .andWhere("s.status", "completed")
      .groupBy("c.id", "c.name")
      .orderByRaw("revenue DESC");

    const monthSalesP = db("sales")
      .where("tenant_id", tenantId)
      .select(
        db.raw("CAST(strftime('%m', date) AS INTEGER) AS month"),
        db.raw("strftime('%Y', date) AS year"),
      )
      .sum("total_amount AS total_sales")
      .whereRaw("strftime('%Y', date) = strftime('%Y', 'now', 'localtime')")
      .andWhere("status", "completed")
      .groupByRaw("strftime('%Y', date), strftime('%m', date)")
      .orderByRaw("strftime('%Y', date) ASC, strftime('%m', date) ASC");

    const recentTransactionsP = db("v_sale_summary")
      .where("tenant_id", tenantId)
      .select(
        "sale_id as id",
        "receipt_number as receiptNo",
        "customer_name as customerName",
        "phonenumber as customerPhone",
        "user_name as cashierName",
        "sale_date as saleDate",
        "total_amount as totalAmount",
        "total_amount as amountPaid",
        db.raw("0 as balance"),
        db.raw("0 as discount"),
        db.raw("0 as tax"),
        "payment_mode as paymentMode",
        "status",
        "item_count as itemCount",
      )
      .orderBy("sale_date", "desc")
      .limit(10)
      .catch((error: any) => {
        console.error("recentTransactions query failed:", error);
        return [] as any[];
      });

    const stockAlertRowsP = db("products as p")
      .leftJoin("product_categories as c", "p.category_id", "c.id")
      .select(
        "p.id",
        "p.name",
        "p.stock_quantity as stock",
        "p.cost_price as buyingPrice",
        "p.unit_price as sellingPrice",
        db.raw("COALESCE(c.name, 'Uncategorized') as categoryName"),
      )
      .where("p.tenant_id", tenantId)
      .andWhere("p.stock_quantity", "<", 5)
      .orderBy("p.stock_quantity", "asc")
      .limit(10);

    const recentActivityP = db("v_activity_logs")
      .where("tenant_id", tenantId)
      .select(
        "id",
        "activity_type as type",
        "title",
        "description",
        "user_name as userName",
        "created_at as createdAt",
      )
      .orderBy("created_at", "desc")
      .limit(6)
      .catch(() => [] as any[]);

    const heatmapP = getActivityHeatmapData(30, tenantId);

    // Everything above is independent of everything else, so it all goes
    // out together instead of the original's ~20 sequential round trips.
    // (If your sqlite driver is synchronous — e.g. better-sqlite3 — this
    // won't add true concurrency, but it still cuts total round trips from
    // ~20 queries to ~14, which is where most of the win comes from.)
    const [
      periodStats,
      totalUnitsSoldRow,
      productStats,
      customersCountRow,
      suppliersCountRow,
      roleCounts,
      unreadNotifRow,
      [sales7dRes, sales14dRes, sales30dRes],
      topProductsByRevenueRaw,
      topProductsByQuantityRaw,
      categoryRaw,
      monthSales,
      recentTransactionsRows,
      stockAlertRows,
      recentActivityRows,
      heatmapRes,
    ] = await Promise.all([
      periodStatsP,
      totalUnitsSoldP,
      productStatsP,
      customersCountP,
      suppliersCountP,
      roleCountsP,
      unreadNotifP,
      salesOverTimeP,
      topProductsByRevenueP,
      topProductsByQuantityP,
      categoryP,
      monthSalesP,
      recentTransactionsP,
      stockAlertRowsP,
      recentActivityP,
      heatmapP,
    ]);

    // ── All-time / units ──
    const totalRevenueAllTime = num(periodStats?.all_time_revenue);
    const totalOrdersAllTime = num(periodStats?.all_time_orders);
    const allTimeAov = num(periodStats?.all_time_aov);
    const totalUnitsSoldAllTime = num(totalUnitsSoldRow?.totalUnits);

    // ── Today / yesterday ──
    const todayRevenue = num(periodStats?.today_revenue);
    const todayOrders = num(periodStats?.today_orders);
    const todayAov = todayOrders ? todayRevenue / todayOrders : 0;
    const yesterdayRevenue = num(periodStats?.yesterday_revenue);
    const yesterdayOrders = num(periodStats?.yesterday_orders);

    const todayVsYesterdayRevenueDelta = pctChange(
      todayRevenue,
      yesterdayRevenue,
    );
    const todayVsYesterdayOrdersDelta = pctChange(todayOrders, yesterdayOrders);

    // ── This month / last month ──
    const thisMonthRevenue = num(periodStats?.this_month_revenue);
    const thisMonthOrders = num(periodStats?.this_month_orders);
    const lastMonthRevenue = num(periodStats?.last_month_revenue);
    const lastMonthOrders = num(periodStats?.last_month_orders);
    const thisMonthVsLastMonthRevenueDelta = pctChange(
      thisMonthRevenue,
      lastMonthRevenue,
    );

    // ── Inventory ──
    const totalProductsCount = num(productStats?.totalProducts);
    const totalInventoryValuation = num(productStats?.totalValuation);
    const totalStockUnits = num(productStats?.totalUnits);
    const outOfStockCount = num(productStats?.outOfStock);
    const lowStockCount = num(productStats?.lowStock);

    // ── Network counts ──
    const totalCustomersCount = num((customersCountRow as any)?.count);
    const totalSuppliersCount = num((suppliersCountRow as any)?.count);
    const totalUsersCount = (roleCounts as any[]).reduce(
      (sum, r) => sum + num(r.count),
      0,
    );
    const adminUsersCount = num(
      (roleCounts as any[]).find((r) => r.role === "admin")?.count,
    );
    const cashierUsersCount = totalUsersCount - adminUsersCount;

    const unreadNotifications = num((unreadNotifRow as any)?.count);

    const salesOverTime7d =
      sales7dRes.success && sales7dRes.data ? sales7dRes.data : [];
    const salesOverTime14d =
      sales14dRes.success && sales14dRes.data ? sales14dRes.data : [];
    const salesOverTime30d =
      sales30dRes.success && sales30dRes.data ? sales30dRes.data : [];

    // ── Top products ──
    const toTopProduct = (row: any): AdminTopProduct => {
      const rev = num(row.revenue);
      return {
        id: row.id,
        name: row.name,
        categoryName: row.category_name,
        revenue: rev,
        quantity: num(row.quantity),
        sellingPrice: num(row.unit_price),
        percentageOfTotal: totalRevenueAllTime
          ? round1((rev / totalRevenueAllTime) * 100)
          : 0,
      };
    };
    const topProductsByRevenue: AdminTopProduct[] =
      topProductsByRevenueRaw.map(toTopProduct);
    const topProductsByQuantity: AdminTopProduct[] =
      topProductsByQuantityRaw.map(toTopProduct);

    // ── Category revenue ──
    const categorySum = categoryRaw.reduce(
      (acc: number, curr: any) => acc + num(curr.revenue),
      0,
    );
    const revenueByCategory: AdminCategoryRevenue[] = categoryRaw.map(
      (row: any) => {
        const rev = num(row.revenue);
        return {
          category: row.category,
          revenue: rev,
          percentage: categorySum ? round1((rev / categorySum) * 100) : 0,
          itemCount: num(row.item_count),
        };
      },
    );

    // ── Monthly sales, current year ──
    const monthsOfYear = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const totalMonthlySales = monthsOfYear.map((month, index) => {
      const match = monthSales.find((s: any) => Number(s.month) === index + 1);
      return { month, value: match ? num(match.total_sales) : 0 };
    });

    // ── Recent transactions ──
    const recentTransactions: AdminDetailedTransaction[] =
      recentTransactionsRows.map((r: any) => ({
        id: r.id,
        receiptNo: r.receiptNo || `REC-${r.id?.slice(0, 6)}`,
        customerName: r.customerName || "Walk-in Customer",
        customerPhone: r.customerPhone || undefined,
        cashierName: r.cashierName || "Store Cashier",
        saleDate: r.saleDate,
        totalAmount: num(r.totalAmount),
        amountPaid: num(r.amountPaid) || num(r.totalAmount),
        discount: num(r.discount),
        tax: num(r.tax),
        paymentMode: r.paymentMode || "Cash",
        status: r.status || "completed",
        itemCount: num(r.itemCount) || 1,
      }));

    // ── Stock alerts ──
    const stockAlerts: AdminDetailedStockAlert[] = stockAlertRows.map(
      (row: any) => {
        const stock = num(row.stock);
        return {
          id: row.id,
          name: row.name,
          categoryName: row.categoryName,
          stock,
          buyingPrice: num(row.buyingPrice),
          sellingPrice: num(row.sellingPrice),
          severity: stock <= 0 ? "critical" : "warning",
        };
      },
    );

    // ── Recent activity ──
    const severityFor = (
      type: string,
    ): "info" | "success" | "warning" | "critical" => {
      const t = type.toLowerCase();
      if (t.includes("delete") || t.includes("void") || t.includes("cancel"))
        return "critical";
      if (t.includes("warning") || t.includes("stock") || t.includes("alert"))
        return "warning";
      if (t.includes("sale") || t.includes("create") || t.includes("add"))
        return "success";
      return "info";
    };
    const recentActivity: AdminActivityItem[] = recentActivityRows.map(
      (row: any) => ({
        id: row.id,
        type: row.type || "System Event",
        title: row.title || "Administrative Event",
        description: row.description,
        userName: row.userName || "System",
        createdAt: row.createdAt,
        severity: severityFor(row.type || ""),
      }),
    );

    const activityHeatmap =
      heatmapRes.success && heatmapRes.data ? heatmapRes.data : null;

    const metrics: AdminKpiMetrics = {
      totalRevenueAllTime,
      totalOrdersAllTime,
      totalUnitsSoldAllTime,
      allTimeAov,

      todayRevenue,
      todayOrders,
      todayAov,
      yesterdayRevenue,
      yesterdayOrders,
      todayVsYesterdayRevenueDelta,
      todayVsYesterdayOrdersDelta,

      thisMonthRevenue,
      thisMonthOrders,
      lastMonthRevenue,
      lastMonthOrders,
      thisMonthVsLastMonthRevenueDelta,

      totalProductsCount,
      totalInventoryValuation,
      totalStockUnits,
      outOfStockCount,
      lowStockCount,

      totalCustomersCount,
      totalSuppliersCount,
      totalUsersCount,
      adminUsersCount,
      cashierUsersCount,

      unreadNotifications,
    };

    return Result.ok({
      metrics,
      salesOverTime7d,
      salesOverTime14d,
      salesOverTime30d,
      topProductsByRevenue,
      topProductsByQuantity,
      revenueByCategory,
      totalMonthlySales,
      recentTransactions,
      stockAlerts,
      recentActivity,
      activityHeatmap,
      serverTime: now.toISOString(),
    });
  } catch (error: any) {
    console.error("Failed to fetch comprehensive admin dashboard data:", error);
    return Result.fail(
      error?.message || "Failed to fetch comprehensive admin dashboard data",
    );
  }
}

// export async function getComprehensiveAdminDashboardData(): Promise<
//   Result<AdminDashboardFullData>
// > {
//   try {
//     const currentUser = await getCurrentUser();
//     if (!currentUser?.id) throw new Error("Unauthorized");

//     const now = new Date();
//     const todayStr = format(now, "yyyy-MM-dd");
//     const yesterdayStr = format(subDays(now, 1), "yyyy-MM-dd");
//     const thisMonthKey = format(now, "yyyy-MM");
//     const lastMonthKey = format(subDays(now, 30), "yyyy-MM");

//     // 1. All-time Sales Summary
//     const allTimeStats = await db("sales")
//       .where("status", "completed")
//       .first(
//         db.raw(
//           "COUNT(*) as totalOrders, SUM(total_amount) as totalRevenue, AVG(total_amount) as allTimeAov",
//         ),
//       );

//     const totalRevenueAllTime = Number(allTimeStats?.totalRevenue) || 0;
//     const totalOrdersAllTime = Number(allTimeStats?.totalOrders) || 0;
//     const allTimeAov = Number(allTimeStats?.allTimeAov) || 0;

//     // Total units sold all time
//     const totalUnitsSoldRow = await db("sale_items as si")
//       .join("sales as s", "si.sales_id", "s.id")
//       .where("s.status", "completed")
//       .sum("si.quantity as totalUnits")
//       .first();
//     const totalUnitsSoldAllTime = Number(totalUnitsSoldRow?.totalUnits) || 0;

//     // 2. Today's Sales
//     const todayStats = await db("sales")
//       .where("status", "completed")
//       .andWhereRaw("DATE(date) = ?", todayStr)
//       .first(
//         db.raw(
//           "COUNT(*) as orders, SUM(total_amount) as revenue, AVG(total_amount) as aov",
//         ),
//       );

//     const todayRevenue = Number(todayStats?.revenue) || 0;
//     const todayOrders = Number(todayStats?.orders) || 0;
//     const todayAov = Number(todayStats?.aov) || 0;

//     // 3. Yesterday's Sales
//     const yesterdayStats = await db("sales")
//       .where("status", "completed")
//       .andWhereRaw("DATE(date) = ?", yesterdayStr)
//       .first(
//         db.raw(
//           "COUNT(*) as orders, SUM(total_amount) as revenue, AVG(total_amount) as aov",
//         ),
//       );

//     const yesterdayRevenue = Number(yesterdayStats?.revenue) || 0;
//     const yesterdayOrders = Number(yesterdayStats?.orders) || 0;

//     // Calculate Today vs Yesterday deltas
//     const todayVsYesterdayRevenueDelta =
//       yesterdayRevenue > 0
//         ? Number(
//             (
//               ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) *
//               100
//             ).toFixed(1),
//           )
//         : todayRevenue > 0
//           ? 100
//           : 0;

//     const todayVsYesterdayOrdersDelta =
//       yesterdayOrders > 0
//         ? Number(
//             (((todayOrders - yesterdayOrders) / yesterdayOrders) * 100).toFixed(
//               1,
//             ),
//           )
//         : todayOrders > 0
//           ? 100
//           : 0;

//     // 4. This Month & Last Month Sales
//     const thisMonthStats = await db("sales")
//       .where("status", "completed")
//       .andWhereRaw("strftime('%Y-%m', date) = ?", thisMonthKey)
//       .first(db.raw("COUNT(*) as orders, SUM(total_amount) as revenue"));

//     const thisMonthRevenue = Number(thisMonthStats?.revenue) || 0;
//     const thisMonthOrders = Number(thisMonthStats?.orders) || 0;

//     const lastMonthStats = await db("sales")
//       .where("status", "completed")
//       .andWhereRaw("strftime('%Y-%m', date) = ?", lastMonthKey)
//       .first(db.raw("COUNT(*) as orders, SUM(total_amount) as revenue"));

//     const lastMonthRevenue = Number(lastMonthStats?.revenue) || 0;
//     const lastMonthOrders = Number(lastMonthStats?.orders) || 0;

//     const thisMonthVsLastMonthRevenueDelta =
//       lastMonthRevenue > 0
//         ? Number(
//             (
//               ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) *
//               100
//             ).toFixed(1),
//           )
//         : thisMonthRevenue > 0
//           ? 100
//           : 0;

//     // 5. Products & Inventory Stats
//     const productStats = await db("products").first(
//       db.raw(
//         "COUNT(*) as totalProducts, SUM(stock_quantity * unit_price) as totalValuation, SUM(stock_quantity) as totalUnits",
//       ),
//     );

//     const totalProductsCount = Number(productStats?.totalProducts) || 0;
//     const totalInventoryValuation = Number(productStats?.totalValuation) || 0;
//     const totalStockUnits = Number(productStats?.totalUnits) || 0;

//     const outOfStockRow = await db("products")
//       .where("stock_quantity", "<=", 0)
//       .count("id as count")
//       .first();
//     const outOfStockCount = Number(outOfStockRow?.count) || 0;

//     const lowStockRow = await db("products")
//       .where("stock_quantity", ">", 0)
//       .andWhere("stock_quantity", "<", 5)
//       .count("id as count")
//       .first();
//     const lowStockCount = Number(lowStockRow?.count) || 0;

//     // 6. Network counts: Customers, Suppliers, Users
//     const customersCountRow = await db("customers")
//       .count("id as count")
//       .first()
//       .catch(() => ({ count: 0 }));
//     const totalCustomersCount = Number((customersCountRow as any)?.count) || 0;

//     const suppliersCountRow = await db("suppliers")
//       .count("id as count")
//       .first()
//       .catch(() => ({ count: 0 }));
//     const totalSuppliersCount = Number((suppliersCountRow as any)?.count) || 0;

//     const usersCountRows = await db("users")
//       .select("role")
//       .catch(() => []);
//     const totalUsersCount = usersCountRows.length;
//     const adminUsersCount = usersCountRows.filter(
//       (u: any) => u.role === "admin",
//     ).length;
//     const cashierUsersCount = usersCountRows.filter(
//       (u: any) => u.role !== "admin",
//     ).length;

//     // 7. Unread notifications for admin
//     const unreadNotifRow = await db("notifications")
//       .where("user_id", currentUser?.id)
//       .andWhere("is_read", false)
//       .count("id as count")
//       .first()
//       .catch(() => ({ count: 0 }));
//     const unreadNotifications = Number((unreadNotifRow as any)?.count) || 0;

//     // 8. Sales over time: 7d, 14d, 30d
//     const [sales7dRes, sales14dRes, sales30dRes] = await Promise.all([
//       getSalesOverTime(7),
//       getSalesOverTime(14),
//       getSalesOverTime(30),
//     ]);

//     const salesOverTime7d =
//       sales7dRes.success && sales7dRes.data ? sales7dRes.data : [];
//     const salesOverTime14d =
//       sales14dRes.success && sales14dRes.data ? sales14dRes.data : [];
//     const salesOverTime30d =
//       sales30dRes.success && sales30dRes.data ? sales30dRes.data : [];

//     // 9. Top Products with Category Names
//     const topProductsRaw = await db("sale_items as si")
//       .join("products as p", "si.product_id", "p.id")
//       .leftJoin("product_categories as c", "p.category_id", "c.id")
//       .join("sales as s", "si.sales_id", "s.id")
//       .select(
//         "p.id",
//         "p.name",
//         "p.unit_price",
//         db.raw("COALESCE(c.name, 'Uncategorized') as category_name"),
//         db.raw("SUM(si.quantity * si.unit_price) as revenue"),
//         db.raw("SUM(si.quantity) as quantity"),
//       )
//       .where("s.status", "completed")
//       .groupBy("p.id", "p.name", "p.unit_price", "c.name")
//       .orderByRaw("revenue DESC")
//       .limit(10);

//     const totalTopRevenue = topProductsRaw.reduce(
//       (acc: number, curr: any) => acc + (Number(curr.revenue) || 0),
//       0,
//     );

//     const topProductsByRevenue: AdminTopProduct[] = topProductsRaw.map(
//       (row: any) => {
//         const rev = Number(row.revenue) || 0;
//         return {
//           id: row.id,
//           name: row.name,
//           categoryName: row.category_name,
//           revenue: rev,
//           quantity: Number(row.quantity) || 0,
//           sellingPrice: Number(row.unit_price) || 0,
//           percentageOfTotal:
//             totalRevenueAllTime > 0
//               ? Number(((rev / totalRevenueAllTime) * 100).toFixed(1))
//               : 0,
//         };
//       },
//     );

//     const topProductsByQuantity: AdminTopProduct[] = [
//       ...topProductsByRevenue,
//     ].sort((a, b) => b.quantity - a.quantity);

//     // 10. Revenue by Category with Percentages
//     const categoryRaw = await db("sale_items as si")
//       .join("products as p", "si.product_id", "p.id")
//       .leftJoin("product_categories as c", "p.category_id", "c.id")
//       .join("sales as s", "si.sales_id", "s.id")
//       .select(
//         db.raw("COALESCE(c.name, 'General') as category"),
//         db.raw("SUM(si.quantity * si.unit_price) as revenue"),
//         db.raw("SUM(si.quantity) as item_count"),
//       )
//       .where("s.status", "completed")
//       .groupBy("c.id", "c.name")
//       .orderByRaw("revenue DESC");

//     const categorySum = categoryRaw.reduce(
//       (acc: number, curr: any) => acc + (Number(curr.revenue) || 0),
//       0,
//     );

//     const revenueByCategory: AdminCategoryRevenue[] = categoryRaw.map(
//       (row: any) => {
//         const rev = Number(row.revenue) || 0;
//         return {
//           category: row.category,
//           revenue: rev,
//           percentage:
//             categorySum > 0
//               ? Number(((rev / categorySum) * 100).toFixed(1))
//               : 0,
//           itemCount: Number(row.item_count) || 0,
//         };
//       },
//     );

//     // 11. Monthly Sales for Current Year
//     const monthSales = await db("sales")
//       .select(
//         db.raw("CAST(strftime('%m', date) AS INTEGER) AS month"),
//         db.raw("strftime('%Y', date) AS year"),
//       )
//       .sum("total_amount AS total_sales")
//       .whereRaw("strftime('%Y', date) = strftime('%Y', 'now', 'localtime')")
//       .andWhere("status", "completed")
//       .groupByRaw("strftime('%Y', date), strftime('%m', date)")
//       .orderByRaw("strftime('%Y', date) ASC, strftime('%m', date) ASC");

//     const monthsOfYear = [
//       "January",
//       "February",
//       "March",
//       "April",
//       "May",
//       "June",
//       "July",
//       "August",
//       "September",
//       "October",
//       "November",
//       "December",
//     ];

//     const totalMonthlySales = monthsOfYear.map((month, index) => {
//       const monthNumber = index + 1;
//       const match = monthSales.find(
//         (s: any) => Number(s.month) === monthNumber,
//       );
//       return {
//         month,
//         value: match ? Number(match.total_sales) : 0,
//       };
//     });

//     // 12. Recent 10 Transactions
//     let recentTransactions: AdminDetailedTransaction[] = [];
//     try {
//       const txRows = await db("v_sale_summary")
//         .select(
//           "sale_id as id",
//           "receipt_number as receiptNo",
//           "customer_name as customerName",
//           "phonenumber as customerPhone",
//           "user_name as cashierName",
//           "sale_date as saleDate",
//           "total_amount as totalAmount",
//           "total_amount as amountPaid",
//           db.raw("0 as balance"),
//           db.raw("0 as discount"),
//           db.raw("0 as tax"),
//           "payment_mode as paymentMode",
//           "status",
//           "item_count as itemCount",
//         )
//         .orderBy("sale_date", "desc")
//         .limit(10);

//       recentTransactions = txRows.map((r: any) => ({
//         id: r.id,
//         receiptNo: r.receiptNo || `REC-${r.id?.slice(0, 6)}`,
//         customerName: r.customerName || "Walk-in Customer",
//         customerPhone: r.customerPhone || undefined,
//         cashierName: r.cashierName || "Store Cashier",
//         saleDate: r.saleDate,
//         totalAmount: Number(r.totalAmount) || 0,
//         amountPaid: Number(r.amountPaid) || Number(r.totalAmount) || 0,
//         discount: Number(r.discount) || 0,
//         tax: Number(r.tax) || 0,
//         paymentMode: r.paymentMode || "Cash",
//         status: r.status || "completed",
//         itemCount: Number(r.itemCount) || 1,
//       }));
//     } catch(error) {

//       console.log(error)
//       recentTransactions = [];
//     }

//     // 13. Detailed Stock Alerts (< 5 items)
//     const stockAlertRows = await db("products as p")
//       .leftJoin("product_categories as c", "p.category_id", "c.id")
//       .select(
//         "p.id",
//         "p.name",
//         "p.stock_quantity as stock",
//         "p.cost_price as buyingPrice",
//         "p.unit_price as sellingPrice",
//         db.raw("COALESCE(c.name, 'Uncategorized') as categoryName"),
//       )
//       .where("p.stock_quantity", "<", 5)
//       .orderBy("p.stock_quantity", "asc")
//       .limit(10);

//     const stockAlerts: AdminDetailedStockAlert[] = stockAlertRows.map(
//       (row: any) => {
//         const stock = Number(row.stock) || 0;
//         return {
//           id: row.id,
//           name: row.name,
//           categoryName: row.categoryName,
//           stock,
//           buyingPrice: Number(row.buyingPrice) || 0,
//           sellingPrice: Number(row.sellingPrice) || 0,
//           severity: stock <= 0 ? "critical" : "warning",
//         };
//       },
//     );

//     // 14. Recent Admin Activity & System Notifications
//     const recentActivity: AdminActivityItem[] = [];
//     try {
//       const activityRows = await db("v_activity_logs")
//         .select(
//           "id",
//           "activity_type as type",
//           "title",
//           "description",
//           "user_name as userName",
//           "created_at as createdAt",
//         )
//         .orderBy("created_at", "desc")
//         .limit(6);

//       for (const row of activityRows) {
//         let severity: "info" | "success" | "warning" | "critical" = "info";
//         const typeLower = (row.type || "").toLowerCase();
//         if (
//           typeLower.includes("delete") ||
//           typeLower.includes("void") ||
//           typeLower.includes("cancel")
//         ) {
//           severity = "critical";
//         } else if (
//           typeLower.includes("warning") ||
//           typeLower.includes("stock") ||
//           typeLower.includes("alert")
//         ) {
//           severity = "warning";
//         } else if (
//           typeLower.includes("sale") ||
//           typeLower.includes("create") ||
//           typeLower.includes("add")
//         ) {
//           severity = "success";
//         }

//         recentActivity.push({
//           id: row.id,
//           type: row.type || "System Event",
//           title: row.title || "Administrative Event",
//           description: row.description,
//           userName: row.userName || "System",
//           createdAt: row.createdAt,
//           severity,
//         });
//       }
//    } catch(error) {

//       // console.log(error)
//       // Fallback
//     }

//     // 15. Operational Heatmap Data
//     const heatmapRes = await getActivityHeatmapData(30);
//     const activityHeatmap =
//       heatmapRes.success && heatmapRes.data ? heatmapRes.data : null;

//     const metrics: AdminKpiMetrics = {
//       totalRevenueAllTime,
//       totalOrdersAllTime,
//       totalUnitsSoldAllTime,
//       allTimeAov,

//       todayRevenue,
//       todayOrders,
//       todayAov,
//       yesterdayRevenue,
//       yesterdayOrders,
//       todayVsYesterdayRevenueDelta,
//       todayVsYesterdayOrdersDelta,

//       thisMonthRevenue,
//       thisMonthOrders,
//       lastMonthRevenue,
//       lastMonthOrders,
//       thisMonthVsLastMonthRevenueDelta,

//       totalProductsCount,
//       totalInventoryValuation,
//       totalStockUnits,
//       outOfStockCount,
//       lowStockCount,

//       totalCustomersCount,
//       totalSuppliersCount,
//       totalUsersCount,
//       adminUsersCount,
//       cashierUsersCount,

//       unreadNotifications,
//     };

//     return Result.ok({
//       metrics,
//       salesOverTime7d,
//       salesOverTime14d,
//       salesOverTime30d,
//       topProductsByRevenue,
//       topProductsByQuantity,
//       revenueByCategory,
//       totalMonthlySales,
//       recentTransactions,
//       stockAlerts,
//       recentActivity,
//       activityHeatmap,
//       serverTime: now.toISOString(),
//     });
//   } catch (error: any) {
//     console.error("Failed to fetch comprehensive admin dashboard data:", error);
//     return Result.fail(
//       error?.message || "Failed to fetch comprehensive admin dashboard data",
//     );
//   }
// }

// "use server";

// import db from "@/db/knex";
// import { Result } from "@/types/globals";
// import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
// import { getCurrentUser } from "./_actions";

// // ──────────────────────────────────────────────────────────────
// // 1. Main stats: revenue, orders, AOV, low stock, unread notifs
// // ──────────────────────────────────────────────────────────────
// export async function getDashboardStats(): Promise<
//   Result<{
//     revenue: number;
//     orders: number;
//     aov: number;
//     lowStockCount: number;
//     unreadNotifications: number;
//   }>
// > {
//   try {
//     const currentUser = await getCurrentUser();

//     if (!currentUser?.id) throw new Error("Unauthorized");

//     // Revenue and orders for today

//     const today = format(new Date(), "yyyy-MM-dd");
//     const todayStats = await db("v_sale_summary")
//       .where("status", "completed")
//       .andWhereRaw("DATE(sale_date) = ?", today)
//       .first(
//         db.raw(
//           "COUNT(*) as orders, SUM(total_amount) as revenue, AVG(total_amount) as aov",
//         ),
//       );

//     const revenue = Number(todayStats?.revenue) || 0;
//     const orders = Number(todayStats?.orders) || 0;
//     const aov = Number(todayStats?.aov) || 0;

//     const lowStockCount = await db("products")
//       .where("stock_quantity", "<", 5)
//       .count("id as count")
//       .first()
//       .then((r: any) => Number(r?.count) || 0); // 👈 Explicitly bypass with any

//     // Unread notifications for the current user
//     const unreadNotifications = await db("notifications")
//       .where("user_id", currentUser?.id)
//       .andWhere("is_read", false)
//       .count("id as count")
//       .first()
//       .then((r: any) => Number(r?.count) || 0);

//     return Result.ok({
//       revenue,
//       orders,
//       aov,
//       lowStockCount,
//       unreadNotifications,
//     });
//   } catch (error: any) {
//     console.error("Failed to fetch dashboard stats:", error);
//     return Result.fail(error?.message || "Failed to fetch dashboard stats");
//   }
// }

// // ──────────────────────────────────────────────────────────────
// // 2. Sales over time (last N days)
// // ──────────────────────────────────────────────────────────────

// export async function getSalesOverTime(
//   days: number = 7,
// ): Promise<Result<{ date: string; revenue: number; orders: number }[]>> {
//   try {
//     const now = new Date();
//     const startDate = startOfDay(subDays(now, days - 1));
//     const endDate = endOfDay(now);

//     // 1. Fetch DB data — avoid wrapping sale_date in a function so SQLite
//     //    can use an index on the column directly in WHERE/GROUP BY/ORDER BY
//     const results = await db("v_sale_summary")
//       .select(db.raw("date(sale_date) as date_str"))
//       .sum({ revenue: "total_amount" })
//       .count({ orders: "sale_id" })
//       .where({ status: "completed" })
//       .whereBetween("sale_date", [
//         startDate.toISOString(),
//         endDate.toISOString(),
//       ])
//       .groupByRaw("date(sale_date)")
//       .orderByRaw("date(sale_date) ASC");

//     // Convert results array to a lookup Map for O(1) access
//     const dbMap = new Map<string, { revenue: number; orders: number }>(
//       results.map((row: any) => [
//         row.date_str,
//         { revenue: Number(row.revenue) || 0, orders: Number(row.orders) || 0 },
//       ]),
//     );

//     const salesForLastSevenDays: {
//       date: string;
//       revenue: number;
//       orders: number;
//     }[] = [];

//     // 2. Generate final structure in a single, lightweight loop
//     for (let i = 0; i < days; i++) {
//       const currentDate = subDays(now, days - 1 - i);
//       const isoKey = format(currentDate, "yyyy-MM-dd");
//       const displayDate = format(currentDate, "MMM d");

//       const dbMatch = dbMap.get(isoKey);

//       salesForLastSevenDays.push({
//         date: displayDate,
//         revenue: dbMatch ? dbMatch.revenue : 0,
//         orders: dbMatch ? dbMatch.orders : 0,
//       });
//     }

//     return Result.ok(salesForLastSevenDays);
//   } catch (error: any) {
//     console.error("Failed to fetch sales over time:", error);

//     return Result.fail(error?.message || "Failed to fetch sales over time");
//   }
// }

// // ──────────────────────────────────────────────────────────────
// // 3. Top products by revenue
// // ──────────────────────────────────────────────────────────────
// export async function getTopProducts(
//   limit: number = 5,
// ): Promise<
//   Result<{ id: string; name: string; revenue: number; quantity: number }[]>
// > {
//   try {
//     const results = await db("sale_items as si")
//       .join("products as p", "si.product_id", "p.id")
//       .join("sales as s", "si.sales_id", "s.id")
//       .select(
//         "p.id",
//         "p.name",
//         db.raw("SUM(si.quantity * si.unit_price) as revenue"),
//         db.raw("SUM(si.quantity) as quantity"),
//       )
//       .where("s.status", "completed")
//       .groupBy("p.id", "p.name")
//       .orderByRaw("revenue DESC")
//       .limit(limit);

//     const formatted = results.map((row: any) => ({
//       id: row.id,
//       name: row.name,
//       revenue: Number(row.revenue) || 0,
//       quantity: Number(row.quantity) || 0,
//     }));

//     return Result.ok(formatted);
//   } catch (error: any) {
//     console.error("Failed to fetch top products:", error);
//     return Result.fail(error?.message || "Failed to fetch top products");
//   }
// }

// // ──────────────────────────────────────────────────────────────
// // 4. Revenue by category
// // ──────────────────────────────────────────────────────────────
// export async function getRevenueByCategory(): Promise<
//   Result<{ category: string; revenue: number }[]>
// > {
//   try {
//     const results = await db("sale_items as si")
//       .join("products as p", "si.product_id", "p.id")
//       .join("product_categories as c", "p.category_id", "c.id")
//       .join("sales as s", "si.sales_id", "s.id")
//       .select(
//         "c.name as category",
//         db.raw("SUM(si.quantity * si.unit_price) as revenue"),
//       )
//       .where("s.status", "completed")
//       .groupBy("c.id", "c.name")
//       .orderByRaw("revenue DESC")
//       .limit(10);

//     const formatted = results.map((row: any) => ({
//       category: row.category,
//       revenue: Number(row.revenue) || 0,
//     }));

//     return Result.ok(formatted);
//   } catch (error: any) {
//     console.error("Failed to fetch revenue by category:", error);
//     return Result.fail(error?.message || "Failed to fetch revenue by category");
//   }
// }

// // ──────────────────────────────────────────────────────────────
// // 5. Recent sales (last N)
// // ──────────────────────────────────────────────────────────────
// // export async function getRecentSales(
// //   limit: number = 10,
// // ): Promise<
// //   Result<{ id: string; customer: string; total: number; date: string }[]>
// // > {
// //   try {
// //     const results = await db("v_sale_summary")
// //       .select(
// //         "sale_id as id",
// //         "customer_name as customer",
// //         "total_amount as total",
// //         "sale_date as date",
// //       )
// //       .where("status", "completed")
// //       .orderBy("sale_date", "desc")
// //       .limit(limit);

// //     const formatted = results.map((row: any) => ({
// //       id: row.id,
// //       customer: row.customer || "Guest",
// //       total: Number(row.total) || 0,
// //       date: format(new Date(row.date), "MMM d, yyyy h:mm a"),
// //     }));

// //     return Result.ok(formatted);
// //   } catch (error: any) {
// //     console.error("Failed to fetch recent sales:", error);
// //     return Result.fail(error?.message || "Failed to fetch recent sales");
// //   }
// // }

// // ──────────────────────────────────────────────────────────────
// // 6. Stock alerts (products below threshold)
// // ──────────────────────────────────────────────────────────────
// export async function getStockAlerts(
//   threshold: number = 5,
// ): Promise<Result<{ id: string; name: string; stock: number }[]>> {
//   try {
//     const results = await db("products")
//       .select("id", "name", "stock_quantity as stock")
//       .where("stock_quantity", "<", threshold)
//       .orderBy("stock_quantity", "asc");

//     return Result.ok(results);
//   } catch (error: any) {
//     console.error("Failed to fetch stock alerts:", error);
//     return Result.fail(error?.message || "Failed to fetch stock alerts");
//   }
// }

// // ──────────────────────────────────────────────────────────────
// // 7. Top products by quantity sold (for pie chart)
// // ──────────────────────────────────────────────────────────────
// export async function getTopProductsByQuantity(
//   limit: number = 10,
// ): Promise<Result<{ id: string; name: string; quantity: number }[]>> {
//   try {
//     const results = await db("sale_items as si")
//       .join("products as p", "si.product_id", "p.id")
//       .join("sales as s", "si.sales_id", "s.id")
//       .select("p.id", "p.name", db.raw("SUM(si.quantity) as quantity"))
//       .where("s.status", "completed")
//       .groupBy("p.id", "p.name")
//       .orderByRaw("quantity DESC")
//       .limit(limit);

//     const formatted = results.map((row: any) => ({
//       id: row.id,
//       name: row.name,
//       quantity: Number(row.quantity) || 0,
//     }));

//     return Result.ok(formatted);
//   } catch (error) {
//     console.error("Failed to fetch top products by quantity:", error);
//     return Result.fail("Failed to fetch top products by quantity");
//   }
// }

// // ──────────────────────────────────────────────────────────────
// // 8. Activity Heatmap & Peak Hours (Last 30 Days)
// // ──────────────────────────────────────────────────────────────

// export interface HourlyActivityPoint {
//   hour: number;
//   hourLabel: string;
//   timeSlot: string;
//   salesCount: number;
//   inventoryUpdates: number;
//   totalActivity: number;
//   salesRevenue: number;
// }

// export interface DayHourHeatmapCell {
//   day: string;
//   dayShort: string;
//   dayIndex: number;
//   hour: number;
//   hourLabel: string;
//   salesCount: number;
//   inventoryUpdates: number;
//   totalActivity: number;
//   salesRevenue: number;
// }

// export interface ActivityHeatmapData {
//   hourlyDistribution: HourlyActivityPoint[];
//   dayHourMatrix: DayHourHeatmapCell[];
//   summary: {
//     peakSalesHour: string;
//     peakSalesCount: number;
//     peakInventoryHour: string;
//     peakInventoryCount: number;
//     busiestDay: string;
//     busiestDayActivity: number;
//     totalSalesEvents: number;
//     totalInventoryEvents: number;
//     totalCombinedActivity: number;
//     totalSalesRevenue: number;
//   };
// }

// export async function getActivityHeatmapData(
//   days: number = 30,
// ): Promise<Result<ActivityHeatmapData>> {
//   try {
//     const now = new Date();
//     const startDate = startOfDay(subDays(now, days - 1));
//     const endDate = endOfDay(now);

//     const startIso = startDate.toISOString();
//     const endIso = endDate.toISOString();

//     // 1. Fetch Sales over the period
//     let salesRows: any[] = [];
//     try {
//       salesRows = await db("v_sale_summary")
//         .select("sale_id", "sale_date", "total_amount", "status")
//         .where("status", "completed")
//         .andWhereBetween("sale_date", [startIso, endIso]);
//     } catch {
//       // Fallback to direct sales table if view is not accessible
//       try {
//         salesRows = await db("sales")
//           .select("id as sale_id", "created_at as sale_date", "total_amount", "status")
//           .where("status", "completed")
//           .andWhereBetween("created_at", [startIso, endIso]);
//       } catch {
//         salesRows = [];
//       }
//     }

//     // 2. Fetch Inventory Updates & Restocks over the period
//     let inventoryEventRows: any[] = [];
//     try {
//       const auditRows = await db("audit_logs")
//         .select("id", "entity_type", "action", "created_at")
//         .whereIn("entity_type", ["inventory", "products", "stocks"])
//         .andWhereBetween("created_at", [startIso, endIso]);

//       inventoryEventRows.push(...auditRows);
//     } catch {
//       // ignore
//     }

//     try {
//       const invRecords = await db("inventory")
//         .select("id", "updated_at", "created_at", "restock_date")
//         .whereBetween("updated_at", [startIso, endIso]);

//       inventoryEventRows.push(...invRecords);
//     } catch {
//       // ignore
//     }

//     // Days representation
//     const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
//     const fullDayNames = [
//       "Sunday",
//       "Monday",
//       "Tuesday",
//       "Wednesday",
//       "Thursday",
//       "Friday",
//       "Saturday",
//     ];

//     // Helper for Hour Label
//     const formatHourLabel = (h: number) => {
//       if (h === 0) return "12 AM";
//       if (h === 12) return "12 PM";
//       return h < 12 ? `${h} AM` : `${h - 12} PM`;
//     };

//     const formatTimeSlot = (h: number) => {
//       const start = String(h).padStart(2, "0") + ":00";
//       const end = String((h + 1) % 24).padStart(2, "0") + ":00";
//       return `${start} - ${end}`;
//     };

//     // Initialize 24-hour distribution map
//     const hourlyMap = new Map<
//       number,
//       { salesCount: number; inventoryUpdates: number; salesRevenue: number }
//     >();

//     for (let h = 0; h < 24; h++) {
//       hourlyMap.set(h, { salesCount: 0, inventoryUpdates: 0, salesRevenue: 0 });
//     }

//     // Initialize 7-day x 24-hour matrix map: "dayIndex-hour" -> stats
//     const dayHourMap = new Map<
//       string,
//       { salesCount: number; inventoryUpdates: number; salesRevenue: number }
//     >();

//     for (let d = 0; d < 7; d++) {
//       for (let h = 0; h < 24; h++) {
//         dayHourMap.set(`${d}-${h}`, {
//           salesCount: 0,
//           inventoryUpdates: 0,
//           salesRevenue: 0,
//         });
//       }
//     }

//     // Aggregate Sales by Day and Hour
//     let totalSalesRevenue = 0;
//     let totalSalesEvents = 0;

//     for (const sale of salesRows) {
//       const dateVal = sale.sale_date || sale.created_at;
//       if (!dateVal) continue;

//       const dateObj = new Date(dateVal);
//       if (isNaN(dateObj.getTime())) continue;

//       const hour = dateObj.getHours();
//       const dayIndex = dateObj.getDay();
//       const amount = Number(sale.total_amount) || 0;

//       totalSalesEvents++;
//       totalSalesRevenue += amount;

//       const hourEntry = hourlyMap.get(hour);
//       if (hourEntry) {
//         hourEntry.salesCount += 1;
//         hourEntry.salesRevenue += amount;
//       }

//       const matrixEntry = dayHourMap.get(`${dayIndex}-${hour}`);
//       if (matrixEntry) {
//         matrixEntry.salesCount += 1;
//         matrixEntry.salesRevenue += amount;
//       }
//     }

//     // Aggregate Inventory Updates by Day and Hour
//     let totalInventoryEvents = 0;

//     for (const inv of inventoryEventRows) {
//       const dateVal = inv.created_at || inv.updated_at || inv.restock_date;
//       if (!dateVal) continue;

//       const dateObj = new Date(dateVal);
//       if (isNaN(dateObj.getTime())) continue;

//       const hour = dateObj.getHours();
//       const dayIndex = dateObj.getDay();

//       totalInventoryEvents++;

//       const hourEntry = hourlyMap.get(hour);
//       if (hourEntry) {
//         hourEntry.inventoryUpdates += 1;
//       }

//       const matrixEntry = dayHourMap.get(`${dayIndex}-${hour}`);
//       if (matrixEntry) {
//         matrixEntry.inventoryUpdates += 1;
//       }
//     }

//     // Build hourlyDistribution array
//     const hourlyDistribution: HourlyActivityPoint[] = [];
//     let maxSalesHour = 0;
//     let maxSalesCount = 0;
//     let maxInvHour = 0;
//     let maxInvCount = 0;

//     for (let h = 0; h < 24; h++) {
//       const entry = hourlyMap.get(h)!;
//       const totalActivity = entry.salesCount + entry.inventoryUpdates;

//       if (entry.salesCount > maxSalesCount) {
//         maxSalesCount = entry.salesCount;
//         maxSalesHour = h;
//       }

//       if (entry.inventoryUpdates > maxInvCount) {
//         maxInvCount = entry.inventoryUpdates;
//         maxInvHour = h;
//       }

//       hourlyDistribution.push({
//         hour: h,
//         hourLabel: formatHourLabel(h),
//         timeSlot: formatTimeSlot(h),
//         salesCount: entry.salesCount,
//         inventoryUpdates: entry.inventoryUpdates,
//         totalActivity,
//         salesRevenue: entry.salesRevenue,
//       });
//     }

//     // Build dayHourMatrix
//     const dayHourMatrix: DayHourHeatmapCell[] = [];
//     const dayTotals = [0, 0, 0, 0, 0, 0, 0];

//     for (let d = 0; d < 7; d++) {
//       for (let h = 0; h < 24; h++) {
//         const entry = dayHourMap.get(`${d}-${h}`)!;
//         const total = entry.salesCount + entry.inventoryUpdates;
//         dayTotals[d] += total;

//         dayHourMatrix.push({
//           day: fullDayNames[d],
//           dayShort: dayNames[d],
//           dayIndex: d,
//           hour: h,
//           hourLabel: formatHourLabel(h),
//           salesCount: entry.salesCount,
//           inventoryUpdates: entry.inventoryUpdates,
//           totalActivity: total,
//           salesRevenue: entry.salesRevenue,
//         });
//       }
//     }

//     // Find busiest day
//     let busiestDayIdx = 0;
//     let busiestDayTotal = 0;
//     for (let d = 0; d < 7; d++) {
//       if (dayTotals[d] > busiestDayTotal) {
//         busiestDayTotal = dayTotals[d];
//         busiestDayIdx = d;
//       }
//     }

//     return Result.ok({
//       hourlyDistribution,
//       dayHourMatrix,
//       summary: {
//         peakSalesHour: formatHourLabel(maxSalesHour),
//         peakSalesCount: maxSalesCount,
//         peakInventoryHour: formatHourLabel(maxInvHour),
//         peakInventoryCount: maxInvCount,
//         busiestDay: fullDayNames[busiestDayIdx],
//         busiestDayActivity: busiestDayTotal,
//         totalSalesEvents,
//         totalInventoryEvents,
//         totalCombinedActivity: totalSalesEvents + totalInventoryEvents,
//         totalSalesRevenue,
//       },
//     });
//   } catch (error: any) {
//     console.error("Failed to fetch activity heatmap data:", error);
//     return Result.fail(
//       error?.message || "Failed to fetch activity heatmap data",
//     );
//   }
// }
