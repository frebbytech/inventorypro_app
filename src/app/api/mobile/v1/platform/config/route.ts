import { NextResponse } from "next/server";
import { getPlatformMobileConfig } from "@/lib/super-admin";
import { sanitizeMobileServerError } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function resolveRequestOrigin(req: Request): string {
  const forwardedProto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "";
  const forwardedHost =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || "";
  const host = forwardedHost || req.headers.get("host")?.trim() || "";

  if (host && !host.startsWith("0.0.0.0")) {
    const proto =
      forwardedProto ||
      (host.includes("localhost") || host.startsWith("127.0.0.1") || /^\d+\.\d+\.\d+\.\d+/.test(host)
        ? "http"
        : "https");
    return `${proto}://${host}`;
  }

  try {
    const url = new URL(req.url);
    if (url.origin && !url.origin.includes("0.0.0.0")) {
      return url.origin;
    }
  } catch {
    // ignore URL parse failures
  }

  return "";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
  try {
    const config = await getPlatformMobileConfig();
    const resolvedUrl = config.serverUrl || resolveRequestOrigin(req);

    return NextResponse.json(
      {
        ok: true,
        serverUrl: resolvedUrl,
        configuredBySuperAdmin: config.configuredBySuperAdmin,
        updatedAt: config.updatedAt,
      },
      { headers: CORS_HEADERS },
    );
  } catch (err: unknown) {
    const sanitized = sanitizeMobileServerError(err, {
      fallbackMessage:
        "Could not resolve store server settings. Please try again.",
      context: "mobile/platform/config",
    });
    return NextResponse.json(
      {
        ok: false,
        error: sanitized.message,
        code: sanitized.code,
      },
      { status: sanitized.status, headers: CORS_HEADERS },
    );
  }
}
