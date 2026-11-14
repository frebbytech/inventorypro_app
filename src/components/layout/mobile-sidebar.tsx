"use client";

import { useState, useEffect } from "react";
import { LogOut, MenuIcon } from "lucide-react";

import { DashboardNav } from "@/components/dashboard-nav";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { navItems as defaultNavItems, userNavItems } from "@/constants/data";
import Link from "next/link";
import { useSettings } from "@/providers/SettingsProvider";
import Logo from "../custom/Logo";
import { getCurrentUser, logoutUser } from "@/actions/_actions";

type MobileSidebarProps = {
  navItems?: typeof defaultNavItems;
};

export function MobileSidebar({ navItems = userNavItems }: MobileSidebarProps) {
  const { settings } = useSettings();
  const [user, setUser] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  useEffect(() => {
    getCurrentUser().then((res) => {
      setUser(res);
    }).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    setLogoutDialogOpen(false);
    setSheetOpen(false);
    window.location.href = "/auth/sign-in";
  };

  const userRole = user?.role || "guest";
  const fullName = [user?.firstname, user?.lastname].filter(Boolean).join(" ") || user?.username || "Guest";

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <MenuIcon className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex flex-col justify-between w-72 p-0">
          <div>
            <div className="flex h-16 items-center border-b px-6">
              <Link
                href={userRole === "admin" ? "/admin" : "/"}
                className="flex items-center gap-2"
                onClick={() => setSheetOpen(false)}
              >
                <Logo />
                <span className="text-lg font-bold tracking-tight">
                  {settings?.business_name || "InventoryPro"}
                </span>
              </Link>
            </div>

            <div className="py-4 px-2">
              <DashboardNav items={navItems} setOpen={setSheetOpen} />
            </div>
          </div>

          <SheetFooter className="border-t p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {(user?.username?.[0] || "U").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fullName}</p>
                <p className="text-sm text-muted-foreground truncate capitalize">
                  {userRole}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              onClick={() => setLogoutDialogOpen(true)}
              className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be signed out of your account. You can always sign back
              in later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
