import { NextResponse } from "next/server";
import db from "@/db/knex";
import {
  getTenantStoreProfile,
  parseSaleDetails,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const store = await getTenantStoreProfile(tenantId, session);
    const defaultThreshold = Math.max(1, store.stockAlertThreshold || 5);

    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    const [salesRows, products] = await Promise.all([
      db("sales")
        .where("tenant_id", tenantId)
        .where("date", ">=", yesterdayStart.toISOString())
        .select("total_amount", "status", "details", "date"),
      db("v_product_catalog")
        .where("tenant_id", tenantId)
        .select(
          "product_id",
          "product_name",
          "category_name",
          "barcode",
          "stock_quantity",
          "low_stock_threshold",
          "cost_price",
          "unit_price",
          "active",
        ),
    ]);

    let todayRevenue = 0;
    let todayOrders = 0;
    let yesterdayRevenue = 0;

    for (const s of salesRows) {
      const details = parseSaleDetails(s.details);
      const isRefunded = s.status === "failed" || Boolean(details.refunded);
      if (isRefunded || s.status !== "completed") continue;

      const d = new Date(s.date);
      const amt = Number(s.total_amount ?? 0);
      if (d >= todayStart) {
        todayRevenue += amt;
        todayOrders += 1;
      } else if (d >= yesterdayStart && d < todayStart) {
        yesterdayRevenue += amt;
      }
    }

    let totalInventoryValuation = 0;
    let totalStockUnits = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    const alerts: Array<{
      id: string;
      name: string;
      categoryName: string;
      barcode: string;
      stock: number;
      threshold: number;
      costPrice: number;
      sellingPrice: number;
      severity: "critical" | "warning" | "healthy";
    }> = [];

    for (const p of products) {
      const stock = Number(p.stock_quantity ?? 0);
      const costPrice = Number(p.cost_price ?? 0);
      const sellingPrice = Number(p.unit_price ?? 0);
      const threshold = Number(p.low_stock_threshold ?? defaultThreshold);

      totalStockUnits += stock;
      totalInventoryValuation += stock * sellingPrice;

      if (stock <= 0) {
        outOfStockCount += 1;
        alerts.push({
          id: String(p.product_id),
          name: String(p.product_name),
          categoryName: String(p.category_name || "General"),
          barcode: String(p.barcode || ""),
          stock,
          threshold,
          costPrice,
          sellingPrice,
          severity: "critical",
        });
      } else if (stock <= threshold) {
        lowStockCount += 1;
        alerts.push({
          id: String(p.product_id),
          name: String(p.product_name),
          categoryName: String(p.category_name || "General"),
          barcode: String(p.barcode || ""),
          stock,
          threshold,
          costPrice,
          sellingPrice,
          severity: stock <= Math.max(1, Math.floor(threshold / 2)) ? "critical" : "warning",
        });
      }
    }

    alerts.sort((a, b) => a.stock - b.stock);

    return NextResponse.json({
      kpis: {
        todayRevenue,
        todayOrders,
        todayAov: todayOrders > 0 ? todayRevenue / todayOrders : 0,
        yesterdayRevenue,
        todayVsYesterdayRevenueDelta: todayRevenue - yesterdayRevenue,
        totalInventoryValuation,
        totalProductsCount: products.length,
        totalStockUnits,
        outOfStockCount,
        lowStockCount,
        lastSyncedAt: new Date().toISOString(),
      },
      lowStockAlerts: alerts.slice(0, 25),
    });
  });
}
