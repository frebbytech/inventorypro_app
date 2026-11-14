"use client";

import { useRouter } from "next/navigation";
import { BarChart3, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface AdminDashboardEmptyStateProps {
  title?: string;
  description?: string;
  onRefresh?: () => void;
}

export function AdminDashboardEmptyState({
  title = "No data yet",
  description = "Once you start recording sales and inventory activity, your dashboard will come to life here.",
  onRefresh,
}: AdminDashboardEmptyStateProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-[60vh] w-full">
      <Card className="max-w-lg w-full border-dashed bg-muted/20">
        <CardContent className="flex flex-col items-center text-center py-12 px-6">
          {/* Icon */}
          <div className="relative mb-6">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-10 w-10 text-primary" />
            </div>
            <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-primary/60" />
          </div>

          <h3 className="text-xl font-semibold mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {description}
          </p>

          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              variant="default"
              onClick={() => (onRefresh ? onRefresh() : router.refresh())}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/admin/product")}
            >
              Add Products
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
