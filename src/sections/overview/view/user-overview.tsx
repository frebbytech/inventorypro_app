import type { ComponentProps, ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  Bell,
  CalendarDays,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import SalesOverTimeChart from "@/components/charts/SalesOverTimeChart";
import TopFiveChart from "@/components/charts/TopFive";
import CountUp from "@/components/count-up";
import PageContainer from "@/components/layout/page-container";
import { currencyFormatter } from "@/config/formatter";
import { cn } from "@/lib/utils";
import type { TotalCounts } from "@/types/globals";
import { BarGraph } from "../bar-graph";
import { RecentSales } from "../recent-sales";

/* -------------------------------------------------------------------------- */
/*  Building blocks (server components: no state, no hooks)                   */
/* -------------------------------------------------------------------------- */

function KpiCell({
  label,
  icon: Icon,
  className,
  children,
}: {
  label: string;
  icon: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col bg-card p-5 sm:p-6", className)}>
      <dt className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
        {label}
        <Icon aria-hidden className="size-4" />
      </dt>
      {children}
    </div>
  );
}

function Figure({
  size = "md",
  children,
}: {
  size?: "md" | "lg";
  children: ReactNode;
}) {
  return (
    <dd
      className={cn(
        "mt-3 font-semibold tracking-tight text-foreground tabular-nums",
        size === "lg" ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl",
      )}
    >
      {children}
    </dd>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <dd className="mt-auto pt-4 text-sm text-muted-foreground">{children}</dd>
  );
}

function Panel({
  title,
  description,
  className,
  bodyClassName = "p-5",
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("flex flex-col rounded-xl border bg-card", className)}
    >
      <header className="border-b px-5 py-4">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </header>
      <div className={cn("flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

function Empty({ children, ...props }: ComponentProps<"p">) {
  return (
    <p
      className="px-5 py-10 text-center text-sm text-muted-foreground"
      {...props}
    >
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function UserOverViewPage({
  data,
  name,
}: {
  data: TotalCounts;
  name: string;
}) {
  const salesLastSevenDays = data.salesForLastSevenDays ?? [];
  const topProducts = data.topFiveSoldProducts ?? [];
  // Most urgent first: out of stock, then the lowest stock.
  const stockAlerts = [...(data.stockAlerts ?? [])].sort(
    (a, b) => a.stock - b.stock,
  );
  const lowStockCount = Number(data.lowStockCount) || 0;
  const unreadCount = Number(data.unreadNotifications) || 0;

  return (
    <PageContainer scrollable>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Hi {name}</h1>
          <p className="text-sm text-muted-foreground">
            {" "}
            Get a comprehensive overview of key metrics, trends, and business
            performance at a glance.
          </p>
        </header>

        {/* Key figures. Each row fills 12 columns (2 on sm), or the grid gap shows as a dark block. */}
        <section aria-label="Key figures">
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-12">
            <KpiCell
              label="Total sales"
              icon={Banknote}
              className="sm:col-span-2 lg:col-span-6 lg:p-8"
            >
              <Figure size="lg">
                <CountUp value={Number(data.totalSalesAmount) || 0} />
              </Figure>
            </KpiCell>

            <KpiCell label="Today" icon={TrendingUp} className="lg:col-span-3">
              <Figure>{currencyFormatter(data.todaySales)}</Figure>
            </KpiCell>

            <KpiCell
              label="This month"
              icon={CalendarDays}
              className="lg:col-span-3"
            >
              <Figure>{currencyFormatter(data.thisMonthSales)}</Figure>
            </KpiCell>

            <KpiCell
              label="Low stock items"
              icon={AlertTriangle}
              className="lg:col-span-6"
            >
              <Figure>{lowStockCount}</Figure>
              <Caption>
                {lowStockCount === 0
                  ? "Everything is stocked"
                  : "Products running low or out"}
              </Caption>
            </KpiCell>

            <KpiCell
              label="Unread notifications"
              icon={Bell}
              className="lg:col-span-6"
            >
              <Figure>{unreadCount}</Figure>
              <Caption>
                {unreadCount === 0
                  ? "You're all caught up"
                  : "Waiting in your notifications"}
              </Caption>
            </KpiCell>
          </dl>
        </section>

        {/* Sales performance */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel
            title="Sales over time"
            description="The last 7 days."
            className="lg:col-span-2"
          >
            {salesLastSevenDays.length > 0 ? (
              <SalesOverTimeChart salesForLastSevenDays={salesLastSevenDays} />
            ) : (
              <Empty>No sales in the last 7 days.</Empty>
            )}
          </Panel>

          <Panel title="Top products" description="By quantity sold.">
            {topProducts.length > 0 ? (
              <TopFiveChart topFiveSoldProducts={topProducts} />
            ) : (
              <Empty>No sales recorded yet.</Empty>
            )}
          </Panel>
        </div>

        <Panel title="Monthly sales" description="Sales for each month.">
          <BarGraph data={data.totalMonthlySales} />
        </Panel>

        {/* Recent activity */}
        <div className="grid gap-6 md:grid-cols-2">
          <Panel
            title="Recent sales"
            description="The latest customer transactions."
            bodyClassName="p-0"
          >
            <RecentSales data={data.topFiveRecentSales} />
          </Panel>

          <Panel
            title="Stock alerts"
            description="Products that need restocking."
            bodyClassName="p-0"
          >
            {stockAlerts.length > 0 ? (
              // Focusable so keyboard users can scroll a long list.
              <div
                role="region"
                aria-label="Products that need restocking"
                tabIndex={0}
                className="max-h-80 overflow-y-auto rounded-b-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ul className="divide-y">
                  {stockAlerts.map((item) => {
                    const isOut = item.stock <= 0;
                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-4 px-5 py-3"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {item.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">
                          <span
                            aria-hidden
                            className={cn(
                              "size-1.5 rounded-full",
                              isOut ? "bg-rose-500" : "bg-amber-500",
                            )}
                          />
                          {isOut ? "Out of stock" : `${item.stock} left`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <Empty>All stock levels are healthy.</Empty>
            )}
          </Panel>
        </div>
      </div>
    </PageContainer>
  );
}
