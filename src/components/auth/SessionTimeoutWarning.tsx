"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";
import { extendSession, getSessionStatus, logoutUser } from "@/actions/_actions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* -------------------------------------------------------------------------- */
/*  Configuration (module scope)                                              */
/* -------------------------------------------------------------------------- */

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // sign out after 15 minutes with no activity
const WARNING_WINDOW_MS = 2 * 60 * 1000; // show the warning with this much time left
const WARNING_WINDOW_SEC = WARNING_WINDOW_MS / 1000;

const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
const COUNTDOWN_TICK_MS = 1000;

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;


export const SESSION_WARNING_TEST_EVENT = "trigger-session-warning";
const ENABLE_MANUAL_TRIGGER = process.env.NODE_ENV !== "production";

const SESSION_CHANNEL_NAME = "session-timeout";

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function SessionTimeoutWarning() {
  const [open, setOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_WINDOW_SEC);
  const [extending, setExtending] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  const lastActiveRef = useRef(Date.now());
  // Mirrors `open` for use inside intervals set up once on mount, so those
  // intervals don't need to be torn down and rebuilt every time `open` changes.
  const openRef = useRef(open);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const setOpenState = useCallback((next: boolean) => {
    openRef.current = next;
    setOpen(next);
  }, []);

  /* ---- track user activity (cheap: a ref write, no re-render) ---- */
  useEffect(() => {
    function handleActivity() {

      if (!openRef.current) lastActiveRef.current = Date.now();
    }
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
  }, []);

  /* ---- who's signed in, for the dialog's subtitle ---- */
  useEffect(() => {
    let active = true;
    getSessionStatus().then((res) => {
      if (active && res.success && res.data?.authenticated) setUsername(res.data.user.username);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleAutoLogout = useCallback(async () => {

    try {
      const res = await getSessionStatus();
      if (res.success && res.data?.authenticated) {
        const msLeft = res.data.expiresAt ? res.data.expiresAt - Date.now() : Infinity;
        if (msLeft > 0) {
          lastActiveRef.current = Date.now();
          setSecondsLeft(Math.min(WARNING_WINDOW_SEC, Math.floor(msLeft / 1000)));
          setOpenState(false);
          return;
        }
      }
    } catch {

    }

    setOpenState(false);
    toast.error("You were signed out after a period of inactivity.");
    await logoutUser();
    window.location.href = "/auth/sign-in";
  }, [setOpenState]);

  /* ---- idle polling: only while the tab is visible, and paused while the dialog is open ---- */
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (cancelled || openRef.current || document.visibilityState !== "visible") return;

      const now = Date.now();
      const msUntilIdleExpiry = INACTIVITY_TIMEOUT_MS - (now - lastActiveRef.current);

      let msUntilServerExpiry = Infinity;
      try {
        const res = await getSessionStatus();
        if (cancelled) return;

        if (!res.success || !res.data?.authenticated) {

          window.location.href = "/auth/sign-in";
          return;
        }
        if (res.data.expiresAt) msUntilServerExpiry = res.data.expiresAt - now;
      } catch {

      }

      const msRemaining = Math.min(msUntilIdleExpiry, msUntilServerExpiry);
      if (msRemaining <= WARNING_WINDOW_MS) {
        if (msRemaining <= 0) {
          void handleAutoLogout();
        } else {
          setSecondsLeft(Math.floor(msRemaining / 1000));
          setOpenState(true);
        }
      }
    }

    void check(); // catch a session that's already in the warning window on load
    const interval = setInterval(check, IDLE_CHECK_INTERVAL_MS);


    function handleVisibility() {
      if (document.visibilityState === "visible") void check();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [handleAutoLogout, setOpenState]);

  /* ---- the visible one-second countdown while the dialog is open ---- */
  useEffect(() => {
    if (!open) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          void handleAutoLogout();
          return 0;
        }
        return prev - 1;
      });
    }, COUNTDOWN_TICK_MS);

    return () => clearInterval(timer);
  }, [open, handleAutoLogout]);

  /* ---- cross-tab sync: another tab extending shouldn't leave this one to time out ---- */
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data === "extended") {
        lastActiveRef.current = Date.now();
        setOpenState(false);
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [setOpenState]);

  /* ---- manual trigger, development only ---- */
  useEffect(() => {
    if (!ENABLE_MANUAL_TRIGGER) return;
    function handleTrigger() {
      setSecondsLeft(WARNING_WINDOW_SEC);
      setOpenState(true);
    }
    window.addEventListener(SESSION_WARNING_TEST_EVENT, handleTrigger);
    return () => window.removeEventListener(SESSION_WARNING_TEST_EVENT, handleTrigger);
  }, [setOpenState]);

  /* ---- actions ---- */

  async function handleExtend() {
    setExtending(true);
    try {
      const res = await extendSession();
      if (res.success) {
        lastActiveRef.current = Date.now();
        setOpenState(false);
        toast.success("Session extended.");
        channelRef.current?.postMessage("extended");
      } else {
        toast.error(res.message || "Couldn't extend your session. Please sign in again.");
        window.location.href = "/auth/sign-in";
      }
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setExtending(false);
    }
  }

  async function handleManualLogout() {
    setLoggingOut(true);
    try {
      await logoutUser();
    } catch {
      // Sign-out failing server-side shouldn't strand the user on a page
      // that thinks they're still authenticated — send them on regardless.
    } finally {
      window.location.href = "/auth/sign-in";
    }
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const progressPercent = (secondsLeft / WARNING_WINDOW_SEC) * 100;
  const isUrgent = secondsLeft <= 30;

  return (
    <AlertDialog open={open} onOpenChange={setOpenState}>
      <AlertDialogContent
        className="sm:max-w-sm"
        // A session decision needs an explicit answer; dismissing by accident
        // (Escape, an outside click) shouldn't silently waive it.
        onEscapeKeyDown={(e) => e.preventDefault()}
        // onInteractOutside={(e) => e.preventDefault()}
      >
        <AlertDialogHeader className="text-left">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock aria-hidden className="size-5" />
            </div>
            <div>
              <AlertDialogTitle>Your session is about to expire</AlertDialogTitle>
              {username && <AlertDialogDescription>Signed in as {username}</AlertDialogDescription>}
            </div>
          </div>

          <p className="pt-1 text-sm text-muted-foreground">
            You've been inactive for a while. Extend your session to keep working, or you'll be
            signed out automatically.
          </p>
        </AlertDialogHeader>

        <div className="space-y-2 rounded-lg border px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Time remaining</span>
            <span
              aria-live="polite"
              className={cn("font-mono text-base font-semibold tabular-nums", isUrgent && "text-destructive")}
            >
              {formattedTime}
            </span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleManualLogout}
            disabled={loggingOut || extending}
            className="w-full sm:w-auto"
          >
            {loggingOut ? "Signing out…" : "Log out"}
          </Button>
          <Button onClick={handleExtend} disabled={extending || loggingOut} className="w-full sm:w-auto">
            {extending ? "Extending…" : "Extend session"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
