import { NextResponse } from "next/server";
import { HttpStatusError, withMobileAuth } from "@/lib/mobile-api";
import {
  isValidExpoPushToken,
  registerMobilePushToken,
  unregisterMobilePushToken,
} from "@/lib/pushNotifications";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();

    if (!isValidExpoPushToken(token)) {
      throw new HttpStatusError(
        "A valid Expo push token (ExponentPushToken[...] or ExpoPushToken[...]) is required.",
        400,
      );
    }

    const platform = body.platform ? String(body.platform) : "android";
    const deviceName = body.deviceName ? String(body.deviceName) : null;

    const registered = await registerMobilePushToken({
      tenantId,
      userId: session.id,
      token,
      platform,
      deviceName,
    });

    return NextResponse.json({
      ok: true,
      registered: true,
      id: registered.id,
      platform: registered.platform,
    });
  });
}

export async function DELETE(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const rawToken =
      typeof body?.token === "string"
        ? body.token
        : url.searchParams.get("token") || "";
    const token = rawToken.trim();

    if (token && !isValidExpoPushToken(token)) {
      throw new HttpStatusError("Invalid Expo push token format.", 400);
    }

    const deactivatedCount = await unregisterMobilePushToken({
      tenantId,
      userId: session.id,
      token: token || null,
    });

    return NextResponse.json({
      ok: true,
      unregistered: true,
      deactivatedCount,
    });
  });
}
