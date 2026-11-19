"use client";

import React, { useState } from "react";
import { Check, Copy, RefreshCw, WifiOff } from "lucide-react";
import { useRealtimeSync } from "@/providers/RealtimeSyncProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function LiveSyncBadge({
  tenantSlug,
  tenantName,
}: {
  tenantSlug?: string;
  tenantName?: string;
}) {
  const { status, lastSyncedAt, reconnectNow } = useRealtimeSync();
  const [copied, setCopied] = useState(false);

  const handleCopySlug = async () => {
    if (!tenantSlug || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(tenantSlug);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const isLive = status === "live";
  const isOffline = status === "offline";

  return (
    <div className="hidden lg:flex items-center gap-1.5">
      {tenantSlug && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCopySlug}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="max-w-[110px] truncate font-mono">
                {tenantSlug}
              </span>
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3 opacity-60" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            Workspace Code for {tenantName || "your store"} (click to copy for
            mobile sync)
          </TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={reconnectNow}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/80 px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-muted/60 transition-colors"
          >
            {isOffline ? (
              <WifiOff className="h-3 w-3 text-rose-500" />
            ) : !isLive ? (
              <RefreshCw className="h-3 w-3 animate-spin text-amber-500" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            )}
            <span>
              {isLive
                ? "Live Sync"
                : isOffline
                  ? "Offline"
                  : "Syncing..."}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {isLive
            ? `Real-time multi-device sync active${lastSyncedAt ? ` (${new Date(lastSyncedAt).toLocaleTimeString()})` : ""}`
            : "Click to reconnect real-time sync stream"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
