import { NextResponse } from "next/server";
import db from "@/db/knex";
import { withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId, token }) => {
    const revokedCount = await db("user_sessions")
      .where({ tenant_id: tenantId, user_id: session.id, is_active: 1 })
      .whereNot("token", token)
      .update({ is_active: 0 });

    return NextResponse.json({ revokedCount });
  });
}
