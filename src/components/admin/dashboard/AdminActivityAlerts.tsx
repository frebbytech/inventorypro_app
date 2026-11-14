"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  ExternalLink,
  ShieldAlert,
  Clock,
  User,
} from "lucide-react";
import { AdminActivityItem } from "@/actions/dashboard";
import { formatDistanceToNow, parseISO } from "date-fns";
import Link from "next/link";

interface AdminActivityAlertsProps {
  activities: AdminActivityItem[];
  unreadCount?: number;
}

export function AdminActivityAlerts({
  activities = [],
  unreadCount = 0,
}: AdminActivityAlertsProps) {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return (
          <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
        );
      case "warning":
        return (
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        );
      case "success":
        return (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        );
      default:
        return <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return "recently";
    }
  };

  const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
    `${n} ${n === 1 ? singular : plural}`;

  return (
    <Card className="rounded-xl border bg-card shadow-xs">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold tracking-tight sm:text-lg">
                System Activity & Audit Stream
              </CardTitle>
            </div>
            <CardDescription className="text-sm">
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0
                  ? `${pluralize(unreadCount, "unread update")} · admin actions and audits`
                  : "Recent admin actions and audits"}
              </p>
            </CardDescription>
          </div>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-sm font-semibold"
          >
            <Link href="/logs">
              <span>View Logs</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        {activities.length > 0 ? (
          <div className="relative space-y-4 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
            {activities.map((item) => (
              <div
                key={item.id}
                className="relative flex items-start gap-3.5 pl-1"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background shadow-xs z-10">
                  {getSeverityIcon(item.severity)}
                </div>

                <div className="min-w-0 flex-1 space-y-0.5 rounded-lg border bg-card/40 p-3 text-sm transition-all hover:bg-card">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-foreground truncate">
                      {item.title}
                    </p>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {formatTime(item.createdAt)}
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      {item.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {item.userName}
                    </span>
                    <span>•</span>
                    <Badge
                      variant="outline"
                      className="text-xs py-0 px-1 capitalize"
                    >
                      {item.type}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No system activity logged in this period
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// "use client";

// import Link from "next/link";
// import { formatDistanceToNow } from "date-fns";

// import type { AdminActivityItem } from "@/actions/dashboard";
// import { Button } from "@/components/ui/button";
// import { cn } from "@/lib/utils";

// interface AdminActivityAlertsProps {
//   activities: AdminActivityItem[];
//   unreadCount?: number;
// }

// /* -------------------------------------------------------------------------- */
// /*  Helpers (module scope)                                                    */
// /* -------------------------------------------------------------------------- */

// const SEVERITY_DOT: Record<string, string> = {
//   critical: "bg-rose-500",
//   warning: "bg-amber-500",
//   success: "bg-emerald-500",
//   info: "bg-sky-500",
// };

// const pluralize = (n: number, singular: string, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;

// function formatTime(value: string) {
//   const date = new Date(value);
//   if (Number.isNaN(date.getTime())) return "recently";
//   return formatDistanceToNow(date, { addSuffix: true });
// }

// /* -------------------------------------------------------------------------- */
// /*  Component                                                                 */
// /* -------------------------------------------------------------------------- */

// export function AdminActivityAlerts({ activities = [], unreadCount = 0 }: AdminActivityAlertsProps) {
//   return (
//     <section className="rounded-xl border bg-card" aria-labelledby="admin-activity-title">
//       <header className="flex items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
//         <div className="space-y-1">
//           <h2 id="admin-activity-title" className="text-base font-semibold tracking-tight">
//             Activity
//           </h2>
//           <p className="text-sm text-muted-foreground">
//             {unreadCount > 0
//               ? `${pluralize(unreadCount, "unread update")} · admin actions and audits`
//               : "Recent admin actions and audits"}
//           </p>
//         </div>

//         <Button asChild variant="outline" size="sm">
//           <Link href="/logs">View logs</Link>
//         </Button>
//       </header>

//       {activities.length === 0 ? (
//         <p className="px-5 py-12 text-center text-sm text-muted-foreground sm:px-6">
//           No activity in this period.
//         </p>
//       ) : (
//         <ul className="divide-y">
//           {activities.map((item) => (
//             <li key={item.id} className="flex items-start gap-3 px-5 py-3.5 sm:px-6">
//               <span
//                 aria-hidden
//                 className={cn(
//                   "mt-1.5 size-1.5 shrink-0 rounded-full",
//                   SEVERITY_DOT[item.severity] ?? SEVERITY_DOT.info
//                 )}
//               />

//               <div className="min-w-0 flex-1 space-y-0.5">
//                 <div className="flex items-baseline justify-between gap-3">
//                   <p className="truncate text-sm font-medium">{item.title}</p>
//                   <time
//                     dateTime={item.createdAt}
//                     className="shrink-0 text-sm text-muted-foreground"
//                     title={new Date(item.createdAt).toLocaleString()}
//                   >
//                     {formatTime(item.createdAt)}
//                   </time>
//                 </div>

//                 {item.description && (
//                   <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
//                 )}

//                 <p className="text-sm text-muted-foreground">
//                   {item.userName}
//                   {item.type && <span> · {item.type}</span>}
//                 </p>
//               </div>
//             </li>
//           ))}
//         </ul>
//       )}
//     </section>
//   );
// }
