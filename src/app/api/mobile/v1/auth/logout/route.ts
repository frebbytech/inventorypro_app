import { NextResponse } from "next/server";
import db from "@/db/knex";
import { extractTokenFromRequest, verifyJWT } from "@/lib/auth";
import {
  isValidExpoPushToken,
  unregisterMobilePushToken,
} from "@/lib/pushNotifications";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const token = extractTokenFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const rawPushToken =
      typeof body?.pushToken === "string" ? body.pushToken.trim() : "";

    if (token) {
      const decoded = await verifyJWT(token);
      if (decoded?.userId) {
        await db("user_sessions")
          .where({ user_id: decoded.userId, token })
          .update({ is_active: 0 })
          .catch(() => {});

        if (rawPushToken && isValidExpoPushToken(rawPushToken)) {
          await unregisterMobilePushToken({
            tenantId: decoded.tenantId || "default-tenant",
            userId: decoded.userId,
            token: rawPushToken,
          }).catch(() => {});
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
