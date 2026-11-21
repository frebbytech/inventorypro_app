import { NextResponse } from "next/server";
import { readSyncEventsSince } from "@/lib/sync-bus";
import { enrichSyncEventsBatch, scopeSyncEventsForUser } from "@/lib/sync-delta";
import { withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const url = new URL(req.url);
    const cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? "0") || 0);
    const result = await readSyncEventsSince(tenantId, cursor, 500);
    const resetRequired =
      cursor > 0 &&
      result.oldestAvailableCursor > 1 &&
      cursor < result.oldestAvailableCursor - 1;

    const enriched = resetRequired
      ? []
      : scopeSyncEventsForUser(
          await enrichSyncEventsBatch(tenantId, result.events),
          { userId: session.id, role: session.role },
        );

    return NextResponse.json({
      events: enriched,
      latestCursor: result.latestCursor,
      oldestAvailableCursor: result.oldestAvailableCursor,
      resetRequired,
    });
  });
}
