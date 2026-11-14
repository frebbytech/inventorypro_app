import crypto from "node:crypto";
import { authenticateRequest } from "@/server/auth";

export async function POST(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return Response.json({ ok: true });
  }

  auth.db.prepare("UPDATE user_sessions SET is_active = 0 WHERE id = ?").run(
    auth.sessionId,
  );
  auth.db
    .prepare(
      `INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, new_values)
       VALUES (?, ?, 'user', ?, 'logout', ?)`,
    )
    .run(
      `aud-${crypto.randomUUID()}`,
      auth.user.id,
      auth.user.id,
      JSON.stringify({ sessionId: auth.sessionId }),
    );

  return Response.json({ ok: true });
}
