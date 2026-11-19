import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { createTenantSyncSseResponse } from "@/lib/sse-stream";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sinceParam =
    url.searchParams.get("sinceCursor") ??
    req.headers.get("last-event-id") ??
    "0";
  const sinceCursor = Math.max(0, Number(sinceParam) || 0);

  return createTenantSyncSseResponse({
    req,
    tenantId: session.tenant_id || DEFAULT_TENANT_ID,
    sinceCursor,
  });
}
