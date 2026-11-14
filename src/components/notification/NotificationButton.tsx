"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types/globals";

/* -------------------------------------------------------------------------- */
/*  Query keys & cache helpers (module scope)                                 */
/* -------------------------------------------------------------------------- */

const ROOT_KEY = ["notifications"] as const;
const UNREAD_KEY = [...ROOT_KEY, "unread"] as const;
const LIST_KEY = [...ROOT_KEY, "list"] as const;
const LIST_LIMIT = 50;

interface ReadContext {
  previousList?: Notification[];
  previousUnread?: number;
}

/** Marks one notification (or all of them) as read in the cache, and returns what to roll back to. */
async function markReadInCache(queryClient: QueryClient, target: string | "all"): Promise<ReadContext> {
  await queryClient.cancelQueries({ queryKey: ROOT_KEY });

  const previousList = queryClient.getQueryData<Notification[]>(LIST_KEY);
  const previousUnread = queryClient.getQueryData<number>(UNREAD_KEY);

  if (previousList) {
    queryClient.setQueryData<Notification[]>(
      LIST_KEY,
      previousList.map((n) => (target === "all" || n.id === target ? { ...n, is_read: true } : n))
    );
  }
  if (previousUnread !== undefined) {
    queryClient.setQueryData<number>(
      UNREAD_KEY,
      target === "all" ? 0 : Math.max(0, previousUnread - 1)
    );
  }

  return { previousList, previousUnread };
}

function rollbackReadInCache(queryClient: QueryClient, context?: ReadContext) {
  if (context?.previousList) queryClient.setQueryData(LIST_KEY, context.previousList);
  if (context?.previousUnread !== undefined) queryClient.setQueryData(UNREAD_KEY, context.previousUnread);
}

/* -------------------------------------------------------------------------- */
/*  Formatting helpers                                                        */
/* -------------------------------------------------------------------------- */

/** "low_stock" -> "Low stock" */
function formatType(type?: string | null) {
  if (!type) return "";
  const text = type.replace(/[_-]+/g, " ").trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function timeAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), text: formatDistanceToNow(date, { addSuffix: true }) };
}

const pluralize = (n: number, singular: string) => `${n} ${singular}${n === 1 ? "" : "s"}`;

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const when = timeAgo(notification.created_at);
  const type = formatType(notification.type);

  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          notification.is_read ? "bg-transparent" : "bg-primary"
        )}
      />

      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "text-sm break-words",
            notification.is_read ? "text-muted-foreground" : "font-medium text-foreground"
          )}
        >
          {!notification.is_read && <span className="sr-only">Unread: </span>}
          {notification.title}
        </p>

        {notification.message && (
          <p className="text-sm break-words text-muted-foreground">{notification.message}</p>
        )}

        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {type && <span>{type}</span>}
          {when && <time dateTime={when.iso}>{when.text}</time>}
        </p>
      </div>

      {!notification.is_read && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => onMarkRead(notification.id)}
        >
          <Check aria-hidden className="size-4" />
          <span className="sr-only">Mark as read</span>
        </Button>
      )}
    </li>
  );
}

function NotificationsSkeleton() {
  return (
    <div role="status" aria-label="Loading notifications" className="divide-y">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-5 py-4">
          <span className="size-2 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function NotificationButton() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Unread count: always on, refreshed every 30s.
  const { data: unreadCount = 0 } = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: async () => {
      const result = await getUnreadCount();
      if (!result.success) throw new Error(result.message);
      return result.data.count;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
  });

  // The list only loads while the sheet is open. staleTime 0 makes every open
  // refetch, so it can't lag behind the unread count shown on the bell.
  const {
    data: notifications = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const result = await getNotifications({ limit: LIST_LIMIT });
      if (!result.success) throw new Error(result.message);
      return result.data;
    },
    enabled: open,
    staleTime: 0,
    retry: 1,
  });

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const result = await markNotificationAsRead(id);
      if (!result.success) throw new Error(result.message);
    },
    onMutate: (id) => markReadInCache(queryClient, id),
    onError: (err, _id, context) => {
      rollbackReadInCache(queryClient, context);
      toast.error("Couldn't mark as read", { description: err.message });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ROOT_KEY }),
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const result = await markAllNotificationsAsRead();
      if (!result.success) throw new Error(result.message);
    },
    onMutate: () => markReadInCache(queryClient, "all"),
    onError: (err, _vars, context) => {
      rollbackReadInCache(queryClient, context);
      toast.error("Couldn't mark all as read", { description: err.message });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ROOT_KEY }),
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative rounded-full">
          <Bell aria-hidden className="size-5" />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-medium text-white tabular-nums"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <span className="sr-only">
            {unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          </span>
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="gap-1 border-b px-5 py-4 pr-12">
          <SheetTitle>Notifications</SheetTitle>

          <div className="flex items-center justify-between gap-3">
            <SheetDescription>
              {unreadCount > 0
                ? `You have ${pluralize(unreadCount, "unread notification")}.`
                : "You're all caught up."}
            </SheetDescription>

            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
              >
                Mark all as read
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <NotificationsSkeleton />
          ) : isError ? (
            <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="space-y-1">
                <p className="text-sm font-medium">Couldn't load notifications</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  {error?.message || "Something went wrong."}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
              <p className="text-sm font-medium">Nothing here yet</p>
              <p className="text-sm text-muted-foreground">New notifications will show up here.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={markAsRead.mutate}
                />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// "use client";

// import { useState } from "react";
// import { Bell, BellOff, Check, CheckCheck, RefreshCw, X } from "lucide-react";
// import { formatDistanceToNow } from "date-fns";
// import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// import { toast } from "sonner";
// import { cn } from "@/lib/utils";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import { ScrollArea } from "@/components/ui/scroll-area";
// import { Skeleton } from "@/components/ui/skeleton";
// import {
//   Sheet,
//   SheetContent,
//   SheetHeader,
//   SheetTitle,
//   SheetTrigger,
// } from "@/components/ui/sheet";
// import {
//   getNotifications,
//   getUnreadCount,
//   markNotificationAsRead,
//   markAllNotificationsAsRead,
// } from "@/actions/notifications";
// import { Notification } from "@/types/globals";

// // ── Query Keys ──
// const unreadCountKey = ["notifications", "unread"];
// const notificationsKey = ["notifications", "list"];

// export default function NotificationButton() {
//   const [open, setOpen] = useState(false);
//   const queryClient = useQueryClient();

//   // ── Unread Count Query (refetch every 30s) ──
//   const {
//     data: unreadCount = 0,
//     error: unreadError,
//     refetch: refetchUnread,
//   } = useQuery({
//     queryKey: unreadCountKey,
//     queryFn: async () => {
//       const result = await getUnreadCount();
//       if (!result.success) throw new Error(result.message);
//       return result.data.count;
//     },
//     refetchInterval: 30000,
//     staleTime: 25000,
//     retry: 1,
//   });

//   // ── Notifications Query (enabled when sheet is open) ──
//   const {
//     data: notifications = [],
//     isLoading,
//     isError,
//     error: notificationsError,
//     refetch: refetchNotifications,
//   } = useQuery({
//     queryKey: notificationsKey,
//     queryFn: async () => {
//       const result = await getNotifications({ limit: 50 });
//       if (!result.success) throw new Error(result.message);
//       return result.data;
//     },
//     enabled: open,
//     staleTime: 60 * 1000, // 1 minute
//     retry: 1,
//   });

//   // ── Mark as Read Mutation ──
//   const markAsReadMutation = useMutation({
//     mutationFn: async (id: string) => {
//       const result = await markNotificationAsRead(id);
//       if (!result.success) throw new Error(result.message);
//       return result;
//     },
//     onMutate: async (id) => {
//       // Cancel outgoing refetches
//       await queryClient.cancelQueries({ queryKey: notificationsKey });
//       await queryClient.cancelQueries({ queryKey: unreadCountKey });

//       // Snapshot previous values
//       const previousNotifications =
//         queryClient.getQueryData<Notification[]>(notificationsKey);
//       const previousUnread = queryClient.getQueryData<number>(unreadCountKey);

//       // Optimistic update: mark as read
//       if (previousNotifications) {
//         queryClient.setQueryData(
//           notificationsKey,
//           previousNotifications.map((n) =>
//             n.id === id ? { ...n, is_read: true } : n,
//           ),
//         );
//       }
//       if (previousUnread !== undefined) {
//         queryClient.setQueryData(
//           unreadCountKey,
//           Math.max(0, previousUnread - 1),
//         );
//       }

//       return { previousNotifications, previousUnread };
//     },
//     onError: (err, id, context) => {
//       // Rollback on error
//       if (context?.previousNotifications) {
//         queryClient.setQueryData(
//           notificationsKey,
//           context.previousNotifications,
//         );
//       }
//       if (context?.previousUnread !== undefined) {
//         queryClient.setQueryData(unreadCountKey, context.previousUnread);
//       }
//       toast.error("Failed to mark as read", {
//         description: err.message,
//       });
//     },
//     onSettled: () => {
//       // Refetch to ensure consistency
//       queryClient.invalidateQueries({ queryKey: notificationsKey });
//       queryClient.invalidateQueries({ queryKey: unreadCountKey });
//     },
//   });

//   // ── Mark All as Read Mutation ──
//   const markAllAsReadMutation = useMutation({
//     mutationFn: async () => {
//       const result = await markAllNotificationsAsRead();
//       if (!result.success) throw new Error(result.message);
//       return result.data.count;
//     },
//     onMutate: async () => {
//       await queryClient.cancelQueries({ queryKey: notificationsKey });
//       await queryClient.cancelQueries({ queryKey: unreadCountKey });

//       const previousNotifications =
//         queryClient.getQueryData<Notification[]>(notificationsKey);
//       const previousUnread = queryClient.getQueryData<number>(unreadCountKey);

//       // Optimistic: mark all as read
//       if (previousNotifications) {
//         queryClient.setQueryData(
//           notificationsKey,
//           previousNotifications.map((n) => ({ ...n, is_read: true })),
//         );
//       }
//       queryClient.setQueryData(unreadCountKey, 0);

//       return { previousNotifications, previousUnread };
//     },
//     onError: (err, variables, context) => {
//       if (context?.previousNotifications) {
//         queryClient.setQueryData(
//           notificationsKey,
//           context.previousNotifications,
//         );
//       }
//       if (context?.previousUnread !== undefined) {
//         queryClient.setQueryData(unreadCountKey, context.previousUnread);
//       }
//       toast.error("Failed to mark all as read", {
//         description: err.message,
//       });
//     },
//     onSettled: () => {
//       queryClient.invalidateQueries({ queryKey: notificationsKey });
//       queryClient.invalidateQueries({ queryKey: unreadCountKey });
//     },
//   });

//   // ── Helpers ──
//   const formatDate = (date: string) =>
//     formatDistanceToNow(new Date(date), { addSuffix: true });

//   // ── Render ──
//   return (
//     <Sheet open={open} onOpenChange={setOpen}>
//       <SheetTrigger asChild>
//         <Button variant="outline" size="icon" className="relative rounded-full">
//           <Bell className="h-5 w-5" />
//           {unreadCount > 0 && (
//             <Badge
//               variant="destructive"
//               className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-sm text-white"
//             >
//               {unreadCount > 9 ? "9+" : unreadCount}
//             </Badge>
//           )}
//           <span className="sr-only">Notifications</span>
//         </Button>
//       </SheetTrigger>

//       <SheetContent className="w-[400px] sm:w-[540px] p-0 flex flex-col">
//         {/* Header */}
//         <SheetHeader className="p-4 border-b">
//           <div className="flex items-center justify-between">
//             <SheetTitle>Notifications</SheetTitle>
//           </div>

//           <div className="flex items-center justify-between gap-2">
//             {unreadCount > 0 && (
//               <p className="text-sm text-muted-foreground">
//                 You have {unreadCount} unread notification
//                 {unreadCount > 1 ? "s" : ""}.
//               </p>
//             )}
//             {unreadCount > 0 && (
//               <Button
//                 variant="ghost"
//                 size="sm"
//                 onClick={() => markAllAsReadMutation.mutate()}
//                 disabled={markAllAsReadMutation.isPending}
//               >
//                 <CheckCheck className="h-4 w-4 mr-1" />
//                 Mark all read
//               </Button>
//             )}
//           </div>
//         </SheetHeader>

//         {/* Content */}
//         {isLoading ? (
//           <div className="flex-1 p-4 space-y-4">
//             {Array.from({ length: 5 }).map((_, i) => (
//               <div key={i} className="flex items-start gap-4">
//                 <Skeleton className="h-12 w-12 rounded-full" />
//                 <div className="space-y-2 flex-1">
//                   <Skeleton className="h-4 w-3/4" />
//                   <Skeleton className="h-3 w-1/2" />
//                   <Skeleton className="h-3 w-1/4" />
//                 </div>
//               </div>
//             ))}
//           </div>
//         ) : isError ? (
//           <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
//             <div className="bg-destructive/10 p-4 rounded-full mb-4">
//               <BellOff className="h-8 w-8 text-destructive" />
//             </div>
//             <h3 className="text-lg font-semibold">
//               Failed to load notifications
//             </h3>
//             <p className="text-sm text-muted-foreground mt-1 max-w-sm">
//               {notificationsError?.message || "Something went wrong."}
//             </p>
//             <Button
//               variant="outline"
//               className="mt-4"
//               onClick={() => refetchNotifications()}
//             >
//               <RefreshCw className="h-4 w-4 mr-2" />
//               Retry
//             </Button>
//           </div>
//         ) : notifications.length === 0 ? (
//           <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
//             <div className="bg-muted/30 p-4 rounded-full mb-4">
//               <BellOff className="h-8 w-8 text-muted-foreground" />
//             </div>
//             <h3 className="text-lg font-semibold">All caught up!</h3>
//             <p className="text-sm text-muted-foreground mt-1">
//               No notifications to show right now.
//             </p>
//           </div>
//         ) : (
//           <ScrollArea className="flex-1 p-4">
//             <div className="space-y-3">
//               {notifications.map((notification) => (
//                 <div
//                   key={notification.id}
//                   className={cn(
//                     "group relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 hover:bg-muted/30",
//                     notification.is_read
//                       ? "bg-background border-border"
//                       : "bg-primary/[0.02] border-primary/10 shadow-sm shadow-primary/[0.01]",
//                   )}
//                 >
//                   {/* Unread indicator dot */}
//                   {!notification.is_read && (
//                     <span className="absolute left-1.5 top-1/2 -translate-y-1/2 flex h-2 w-2 rounded-full bg-primary" />
//                   )}

//                   {/* Icon/Avatar Placeholder - adds visual anchor */}
//                   <div
//                     className={cn(
//                       "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground",
//                       !notification.is_read &&
//                         "bg-background border-primary/10 text-primary",
//                     )}
//                   >
//                     {/* Replace with dynamic icons based on notification.type if available */}
//                     <Bell className="h-4 w-4" />
//                   </div>

//                   {/* Content body */}
//                   <div className="flex-1 space-y-1.5 pr-8">
//                     <div className="flex items-baseline justify-between gap-2">
//                       <p
//                         className={cn(
//                           "text-sm tracking-tight",
//                           notification.is_read
//                             ? "text-foreground/90 font-normal"
//                             : "text-foreground font-semibold",
//                         )}
//                       >
//                         {notification.title}
//                       </p>
//                     </div>

//                     {notification.message && (
//                       <p className="text-sm text-muted-foreground leading-normal font-normal">
//                         {notification.message}
//                       </p>
//                     )}

//                     <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground/70">
//                       <span className="capitalize px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] tracking-wide font-bold">
//                         {notification.type}
//                       </span>
//                       <span>•</span>
//                       <span>{formatDate(notification.created_at)}</span>
//                     </div>
//                   </div>

//                   {/* Action button - elegantly floats or appears on hover */}
//                   {!notification.is_read && (
//                     <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
//                       <Button
//                         variant="secondary"
//                         size="icon"
//                         className="h-7 w-7 rounded-md shadow-sm border bg-background"
//                         onClick={() =>
//                           markAsReadMutation.mutate(notification.id)
//                         }
//                         disabled={markAsReadMutation.isPending}
//                       >
//                         <Check className="h-3.5 w-3.5" />
//                         <span className="sr-only">Mark as read</span>
//                       </Button>
//                     </div>
//                   )}
//                 </div>
//               ))}
//             </div>
//           </ScrollArea>
//         )}
//       </SheetContent>
//     </Sheet>
//   );
// }
