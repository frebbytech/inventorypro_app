import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "inventorypro_default_jwt_secret_key_2026_change_in_prod",
);

const COOKIE_NAME = process.env.COOKIE_NAME || "auth_session";
const SUPER_ADMIN_COOKIE_NAME = "super_admin_session";

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ignore static assets, next internal files, and APIs
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Dedicated Super Admin portal routing (completely isolated from tenant sessions)
  if (pathname === "/super-admin/login" || pathname.startsWith("/super-admin")) {
    const superToken = request.cookies.get(SUPER_ADMIN_COOKIE_NAME)?.value;
    let superSession: { superAdminId: string; scope: string } | null = null;

    if (superToken) {
      try {
        const { payload } = await jwtVerify(superToken, JWT_SECRET);
        if (
          payload?.scope === "super_admin" &&
          typeof payload?.superAdminId === "string"
        ) {
          superSession = {
            superAdminId: payload.superAdminId,
            scope: payload.scope,
          };
        }
      } catch {
        superSession = null;
      }
    }

    if (pathname === "/super-admin/login") {
      if (superSession) {
        return NextResponse.redirect(new URL("/super-admin", request.url));
      }
      return NextResponse.next();
    }

    if (!superSession) {
      return NextResponse.redirect(new URL("/super-admin/login", request.url));
    }

    return NextResponse.next();
  }

  const isPublicRoute =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up");

  const token = request.cookies.get(COOKIE_NAME)?.value;

  let session: {
    userId: string;
    tenantId?: string;
    username: string;
    role: "admin" | "member";
  } | null = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (payload?.scope !== "super_admin" && typeof payload?.userId === "string") {
        session = payload as unknown as {
          userId: string;
          tenantId?: string;
          username: string;
          role: "admin" | "member";
        };
      }
    } catch {
      session = null;
    }
  }

  // Redirect unauthenticated users to sign-in page if accessing protected routes
  if (!session && !isPublicRoute) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    return NextResponse.redirect(signInUrl);
  }

  // Clear stale cookie when redirected from a server layout/page due to missing DB session
  if (isPublicRoute && request.nextUrl.searchParams.get("session") === "expired") {
    const res = NextResponse.next();
    if (token) {
      res.cookies.delete(COOKIE_NAME);
    }
    return res;
  }

  // Redirect authenticated users away from public auth pages
  if (session && isPublicRoute) {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  // Protect admin routes
  if (pathname.startsWith("/admin") && session?.role !== "admin") {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  // matcher: [
  //   "/((?!api|_next/static|_next/image|favicon.ico|.*\\.js|.*\\.css).*)",
  // ],
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
