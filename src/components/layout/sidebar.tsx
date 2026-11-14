
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, LogOut } from "lucide-react";
import { toast } from "sonner";

import { getCurrentUser, logoutUser } from "@/actions/_actions";
import { DashboardNav } from "@/components/dashboard-nav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { navItems as defaultNavItems } from "@/constants/data";
import { useSidebar } from "@/hooks/useSidebar";
import { getInitials } from "@/lib/helpers";
import { cn } from "@/lib/utils";
import { useSettings } from "@/providers/SettingsProvider";
import type { User } from "@/types/globals";
import Logo from "../custom/Logo";

type SidebarProps = {
  className?: string;
  navItems: typeof defaultNavItems;
};

export default function Sidebar({ className, navItems }: SidebarProps) {
  const pathname = usePathname();
  const { settings } = useSettings();
  const { isMinimized, toggle } = useSidebar();

  const [user, setUser] = useState<User | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;

    getCurrentUser()
      .then((res) => {
        if (active) setUser(res as User | null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setUserLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logoutUser();
      // A full page load, so no signed-in state survives in memory.
      window.location.href = "/auth/sign-in";
    } catch {
      toast.error("Couldn't log out", { description: "Try again in a moment." });
      setIsLoggingOut(false);
    }
  }

  // The point-of-sale screens use the full width.
  if (pathname?.startsWith("/sales")) return null;

  const role = user?.role || "guest";
  const fullName =
    [user?.firstname, user?.lastname].filter(Boolean).join(" ") || user?.username || "Guest";

  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        "relative hidden h-dvh flex-none flex-col border-r bg-card transition-[width] duration-200 md:flex",
        isMinimized ? "w-[72px]" : "w-64",
        className
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b px-4",
          isMinimized ? "justify-center" : "justify-start"
        )}
      >
        <Link
          href={role === "admin" ? "/admin" : "/"}
          className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo />
          {isMinimized ? (
            <span className="sr-only">{settings?.business_name || "InventoryPro"} home</span>
          ) : (
            <span className="truncate text-lg font-semibold tracking-tight">
              {settings?.business_name || "InventoryPro"}
            </span>
          )}
        </Link>
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={toggle}
        aria-expanded={!isMinimized}
        className="absolute top-20 -right-3 z-50 size-6 rounded-full bg-background shadow-xs"
      >
        <ChevronLeft aria-hidden className={cn("size-4 transition-transform", isMinimized && "rotate-180")} />
        <span className="sr-only">{isMinimized ? "Expand sidebar" : "Collapse sidebar"}</span>
      </Button>

      {/* Scrolls on short screens instead of pushing the footer off-screen. */}
      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        <DashboardNav items={navItems} />
      </div>

      <div className={cn("shrink-0 border-t p-3", isMinimized ? "space-y-2" : "flex items-center gap-2")}>
        <div
          className={cn(
            "flex min-w-0 items-center gap-3",
            isMinimized ? "justify-center" : "flex-1 px-1"
          )}
          title={isMinimized ? `${fullName}, ${role}` : undefined}
        >
          {userLoaded ? (
            <Avatar className="size-9 shrink-0">
              <AvatarFallback className="bg-muted text-sm font-medium text-foreground">
                {user ? getInitials(user) : "U"}
              </AvatarFallback>
            </Avatar>
          ) : (
            <Skeleton className="size-9 shrink-0 rounded-full" />
          )}

          {!isMinimized &&
            (userLoaded ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{fullName}</p>
                <p className="truncate text-sm text-muted-foreground capitalize">{role}</p>
              </div>
            ) : (
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLogoutOpen(true)}
          className={cn(
            "size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
            isMinimized && "mx-auto flex"
          )}
        >
          <LogOut aria-hidden className="size-4" />
          <span className="sr-only">Log out</span>
        </Button>
      </div>

      <AlertDialog open={logoutOpen} onOpenChange={(open) => !isLoggingOut && setLogoutOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be signed out of your account. You can sign back in any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoggingOut}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isLoggingOut}
              // Keep the dialog open until we've actually signed out.
              onClick={(e) => {
                e.preventDefault();
                void handleLogout();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isLoggingOut ? "Logging out…" : "Log out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

// "use client";

// import { useState, useEffect } from "react";
// import { DashboardNav } from "@/components/dashboard-nav";
// import { navItems } from "@/constants/data";
// import { useSidebar } from "@/hooks/useSidebar";
// import { cn } from "@/lib/utils";
// import { ChevronLeft, LogOut } from "lucide-react";
// import Link from "next/link";
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// import { Button } from "@/components/ui/button";
// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
// } from "@/components/ui/alert-dialog";
// import { getInitials } from "@/lib/helpers";
// import { SidebarSkeleton } from "../custom/skeleton/SidebarSkeleton";
// import { useSettings } from "@/providers/SettingsProvider";
// import Logo from "../custom/Logo";
// import { getCurrentUser, logoutUser } from "@/actions/_actions";
// import { usePathname } from "next/navigation";

// type SidebarProps = {
//   className?: string;
//   navItems: typeof navItems;
// };

// export default function Sidebar({ className, navItems }: SidebarProps) {
//   const pathname = usePathname();
//   const { settings } = useSettings();
//   const { isMinimized, toggle } = useSidebar();
//   const [user, setUser] = useState<any>(null);
//   const [loaded, setLoaded] = useState(false);
//   const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

//   useEffect(() => {
//     getCurrentUser()
//       .then((res) => {
//         setUser(res);
//         setLoaded(true);
//       })
//       .catch(() => {
//         setLoaded(true);
//       });
//   }, []);

//   const handleToggle = () => {
//     toggle();
//   };

//   const handleLogout = async () => {
//     await logoutUser();
//     setLogoutDialogOpen(false);
//     window.location.href = "/auth/sign-in";
//   };

//   const userRole = user?.role || "guest";
//   const fullName =
//     [user?.firstname, user?.lastname].filter(Boolean).join(" ") ||
//     user?.username ||
//     "Guest";


//   if (pathname.startsWith("/sales")) {
//     return null;
//   }

//   if (!loaded) {
//     return <SidebarSkeleton />;
//   }

//   return (
//     <aside
//       className={cn(
//         `relative hidden h-screen flex-none border-r bg-card transition-[width] duration-500 md:block`,
//         !isMinimized ? "w-64" : "w-[72px]",
//         className,
//       )}
//     >
//       {/* Title / Logo */}
//       <div
//         className={cn(
//           "flex h-16 items-center justify-start border-b px-4",
//           isMinimized && "justify-center",
//         )}
//       >
//         <Link
//           href={userRole === "admin" ? "/admin" : "/"}
//           className="flex items-center gap-2"
//         >
//           <Logo />
//           {!isMinimized && (
//             <span className="text-lg font-bold tracking-tight">
//               {settings?.business_name || "InventoryPro"}
//             </span>
//           )}
//         </Link>
//       </div>

//       {/* Toggle Button */}
//       <ChevronLeft
//         className={cn(
//           "absolute -right-3 top-20 z-50 cursor-pointer rounded-full border bg-background text-3xl text-foreground",
//           isMinimized && "rotate-180",
//         )}
//         onClick={handleToggle}
//       />

//       {/* Navigation */}
//       <div className="flex flex-col justify-between h-[calc(100vh-4rem)]">
//         <div className="py-4">
//           <DashboardNav items={navItems} />
//         </div>

//         {/* Footer: Profile + Logout */}
//         <div className="border-t p-4 space-y-3">
//           {!isMinimized ? (
//             <div className="flex items-center gap-3">
//               <Avatar className="h-9 w-9">
//                 <AvatarFallback className="bg-primary/10 text-primary font-semibold">
//                   {(user?.username?.[0] || "U").toUpperCase()}
//                 </AvatarFallback>
//               </Avatar>
//               <div className="flex-1 min-w-0">
//                 <p className="text-sm font-medium truncate">{fullName}</p>
//                 <p className="text-sm text-muted-foreground truncate capitalize">
//                   {userRole}
//                 </p>
//               </div>
//             </div>
//           ) : (
//             <div className="flex justify-center">
//               <Avatar className="h-9 w-9">
//                 <AvatarFallback className="bg-primary/10 text-primary font-semibold">
//                   {(user?.username?.[0] || "U").toUpperCase()}
//                 </AvatarFallback>
//               </Avatar>
//             </div>
//           )}

//           <Button
//             variant="ghost"
//             onClick={() => setLogoutDialogOpen(true)}
//             className={cn(
//               "w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10",
//               isMinimized && "justify-center px-0",
//             )}
//           >
//             <LogOut className="h-4 w-4" />
//             {!isMinimized && <span>Logout</span>}
//           </Button>
//         </div>
//       </div>

//       {/* Alert Dialog */}
//       <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
//         <AlertDialogContent>
//           <AlertDialogHeader>
//             <AlertDialogTitle>Are you sure?</AlertDialogTitle>
//             <AlertDialogDescription>
//               You will be signed out of your account. You can always sign back
//               in later.
//             </AlertDialogDescription>
//           </AlertDialogHeader>
//           <AlertDialogFooter>
//             <AlertDialogCancel>Cancel</AlertDialogCancel>
//             <AlertDialogAction
//               onClick={handleLogout}
//               className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
//             >
//               Logout
//             </AlertDialogAction>
//           </AlertDialogFooter>
//         </AlertDialogContent>
//       </AlertDialog>
//     </aside>
//   );
// }
