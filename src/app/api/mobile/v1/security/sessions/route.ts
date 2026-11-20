import { NextResponse } from "next/server";
import db from "@/db/knex";
import { withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId, token }) => {
    const rows = await db("user_sessions")
      .where({ tenant_id: tenantId, user_id: session.id })
      .orderBy("is_active", "desc")
      .orderBy("created_at", "desc")
      .limit(25)
      .select("*");

    return NextResponse.json(
      rows.map((s: any) => ({
        id: String(s.id),
        deviceName: String(s.device_name || s.browser || "Active Device"),
        deviceType: String(s.device_type || "device"),
        operatingSystem: String(s.operating_system || "Unknown OS"),
        isActive: Boolean(Number(s.is_active ?? 1)),
        isCurrent: Boolean(token && s.token === token),
        lastActivityAt: s.last_activity_at ? String(s.last_activity_at) : null,
        expiresAt: String(s.expires_at || new Date().toISOString()),
        createdAt: String(s.created_at || new Date().toISOString()),
      })),
    );
  });
}
