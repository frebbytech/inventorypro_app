"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  FileBarChart2,
  RefreshCw,
  ShoppingBag,

} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

interface AdminDashboardHeaderProps {
  userName: string;
  userRole?: string;
  activeTimeframe: "7d" | "14d" | "30d" | "thisMonth" | "thisYear" | "all";
  onTimeframeChange: (timeframe: "7d" | "14d" | "30d" | "thisMonth" | "thisYear" | "all") => void;
  serverTime?: string;
  todayRevenue?: number;
}

export function AdminDashboardHeader({
  userName,
  userRole = "Administrator",
  activeTimeframe,
  onTimeframeChange,
  serverTime,
  todayRevenue,
}: AdminDashboardHeaderProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Dashboard metrics synchronized successfully", {
        description: "All live figures and store data are up to date.",
      });
    }, 600);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const currentDateFormatted = format(new Date(), "EEEE, MMMM d, yyyy");

  return (
    <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 transition-all sm:p-6">
      {/* Top Banner Row */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 px-2.5 py-0.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              LIVE OPERATIONS
            </Badge>

            <span className="text-sm text-muted-foreground">•</span>
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>{currentDateFormatted}</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {getGreeting()}, <span className="text-primary">{userName || "Admin"}</span> 
          </h1>
          <p className="text-sm text-muted-foreground">
            Executive performance intelligence, real-time sales telemetry, and store health summary.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 sm:self-start lg:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-9 gap-1.5 border-border/80 bg-background/80 px-3 text-sm font-medium shadow-xs hover:bg-accent"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            <span>{isRefreshing ? "Updating..." : "Sync"}</span>
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-border/80 bg-background/80 px-3.5 text-sm font-medium shadow-xs hover:bg-accent"
          >
            <Link href="/admin/summary">
              <FileBarChart2 className="h-3.5 w-3.5 text-primary" />
              <span>Sales Report</span>
            </Link>
          </Button>


          <Button
            asChild
            size="sm"
            className="h-9 gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow"
          >
            <Link href="/sales">
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>POS / New Sale</span>
              <span className="hidden rounded bg-primary-foreground/20 px-1 py-0.2 text-[10px] uppercase font-mono sm:inline-block">
                POS
              </span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Global Timeframe Bar */}
      <div className="flex flex-col gap-2.5 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        
          <span></span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 p-1">
          {[
            { id: "7d", label: "Last 7 Days" },
            { id: "14d", label: "Last 14 Days" },
            { id: "30d", label: "Last 30 Days" },
            { id: "thisMonth", label: "This Month" },
            { id: "thisYear", label: "This Year" },
            { id: "all", label: "All Time" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onTimeframeChange(item.id as any)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-all ${
                activeTimeframe === item.id
                  ? "bg-background text-primary shadow-xs font-semibold"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
