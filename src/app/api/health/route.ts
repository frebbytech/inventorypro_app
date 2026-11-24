import { NextResponse } from "next/server";
import { probeDatabaseHealth } from "@/lib/ops";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await probeDatabaseHealth();

  if (!db.connected) {
    return NextResponse.json(
      {
        ok: false,
        status: "degraded",
        db: {
          connected: false,
          driver: db.driver,
          latencyMs: db.latencyMs,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: "healthy",
    db: {
      connected: true,
      driver: db.driver,
      latencyMs: db.latencyMs,
    },
    timestamp: new Date().toISOString(),
  });
}