import { NextResponse } from "next/server";
import db from "@/db/knex";
import { withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const res = await db("notifications")
      .where({ tenant_id: tenantId, user_id: session.id, is_read: 0 })
      .count("id as count")
      .first();

    return NextResponse.json({ count: Number(res?.count ?? 0) });
  });
}
