import { NextResponse } from "next/server";
import db from "@/db/knex";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { HttpStatusError, withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");

    if (!currentPassword || newPassword.length < 6) {
      throw new HttpStatusError(
        "Provide your current password and a new password of at least 6 characters.",
        400,
      );
    }

    const user = await db("users")
      .where({ id: session.id, tenant_id: tenantId })
      .first("id", "password_hash");

    if (!user?.password_hash) {
      throw new HttpStatusError("Account not found.", 404);
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      throw new HttpStatusError("Current password is incorrect.", 400);
    }

    const nextHash = await hashPassword(newPassword);
    await db("users")
      .where({ id: session.id, tenant_id: tenantId })
      .update({
        password_hash: nextHash,
        updated_at: new Date().toISOString(),
      });

    return NextResponse.json({ ok: true });
  });
}
