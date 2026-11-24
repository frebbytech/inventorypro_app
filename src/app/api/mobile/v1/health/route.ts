import { NextResponse } from "next/server";
import { probeDatabaseHealth } from "@/lib/ops";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await probeDatabaseHealth();

  return NextResponse.json(
    {
      ok: db.connected,
      status: db.connected ? "healthy" : "degraded",
      dbOk: db.connected,
      latencyMs: db.latencyMs,
      timestamp: new Date().toISOString(),
    },
    {
      status: db.connected ? 200 : 503,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
