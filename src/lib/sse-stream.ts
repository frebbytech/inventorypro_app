import "server-only";
import {
  readSyncEventsSince,
  subscribeTenantSync,
  type SyncEventRecord,
} from "@/lib/sync-bus";
import {
  enrichSyncEventRecord,
  enrichSyncEventsBatch,
  scopeSyncEventsForUser,
  type SyncEventDto,
} from "@/lib/sync-delta";

export function createTenantSyncSseResponse(opts: {
  req: Request;
  tenantId: string;
  sinceCursor: number;
  userId?: string | null;
  role?: string | null;
}): Response {
  const encoder = new TextEncoder();
  let cleanupFn: (() => void) | null = null;
  const viewer = {
    userId: opts.userId ?? null,
    role: opts.role ?? null,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastSentCursor = Math.max(0, Math.floor(opts.sinceCursor));
      const pendingLive: SyncEventRecord[] = [];
      let replayDone = false;
      let liveQueue: Promise<void> = Promise.resolve();

      const sendFrame = (eventName: string, data: unknown, id?: number) => {
        if (closed) return;
        try {
          const lines: string[] = [];
          if (id !== undefined) lines.push(`id: ${id}`);
          lines.push(`event: ${eventName}`);
          lines.push(`data: ${JSON.stringify(data)}`);
          controller.enqueue(encoder.encode(`${lines.join("\n")}\n\n`));
        } catch {
          closed = true;
          cleanupFn?.();
        }
      };

      const dispatchDtos = (dtos: SyncEventDto[], rawMaxCursor?: number) => {
        const scoped = scopeSyncEventsForUser(dtos, viewer);
        for (const dto of scoped) {
          if (dto.cursor > lastSentCursor) {
            lastSentCursor = dto.cursor;
            sendFrame("sync", dto, dto.cursor);
          }
        }
        if (rawMaxCursor && rawMaxCursor > lastSentCursor) {
          lastSentCursor = rawMaxCursor;
        }
      };

      const unsubscribe = subscribeTenantSync(opts.tenantId, (evt) => {
        if (closed) return;
        if (!replayDone) {
          pendingLive.push(evt);
          return;
        }
        liveQueue = liveQueue
          .then(async () => {
            if (closed || evt.cursor <= lastSentCursor) return;
            const enriched = await enrichSyncEventRecord(evt);
            if (closed || evt.cursor <= lastSentCursor) return;
            dispatchDtos([enriched], evt.cursor);
          })
          .catch(() => {});
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        sendFrame("ping", { ts: Date.now(), cursor: lastSentCursor });
      }, 20_000);

      cleanupFn = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      opts.req.signal.addEventListener("abort", () => {
        cleanupFn?.();
      });

      try {
        const catchUp = await readSyncEventsSince(
          opts.tenantId,
          lastSentCursor,
          500,
        );
        const resetRequired =
          opts.sinceCursor > 0 &&
          catchUp.oldestAvailableCursor > 1 &&
          opts.sinceCursor < catchUp.oldestAvailableCursor - 1;

        sendFrame("connected", {
          tenantId: opts.tenantId,
          latestCursor: catchUp.latestCursor,
          resetRequired,
        });

        const enrichedCatchUp = await enrichSyncEventsBatch(
          opts.tenantId,
          catchUp.events,
        );
        dispatchDtos(
          enrichedCatchUp,
          catchUp.events.reduce(
            (max, e) => (e.cursor > max ? e.cursor : max),
            lastSentCursor,
          ),
        );

        replayDone = true;

        if (pendingLive.length > 0) {
          const missedLive = pendingLive.filter((e) => e.cursor > lastSentCursor);
          pendingLive.length = 0;
          if (missedLive.length > 0) {
            const enrichedPending = await enrichSyncEventsBatch(
              opts.tenantId,
              missedLive,
            );
            dispatchDtos(
              enrichedPending,
              missedLive.reduce(
                (max, e) => (e.cursor > max ? e.cursor : max),
                lastSentCursor,
              ),
            );
          }
        }
      } catch (err) {
        console.error("[sse-stream] Sync replay failed:", err);
        sendFrame("error", {
          message: "Live sync was interrupted. Reconnecting...",
        });
        replayDone = true;
      }
    },
    cancel() {
      cleanupFn?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
