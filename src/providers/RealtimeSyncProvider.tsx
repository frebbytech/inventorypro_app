"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

export type RealtimeSyncStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "offline";

interface RealtimeSyncContextValue {
  status: RealtimeSyncStatus;
  lastCursor: number;
  lastSyncedAt: string | null;
  reconnectNow: () => void;
}

const RealtimeSyncContext = createContext<RealtimeSyncContextValue>({
  status: "connecting",
  lastCursor: 0,
  lastSyncedAt: null,
  reconnectNow: () => {},
});

export function useRealtimeSync() {
  return useContext(RealtimeSyncContext);
}

export function RealtimeSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<RealtimeSyncStatus>("connecting");
  const [lastCursor, setLastCursor] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const cursorRef = useRef<number>(0);
  const retryAttemptRef = useRef<number>(0);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(
    (entityType?: string) => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        void queryClient.invalidateQueries();
        if (entityType === "settings") {
          void queryClient.invalidateQueries({ queryKey: ["settings"] });
        }
        router.refresh();
      }, 160);
    },
    [queryClient, router],
  );

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setStatus(retryAttemptRef.current > 0 ? "reconnecting" : "connecting");

    const url = `/api/sync/stream?sinceCursor=${cursorRef.current}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("connected", (ev: MessageEvent) => {
      retryAttemptRef.current = 0;
      setStatus("live");
      try {
        const data = JSON.parse(ev.data || "{}");
        if (typeof data.latestCursor === "number") {
          cursorRef.current = Math.max(cursorRef.current, data.latestCursor);
          setLastCursor(cursorRef.current);
        }
        if (data.resetRequired) {
          scheduleRefresh();
        }
      } catch {
        // ignore parse errors
      }
      setLastSyncedAt(new Date().toISOString());
    });

    es.addEventListener("sync", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data || "{}");
        if (typeof data.cursor === "number") {
          cursorRef.current = Math.max(cursorRef.current, data.cursor);
          setLastCursor(cursorRef.current);
        }
        setLastSyncedAt(new Date().toISOString());
        scheduleRefresh(data.entity_type);
      } catch {
        scheduleRefresh();
      }
    });

    es.addEventListener("ping", () => {
      setStatus("live");
    });

    es.onerror = () => {
      es.close();
      if (esRef.current === es) {
        esRef.current = null;
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus("offline");
        return;
      }

      setStatus("reconnecting");
      const attempt = Math.min(4, retryAttemptRef.current);
      retryAttemptRef.current += 1;
      const delay = Math.min(15_000, 1000 * Math.pow(2, attempt));

      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    connect();

    const onOnline = () => {
      retryAttemptRef.current = 0;
      connect();
      scheduleRefresh();
    };
    const onOffline = () => {
      setStatus("offline");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !esRef.current) {
        retryAttemptRef.current = 0;
        connect();
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [connect, scheduleRefresh]);

  const value = useMemo<RealtimeSyncContextValue>(
    () => ({
      status,
      lastCursor,
      lastSyncedAt,
      reconnectNow: () => {
        retryAttemptRef.current = 0;
        connect();
      },
    }),
    [status, lastCursor, lastSyncedAt, connect],
  );

  return (
    <RealtimeSyncContext.Provider value={value}>
      {children}
    </RealtimeSyncContext.Provider>
  );
}
