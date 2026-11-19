import "server-only";
import {
  readSyncEventsSince,
  subscribeTenantSync,
  type SyncEventRecord,
} from "@/lib/sync-bus";

export function createTenantSyncSseResponse(opts: {
  req: Request;
  tenantId: string;
  sinceCursor: number;
}): Response {
  const encoder = new TextEncoder();
  let cleanupFn: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastSentCursor = Math.max(0, Math.floor(opts.sinceCursor));
      const pendingLive: SyncEventRecord[] = [];
      let replayDone = false;

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

      const unsubscribe = subscribeTenantSync(opts.tenantId, (evt) => {
        if (closed) return;
        if (!replayDone) {
          pendingLive.push(evt);
          return;
        }
        if (evt.cursor <= lastSentCursor) return;
        lastSentCursor = evt.cursor;
        sendFrame("sync", evt, evt.cursor);
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

        for (const evt of catchUp.events) {
          if (evt.cursor > lastSentCursor) {
            lastSentCursor = evt.cursor;
            sendFrame("sync", evt, evt.cursor);
          }
        }

        replayDone = true;

        for (const evt of pendingLive) {
          if (evt.cursor > lastSentCursor) {
            lastSentCursor = evt.cursor;
            sendFrame("sync", evt, evt.cursor);
          }
        }
        pendingLive.length = 0;
      } catch (err) {
        sendFrame("error", {
          message: err instanceof Error ? err.message : "Sync replay failed",
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
