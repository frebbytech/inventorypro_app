import { NextResponse } from "next/server";
import db from "@/db/knex";
import { withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const updated = await db("user_sessions")
      .where({ id, tenant_id: tenantId, user_id: session.id })
      .update({ is_active: 0 });

    if (!updated) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  });
}
