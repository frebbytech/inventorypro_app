"use client";

import React, { useState } from "react";
import PageContainer from "@/components/layout/page-container";
import { AdminDashboardFullData } from "@/actions/dashboard";
import { AdminDashboardHeader } from "./AdminDashboardHeader";
import { AdminKpiCards } from "./AdminKpiCards";
import { AdminSalesAnalytics } from "./AdminSalesAnalytics";
import { AdminRecentTransactions } from "./AdminRecentTransactions";
import { AdminStockAlerts } from "./AdminStockAlerts";
import { AdminOperationalHeatmap } from "./AdminOperationalHeatmap";
import { AdminActivityAlerts } from "./AdminActivityAlerts";
import { AdminDashboardEmptyState } from "./AdminDashboardEmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Clock,
  Zap,
  Gauge,
} from "lucide-react";

type Timeframe = "7d" | "14d" | "30d" | "thisMonth" | "thisYear" | "all";
type ViewMode = "standard" | "advanced";

interface AdminDashboardViewProps {
  data: AdminDashboardFullData;
  userName: string;
  userRole?: string;
}

export function AdminDashboardView({
  data,
  userName,
  userRole = "Administrator",
}: AdminDashboardViewProps) {
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("7d");
  const [activeTab, setActiveTab] = useState("overview");

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "standard";
    return (localStorage.getItem("dashboard-view") as ViewMode) || "standard";
  });

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("dashboard-view", mode);
    }
  };

  // ⚠️ Null check MUST come before destructuring
  if (!data) {
    return (
      <PageContainer scrollable>
        <AdminDashboardEmptyState />
      </PageContainer>
    );
  }

  const {
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
    serverTime,
  } = data;

  return (
    <PageContainer scrollable>
      <div className="space-y-6 pb-12">
        {/* ── View Mode Switcher (Standard / Advanced) ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center rounded-lg border bg-muted/30 p-1 w-fit">
            <button
              type="button"
              onClick={() => changeViewMode("standard")}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === "standard"
                  ? "bg-primary text-white dark:text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Gauge className="h-4 w-4" />
              Standard
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("advanced")}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === "advanced"
                  ? "bg-primary text-white dark:text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="h-4 w-4" />
              Advanced
            </button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            STANDARD VIEW — simple, focused, essentials only
            ════════════════════════════════════════════════════════ */}
        {viewMode === "standard" && (
          <div className="space-y-6">
            {/* 1. Header */}
            <AdminDashboardHeader
              userName={userName}
              userRole={userRole}
              activeTimeframe={activeTimeframe}
              onTimeframeChange={setActiveTimeframe}
              serverTime={serverTime}
              todayRevenue={metrics.todayRevenue}
            />

            {/* 2. KPI Cards */}
            <AdminKpiCards
              metrics={metrics}
              activeTimeframe={activeTimeframe}
            />

            {/* 3. Recent Transactions (full width) */}
            <AdminRecentTransactions transactions={recentTransactions} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            ADVANCED VIEW — full analytics, inventory, operations
            ════════════════════════════════════════════════════════ */}
        {viewMode === "advanced" && (
          <div className="space-y-6">
            {/* Header + KPIs (still useful context in advanced) */}
            <AdminDashboardHeader
              userName={userName}
              userRole={userRole}
              activeTimeframe={activeTimeframe}
              onTimeframeChange={setActiveTimeframe}
              serverTime={serverTime}
              todayRevenue={metrics.todayRevenue}
            />

            <AdminKpiCards
              metrics={metrics}
              activeTimeframe={activeTimeframe}
            />

            {/* Sub‑tabs (existing structure) */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="space-y-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-2">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="overview">
                    <LayoutDashboard className="mr-2 h-3.5 w-3.5" />
                    <span>Executive Overview</span>
                  </TabsTrigger>
                  <TabsTrigger value="analytics">
                    <TrendingUp className="mr-2 h-3.5 w-3.5" />
                    <span>Sales & Revenue</span>
                  </TabsTrigger>
                  <TabsTrigger value="inventory">
                    <Package className="mr-2 h-3.5 w-3.5" />
                    <span>Inventory Health</span>
                  </TabsTrigger>
                  <TabsTrigger value="operations">
                    <Clock className="mr-2 h-3.5 w-3.5" />
                    <span>Peak Operations</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Overview */}
              <TabsContent value="overview" className="space-y-6 m-0">
                <AdminSalesAnalytics
                  salesOverTime7d={salesOverTime7d}
                  salesOverTime14d={salesOverTime14d}
                  salesOverTime30d={salesOverTime30d}
                  topProductsByRevenue={topProductsByRevenue}
                  topProductsByQuantity={topProductsByQuantity}
                  revenueByCategory={revenueByCategory}
                  totalMonthlySales={totalMonthlySales}
                  globalTimeframe={activeTimeframe}
                />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-8 grid grid-cols-1 gap-6">
                    <AdminRecentTransactions
                      transactions={recentTransactions}
                    />
                    <AdminOperationalHeatmap heatmapData={activityHeatmap} />
                  </div>
                  <div className="space-y-6 lg:col-span-4">
                    <AdminStockAlerts alerts={stockAlerts} />
                    <AdminActivityAlerts
                      activities={recentActivity}
                      unreadCount={metrics.unreadNotifications}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Analytics */}
              <TabsContent value="analytics" className="space-y-6 m-0">
                <AdminSalesAnalytics
                  salesOverTime7d={salesOverTime7d}
                  salesOverTime14d={salesOverTime14d}
                  salesOverTime30d={salesOverTime30d}
                  topProductsByRevenue={topProductsByRevenue}
                  topProductsByQuantity={topProductsByQuantity}
                  revenueByCategory={revenueByCategory}
                  totalMonthlySales={totalMonthlySales}
                  globalTimeframe={activeTimeframe}
                />
                <AdminRecentTransactions transactions={recentTransactions} />
              </TabsContent>

              {/* Inventory */}
              <TabsContent value="inventory" className="space-y-6 m-0">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-6">
                    <AdminStockAlerts alerts={stockAlerts} />
                  </div>
                  <div className="lg:col-span-6">
                    <AdminActivityAlerts
                      activities={recentActivity}
                      unreadCount={metrics.unreadNotifications}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Operations */}
              <TabsContent value="operations" className="space-y-6 m-0">
                <AdminOperationalHeatmap heatmapData={activityHeatmap} />
                <AdminActivityAlerts
                  activities={recentActivity}
                  unreadCount={metrics.unreadNotifications}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
