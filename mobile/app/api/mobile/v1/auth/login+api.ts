import crypto from "node:crypto";
import { jsonError, signMobileJwt } from "@/server/auth";
import { getDb, verifyPasswordSync } from "@/server/db";
import { getStoreProfile } from "@/server/queries";

interface LoginRequestBody {
  identifier?: string;
  password?: string;
  deviceName?: string;
}

export async function POST(request: Request) {
  let body: LoginRequestBody;
  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  const identifier = body.identifier?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!identifier || !password) {
    return jsonError("Username/email and password are required.", 400);
  }

  const db = getDb();
  const user = db
    .prepare(
      `SELECT id, username, email, password_hash, firstname, lastname, phonenumber, role,
              failed_login_attempts, locked_until, last_login_at
       FROM users
       WHERE LOWER(username) = ? OR LOWER(email) = ?
       LIMIT 1`,
    )
    .get(identifier, identifier) as
    | {
        id: string;
        username: string;
        email: string;
        password_hash: string;
        firstname: string;
        lastname: string;
        phonenumber: string | null;
        role: "admin" | "member";
        failed_login_attempts: number;
        locked_until: string | null;
        last_login_at: string | null;
      }
    | undefined;

  if (!user) {
    return jsonError("Invalid credentials.", 401);
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return jsonError("Account temporarily locked. Try again shortly.", 423);
  }

  const valid = verifyPasswordSync(password, user.password_hash);
  if (!valid) {
    const nextAttempts = (user.failed_login_attempts || 0) + 1;
    const lockedUntil =
      nextAttempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
    db.prepare(
      `UPDATE users
       SET failed_login_attempts = ?, locked_until = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(nextAttempts, lockedUntil, user.id);
    return jsonError("Invalid credentials.", 401);
  }

  const sessionId = `sess-${crypto.randomUUID()}`;
  const { token, expiresAt } = signMobileJwt({
    userId: user.id,
    sessionId,
    username: user.username,
    role: user.role,
  });

  const nowIso = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `UPDATE users
       SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(nowIso, nowIso, user.id);

    db.prepare(
      `INSERT INTO user_sessions (
        id, user_id, token, device_name, device_type, operating_system, is_active, last_activity_at, expires_at
      ) VALUES (?, ?, ?, ?, 'mobile', 'expo', 1, ?, ?)`,
    ).run(
      sessionId,
      user.id,
      token,
      body.deviceName?.slice(0, 120) || "Inventory Pro Mobile",
      nowIso,
      expiresAt,
    );

    db.prepare(
      `INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, new_values)
       VALUES (?, ?, 'user', ?, 'login', ?)`,
    ).run(
      `aud-${crypto.randomUUID()}`,
      user.id,
      user.id,
      JSON.stringify({ sessionId, channel: "mobile" }),
    );

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const store = getStoreProfile(db);

  return Response.json({
    token,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      phonenumber: user.phonenumber ?? undefined,
      role: user.role,
      lastLoginAt: nowIso,
    },
    store,
  });
}
