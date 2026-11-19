import { NextResponse } from "next/server";
import db from "@/db/knex";
import { emitSyncEvent } from "@/lib/sync-bus";
import {
  HttpStatusError,
  mapSessionUserToMobile,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const body = await req.json().catch(() => ({}));
    const firstname = String(body.firstname ?? "").trim();
    const lastname = String(body.lastname ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phonenumber = body.phonenumber ? String(body.phonenumber).trim() : "";

    if (!firstname || !lastname || !email) {
      throw new HttpStatusError(
        "First name, last name, and email are required.",
        400,
      );
    }

    const dupEmail = await db("users")
      .whereRaw("LOWER(email) = ?", [email])
      .whereNot("id", session.id)
      .first("id");
    if (dupEmail) {
      throw new HttpStatusError("Email address is already in use.", 409);
    }

    await db("users")
      .where({ id: session.id, tenant_id: tenantId })
      .update({
        firstname,
        lastname,
        email,
        phonenumber: phonenumber || null,
        updated_at: new Date().toISOString(),
      });

    await emitSyncEvent({
      tenantId,
      entityType: "employee",
      entityId: session.id,
      action: "upsert",
      actorUserId: session.id,
    });

    return NextResponse.json(
      mapSessionUserToMobile({
        ...session,
        firstname,
        lastname,
        email,
        phonenumber,
      }),
    );
  });
}
