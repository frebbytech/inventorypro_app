
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser, logoutUser } from "@/actions/_actions";
import type { User } from "@/types/globals";
import { SESSION_WARNING_TEST_EVENT } from "../auth/SessionTimeoutWarning";


// Never true in a production build: this lets developers open the session
// warning on demand to check it, without leaving a live "Test" control in
// front of real users.
const SHOW_SESSION_WARNING_TEST = process.env.NODE_ENV !== "production";

export function UserNav() {
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

  if (!userLoaded) {
    return <Skeleton className="size-8 shrink-0 rounded-full" />;
  }

  const role = user?.role;
  const fullName = [user?.firstname, user?.lastname].filter(Boolean).join(" ") || user?.username || "User";
  const initials = (user?.username?.[0] || "U").toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="size-8">
              <AvatarFallback className="bg-muted text-sm font-medium text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="sr-only">Open account menu</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel className="">
            <p className="truncate text-sm ">{fullName}</p>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href="/profile">Profile</Link>
            </DropdownMenuItem>
            {role === "admin" && (
              <DropdownMenuItem asChild>
                <Link href="/admin/settings">Settings</Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>

          {SHOW_SESSION_WARNING_TEST && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => window.dispatchEvent(new CustomEvent(SESSION_WARNING_TEST_EVENT))}
              >
                Preview session 
                <span className="ml-auto text-sm text-muted-foreground">Dev only</span>
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            // variant="destructive"
            onSelect={() => setLogoutOpen(true)}
          >
            <LogOut aria-hidden className="size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={logoutOpen} onOpenChange={(next) => !isLoggingOut && setLogoutOpen(next)}>
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
    </>
  );
}
