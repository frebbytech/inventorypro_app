import crypto from "node:crypto";
import type { Database as SqliteDatabase } from "better-sqlite3";
import type { SessionUser } from "@/types/domain";
import { getDb } from "./db";

const JWT_SECRET =
  process.env.MOBILE_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "inventorypro_mobile_dev_jwt_secret_2026";

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

interface JwtClaims {
  sub: string;
  sid: string;
  username: string;
  role: "admin" | "member";
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLength), "base64").toString("utf8");
}

export function signMobileJwt(payload: {
  userId: string;
  sessionId: string;
  username: string;
  role: "admin" | "member";
}): { token: string; expiresAt: string } {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + TOKEN_TTL_SECONDS;
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims: JwtClaims = {
    sub: payload.userId,
    sid: payload.sessionId,
    username: payload.username,
    role: payload.role,
    iat: nowSec,
    exp: expSec,
  };
  const body = base64UrlEncode(JSON.stringify(claims));
  const signature = base64UrlEncode(
    crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest(),
  );
  return {
    token: `${header}.${body}.${signature}`,
    expiresAt: new Date(expSec * 1000).toISOString(),
  };
}

export function verifyMobileJwt(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = base64UrlEncode(
    crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest(),
  );
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const claims = JSON.parse(base64UrlDecode(body)) as JwtClaims;
    if (!claims.sub || !claims.sid || claims.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

export interface AuthenticatedContext {
  db: SqliteDatabase;
  user: SessionUser;
  sessionId: string;
}

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function authenticateRequest(request: Request): AuthenticatedContext | null {
  const token = extractBearerToken(request);
  if (!token) return null;

  const claims = verifyMobileJwt(token);
  if (!claims) return null;

  const db = getDb();
  const session = db
    .prepare(
      `SELECT id, user_id, expires_at, is_active
       FROM user_sessions
       WHERE id = ? AND user_id = ? AND is_active = 1`,
    )
    .get(claims.sid, claims.sub) as
    | { id: string; user_id: string; expires_at: string; is_active: number }
    | undefined;

  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const user = db
    .prepare(
      `SELECT id, username, email, firstname, lastname, phonenumber, role, last_login_at
       FROM users WHERE id = ?`,
    )
    .get(claims.sub) as
    | {
        id: string;
        username: string;
        email: string;
        firstname: string;
        lastname: string;
        phonenumber: string | null;
        role: "admin" | "member";
        last_login_at: string | null;
      }
    | undefined;

  if (!user) return null;

  db.prepare("UPDATE user_sessions SET last_activity_at = datetime('now') WHERE id = ?").run(
    session.id,
  );

  return {
    db,
    sessionId: session.id,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      phonenumber: user.phonenumber ?? undefined,
      role: user.role,
      lastLoginAt: user.last_login_at,
    },
  };
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function unauthorizedResponse(): Response {
  return jsonError("Authentication required or session expired.", 401);
}
