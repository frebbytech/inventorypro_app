import { NextResponse } from "next/server";
import { getBearerAuthSession } from "@/lib/auth";
import { sanitizeMobileServerError } from "@/lib/mobile-api";
import { createTenantSyncSseResponse } from "@/lib/sse-stream";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await getBearerAuthSession(req);
    if (!auth?.session?.id) {
      return NextResponse.json(
        {
          error: "Your session has expired. Please sign in again.",
          code: "UNAUTHORIZED",
        },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const sinceParam =
      url.searchParams.get("sinceCursor") ??
      req.headers.get("last-event-id") ??
      "0";
    const sinceCursor = Math.max(0, Number(sinceParam) || 0);

    return createTenantSyncSseResponse({
      req,
      tenantId: auth.session.tenant_id || DEFAULT_TENANT_ID,
      sinceCursor,
      userId: auth.session.id,
      role: auth.session.role,
    });
  } catch (err: unknown) {
    const sanitized = sanitizeMobileServerError(err, {
      fallbackMessage: "Live sync is temporarily unavailable.",
      context: "mobile/sync/stream",
    });
    return NextResponse.json(
      { error: sanitized.message, code: sanitized.code },
      { status: sanitized.status },
    );
  }
}
