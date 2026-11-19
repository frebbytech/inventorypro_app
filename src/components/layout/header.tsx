import ThemeToggle from "@/components/layout/ThemeToggle/theme-toggle";
import { cn } from "@/lib/utils";
import { MobileSidebar } from "./mobile-sidebar";
import { UserNav } from "./user-nav";
import { checkRole } from "@/utils/roles";
import { navItems, userNavItems } from "@/constants/data";
import NotificationButton from "../notification/NotificationButton";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, UserPlus, PackagePlus, Truck, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { GlobalSearch } from "../custom/global-search";
import PowerButton from "./power";
import { FullscreenToggler } from "./fullscreen-toggler";
import { getAuthSession } from "@/lib/auth";
import { LiveSyncBadge } from "./LiveSyncBadge";

export default async function Header() {
  const [isAdmin, session] = await Promise.all([
    checkRole("admin"),
    getAuthSession(),
  ]);

  const activeNavItems = isAdmin ? navItems : userNavItems;

  // Rule configuration: Decide who gets access to quick operations
  const canQuickAdd = isAdmin;

  const quickAddOptions = [
    { label: "Customer", href: "/customer", icon: UserPlus },
    { label: "Product", href: "/products", icon: PackagePlus },
    { label: "Supplier", href: "/supplier", icon: Truck },
    { label: "Employee", href: "/employee/new", icon: ShieldAlert },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full",
        "border-b border-border/40 bg-card/60 backdrop-blur-md",
        "supports-[backdrop-filter]:bg-card/60",
      )}
    >
      <div className="grid h-14 grid-cols-3 items-center px-4">
        {/* Left Side: Navigation */}
        <div className="flex items-center justify-start">
          <PowerButton isAdmin={isAdmin} />
          <div className="md:hidden">
            <MobileSidebar navItems={activeNavItems} />
          </div>
        </div>

        {/* Center: Live Command Search Bar */}
        <div className="justify-self-center hidden sm:block w-full max-w-sm">
          <GlobalSearch canQuickAdd={canQuickAdd} />
        </div>

        {/* Right Side: Live sync status + Quick Add Actions */}
        <div className="flex items-center justify-end gap-2 col-start-3">
          <LiveSyncBadge
            tenantSlug={session?.tenant_slug}
            tenantName={session?.tenant_name}
          />
          {canQuickAdd && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-9 gap-1 rounded-full px-3">
                  <Plus className="h-4 w-4" />
                  <span className="hidden md:inline">Quick Add</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Create New</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {quickAddOptions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.label} asChild>
                      <Link
                        href={item.href}
                        className="flex items-center gap-2 cursor-pointer w-full"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span>{item.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="flex items-center gap-1 sm:gap-2 border-l pl-2 border-border/60">
            <FullscreenToggler />
            <NotificationButton />
            <ThemeToggle />
            <UserNav />
          </div>
        </div>
      </div>
    </header>
  );
}

// import ThemeToggle from "@/components/layout/ThemeToggle/theme-toggle";
// import { cn } from "@/lib/utils";
// import { MobileSidebar } from "./mobile-sidebar";
// import { UserNav } from "./user-nav";
// import { checkRole } from "@/utils/roles";
// import { navItems, userNavItems } from "@/constants/data";
// import NotificationButton from "../notification/NotificationButton";

// export default async function Header() {
//   const isAdmin = await checkRole("admin");
//   const activeNavItems = isAdmin ? navItems : userNavItems;

//   return (
//     <header
//       className={cn(
//         "sticky top-0 z-50 w-full",
//         "border-b border-border/40 bg-background/60 backdrop-blur-md",
//         "supports-[backdrop-filter]:bg-background/60"
//       )}
//     >
//       <div className="flex h-14 items-center justify-between px-4 md:justify-end">
//         {/* Mobile Navigation */}
//         <div className="flex items-center md:hidden">
//           <MobileSidebar navItems={activeNavItems} />
//         </div>

//         {/* Global Actions */}
//         <div className="flex items-center gap-2 sm:gap-4">
//           <NotificationButton />
//           <ThemeToggle />
//           <UserNav />
//         </div>
//       </div>
//     </header>
//   );
// }
