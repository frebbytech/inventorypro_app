"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Building2,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Shield,
  Sun,
  X,
} from "lucide-react";
import { logoutSuperAdmin } from "@/actions/super-admin";
import type { SuperAdminSession } from "@/lib/super-admin";
import { Button } from "@/components/ui/button";

interface SuperAdminShellProps {
  operator: SuperAdminSession;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  {
    href: "/super-admin",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/super-admin/tenants",
    label: "Tenants",
    icon: Building2,
    exact: false,
  },
];

export default function SuperAdminShell({
  operator,
  children,
}: SuperAdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  const isTenantDetail =
    pathname?.startsWith("/super-admin/tenants/") &&
    pathname !== "/super-admin/tenants";

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logoutSuperAdmin();
      router.replace("/super-admin/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-card text-card-foreground">
      <div>
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-none">
              InventoryPro
            </p>
            <p className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
              Super Admin Console
            </p>
          </div>
        </div>

        <nav className="space-y-1 px-3 py-4" aria-label="Super Admin navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? pathname === item.href
              : Boolean(pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-border p-4 space-y-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">
            {operator.fullname}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            @{operator.username} · {operator.email}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full justify-start gap-2 text-xs"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{signingOut ? "Signing out..." : "Sign Out"}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-svh w-full bg-background text-foreground">
      {/* Desktop Left Sidebar (256px) */}
      <aside className="hidden w-64 shrink-0 border-r border-border md:block">
        <div className="sticky top-0 h-svh">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 h-full w-64 border-r border-border bg-card">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="absolute right-3 top-3.5 rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1.5 text-sm min-w-0">
              <Link
                href="/super-admin"
                className="font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Super Admin
              </Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {isTenantDetail ? (
                <>
                  <Link
                    href="/super-admin/tenants"
                    className="font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Tenants
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-semibold text-foreground">
                    Members & Workspace
                  </span>
                </>
              ) : (
                <span className="truncate font-semibold text-foreground">
                  {pathname === "/super-admin/tenants" ? "Tenants" : "Overview & Tenants"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="h-8 gap-1.5 px-2.5 text-xs"
              aria-label="Toggle theme"
            >
              {isDark ? (
                <>
                  <Sun className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
