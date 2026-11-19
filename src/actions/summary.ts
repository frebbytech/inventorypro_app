/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { TotalCounts } from "@/types/globals";
import { checkRole } from "@/utils/roles";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { getCurrentUser } from "./_actions";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

export type TopProducts = {
  browser: number | string;
  visitors: number | string;
  fill: string;
};

// ──────────────────────────────────────────────────────────────
// Global Sales Summary (admin or all)
// ──────────────────────────────────────────────────────────────

const CURRENT_MONTH_EXPR = "CAST(strftime('%m', date) AS INTEGER)";
const CURRENT_YEAR_EXPR = "CAST(strftime('%Y', date) AS INTEGER)";

export async function getSalesSummary() {
  try {
    const currentUser = await getCurrentUser();
    const userId = currentUser?.id;
    if (!userId) throw new Error("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    // Counts for dashboard cards
    const countProducts = await db("products")
      .where("tenant_id", tenantId)
      .count("id as count")
      .first();
    const countSuppliers = await db("suppliers")
      .where("tenant_id", tenantId)
      .count("id as count")
      .first();
    const countUsers = await db("users")
      .where("tenant_id", tenantId)
      .count("id as count")
      .first();

    // Top 5 recent sales – from v_sale_summary view
    const topFiveRecentSales = await db("v_sale_summary")
      .select(
        "sale_id as id",
        "customer_name",
        "user_name",
        "sale_date",
        "total_amount",
        "payment_mode",
        "status",
        "item_count",
      )
      .where("tenant_id", tenantId)
      .andWhere("status", "completed")
      .orderBy("sale_date", "desc")
      .limit(5);

    // Today's sales total
    const todaySales = await db("sales")
      .sum("total_amount as total")
      .where("tenant_id", tenantId)
      .andWhereRaw("DATE(date) = date('now')")
      .first();

    // This month's sales total
    const thisMonthSales = await db("sales")
      .sum("total_amount as total")
      .where("tenant_id", tenantId)
      .andWhereRaw(
        "strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')",
      )
      .first();

    // Total sales all time
    const totalSalesAmount = await db("sales")
      .where("tenant_id", tenantId)
      .sum("total_amount as total")
      .first();

    // Monthly sales for current year
    const monthSales = await db("sales")
      .where("tenant_id", tenantId)
      .select(
        db.raw("CAST(strftime('%m', date) AS INTEGER) AS month"),
        db.raw("strftime('%Y', date) AS year"),
      )
      .sum("total_amount AS total_sales")
      .whereRaw("strftime('%Y', date) = strftime('%Y', 'now', 'localtime')")
      .groupByRaw("strftime('%Y', date), strftime('%m', date)")
      .orderByRaw("strftime('%Y', date) ASC, strftime('%m', date) ASC");

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
      const monthNumber = index + 1;
      const sales = monthSales.find(
        (s: any) => Number(s.month) === monthNumber,
      );
      return {
        month,
        value: sales ? Number(sales.total_sales) : 0,
      };
    });

    const counts: TotalCounts = {
      products: Number(countProducts?.count) || 0,
      suppliers: Number(countSuppliers?.count) || 0,
      users: Number(countUsers?.count) || 0,
      topFiveRecentSales: topFiveRecentSales || [],
      todaySales: Number(todaySales?.total) || 0,
      thisMonthSales: Number(thisMonthSales?.total) || 0,
      totalSalesAmount: Number(totalSalesAmount?.total) || 0,
      topFiveSoldProducts: [],
      totalMonthlySales: totalMonthlySales || [],
    };

    return counts;
  } catch (error: any) {
    console.error("Failed to fetch sales summary:", error);
    return {
      products: 0,
      suppliers: 0,
      users: 0,
      topFiveRecentSales: [],
      todaySales: 0,
      thisMonthSales: 0,
      totalSalesAmount: 0,
      topFiveSoldProducts: [],
      totalMonthlySales: [],
    };
  }
}

// ──────────────────────────────────────────────────────────────
// User-specific Sales Summary
// ──────────────────────────────────────────────────────────────

export async function getSalesSummaryByUser(userId: string) {
  try {
    const isMember = await checkRole("member");
    const currentUser = await getCurrentUser();
    if (!isMember || !currentUser?.id || !userId) {
      throw new Error("Not authorized");
    }

    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;
    const effectiveUserId =
      currentUser.role === "admin" ? userId : currentUser.id;

    // Top 5 recent sales for this user
    const topFiveRecentSales = await db("v_sale_summary")
      .select(
        "sale_id as id",
        "customer_name",
        "user_id",
        "user_name",
        "sale_date",
        "total_amount",
        "payment_mode",
        "status",
        "item_count",
      )
      .where({
        tenant_id: tenantId,
        user_id: effectiveUserId,
        status: "completed",
      })
      .orderBy("sale_date", "desc")
      .limit(5);

    // Today's sales for user
    const todaySales = await db("sales")
      .sum("total_amount as total")
      .where({ tenant_id: tenantId, user_id: effectiveUserId })
      .andWhereRaw("DATE(date) = date('now')")
      .first();

    // This month's sales for user
    const thisMonthSales = await db("sales")
      .sum("total_amount as total")
      .where({ tenant_id: tenantId, user_id: effectiveUserId })
      .andWhereRaw(
        `${CURRENT_MONTH_EXPR} = CAST(strftime('%m', 'now') AS INTEGER)`,
      )
      .andWhereRaw(
        `${CURRENT_YEAR_EXPR} = CAST(strftime('%Y', 'now') AS INTEGER)`,
      )
      .first();

    // Total sales for user all time
    const totalSalesAmount = await db("sales")
      .sum("total_amount as total")
      .where({ tenant_id: tenantId, user_id: effectiveUserId })
      .first();

    const lowStockProducts = await db("products")
      .where("tenant_id", tenantId)
      .andWhere("stock_quantity", "<", 5)
      .count("id as count")
      .first()
      .then((r: any) => Number(r?.count) || 0);

    const stockAlert = await db("products")
      .select("id", "name", "stock_quantity as stock")
      .where("tenant_id", tenantId)
      .andWhere("stock_quantity", "<", 5)
      .orderBy("stock_quantity", "asc");

    // Unread notifications for the current user
    const unreadNotifications = await db("notifications")
      .where({ tenant_id: tenantId, user_id: effectiveUserId, is_read: false })
      .count("id as count")
      .first()
      .then((r: any) => Number(r?.count) || 0);

    // Top 5 sold products for this user (via sales made by this user)
    const topProducts = await db("v_sale_items_detail")
      .select(
        "product_id as id",
        "product_name as name",
        "status",
        "user_id",
        db.raw("SUM(quantity) as quantity"),
      )
      .where({
        tenant_id: tenantId,
        user_id: effectiveUserId,
        status: "completed",
      })
      .groupBy("product_id", "product_name")
      .orderByRaw("quantity DESC")
      .limit(10);

    const topFiveSoldProducts = topProducts.map((row: any) => ({
      id: row.id,
      name: row.name,
      quantity: Number(row.quantity) || 0,
      revenue: 0,
    }));

    // Monthly sales for current year for this user (SQLite Native Optimized)
    const monthSales = await db("sales")
      .select(
        db.raw("CAST(strftime('%m', date) AS INTEGER) AS month"),
        db.raw("strftime('%Y', date) AS year"),
      )
      .sum("total_amount AS total_sales")
      .where({ tenant_id: tenantId, user_id: effectiveUserId })
      .whereRaw("strftime('%Y', date) = strftime('%Y', 'now', 'localtime')")
      .groupByRaw("strftime('%Y', date), strftime('%m', date)")
      .orderByRaw("strftime('%Y', date) ASC, strftime('%m', date) ASC");

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
      const monthNumber = index + 1;
      const sales = monthSales.find(
        (s: any) => Number(s.month) === monthNumber,
      );
      return {
        month,
        value: sales ? Number(sales.total_sales) : 0,
      };
    });

    const days = 7;
    const now = new Date();
    const startDate = startOfDay(subDays(now, days - 1));
    const endDate = endOfDay(now);

    const results = await db("v_sale_summary")
      .select(db.raw("date(sale_date) as date_str"))
      .sum({ revenue: "total_amount" })
      .count({ orders: "sale_id" })
      .where({ tenant_id: tenantId, user_id: effectiveUserId, status: "completed" })
      .whereBetween("sale_date", [startDate.toISOString(), endDate.toISOString()])
      .groupByRaw("date(sale_date)")
      .orderByRaw("date(sale_date) ASC");

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

    const counts: TotalCounts = {
      topFiveRecentSales: topFiveRecentSales || [],
      todaySales: Number(todaySales?.total) || 0,
      salesForLastSevenDays: salesForLastSevenDays || [],
      thisMonthSales: Number(thisMonthSales?.total) || 0,
      totalSalesAmount: Number(totalSalesAmount?.total) || 0,
      topFiveSoldProducts: topFiveSoldProducts || [],
      totalMonthlySales: totalMonthlySales || [],
      lowStockCount: lowStockProducts || 0,
      unreadNotifications: unreadNotifications || 0,
      stockAlerts: stockAlert || [],
    };

    return counts;
  } catch (error: any) {
    console.error("Failed to fetch sales summary for user:", error);
    return {
      topFiveRecentSales: [],
      todaySales: 0,
      thisMonthSales: 0,
      totalSalesAmount: 0,
      topFiveSoldProducts: [],
      totalMonthlySales: [],
    };
  }
}
