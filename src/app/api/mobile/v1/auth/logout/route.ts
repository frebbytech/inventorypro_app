import { NextResponse } from "next/server";
import db from "@/db/knex";
import { extractTokenFromRequest, verifyJWT } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const token = extractTokenFromRequest(req);
    if (token) {
      const decoded = await verifyJWT(token);
      if (decoded?.userId) {
        await db("user_sessions")
          .where({ user_id: decoded.userId, token })
          .update({ is_active: 0 })
          .catch(() => {});
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
