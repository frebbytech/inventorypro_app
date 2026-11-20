import { NextResponse } from "next/server";
import db from "@/db/knex";
import { createActivityLog } from "@/actions/activity-logs";
import { createAuditLog } from "@/actions/audit-logs";
import { emitSyncEvent } from "@/lib/sync-bus";
import { ensureSecuritySchema, normalizeTwoFactorMethod } from "@/lib/security";
import {
  getTwoFactorChannelStatus,
  HttpStatusError,
  mapTwoFactorAccountRow,
  parseDbBool,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    await ensureSecuritySchema();

    const isAdmin = session.role === "admin";
    const [channels, rows] = await Promise.all([
      getTwoFactorChannelStatus(tenantId),
      isAdmin
        ? db("users")
            .select(
              "id",
              "username",
              "email",
              "firstname",
              "lastname",
              "phonenumber",
              "role",
              "two_factor_enabled",
              "two_factor_method",
              "two_factor_updated_at",
              "last_login_at",
            )
            .where("tenant_id", tenantId)
            .orderByRaw("CASE WHEN role = 'member' THEN 0 ELSE 1 END")
            .orderBy("firstname", "asc")
            .orderBy("username", "asc")
        : db("users")
            .select(
              "id",
              "username",
              "email",
              "firstname",
              "lastname",
              "phonenumber",
              "role",
              "two_factor_enabled",
              "two_factor_method",
              "two_factor_updated_at",
              "last_login_at",
            )
            .where({ tenant_id: tenantId, id: session.id }),
    ]);

    const accounts = rows.map((row: any) =>
      mapTwoFactorAccountRow(row, session.id),
    );
    const currentUserAccount =
      accounts.find((a) => a.id === session.id) ??
      accounts[0] ?? {
        id: session.id,
        username: session.username,
        email: session.email,
        firstname: session.firstname,
        lastname: session.lastname,
        fullname:
          `${session.firstname} ${session.lastname}`.trim() || session.username,
        phonenumber: session.phonenumber || "",
        role: session.role,
        twoFactorEnabled: false,
        twoFactorMethod: "email" as const,
        twoFactorUpdatedAt: null,
        lastLoginAt: session.last_login_at ?? null,
        isCurrentUser: true,
      };

    return NextResponse.json({
      currentUserAccount,
      accounts,
      emailConfigured: channels.emailConfigured,
      smsConfigured: channels.smsConfigured,
    });
  });
}

export async function PATCH(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    await ensureSecuritySchema();

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.userId ?? session.id).trim();
    const isAdmin = session.role === "admin";

    if (targetUserId !== session.id && !isAdmin) {
      throw new HttpStatusError(
        "Administrator privileges are required to update another user's 2FA policy.",
        403,
      );
    }

    const target = await db("users")
      .select(
        "id",
        "tenant_id",
        "username",
        "email",
        "firstname",
        "lastname",
        "phonenumber",
        "role",
        "two_factor_enabled",
        "two_factor_method",
        "two_factor_updated_at",
        "last_login_at",
      )
      .where({ id: targetUserId, tenant_id: tenantId })
      .first();

    if (!target) {
      throw new HttpStatusError("Account not found.", 404);
    }

    const enabled =
      body.enabled !== undefined
        ? Boolean(body.enabled)
        : parseDbBool(target.two_factor_enabled, false);
    const nextMethod = normalizeTwoFactorMethod(
      body.method ?? target.two_factor_method,
    );

    if (enabled) {
      if (nextMethod === "email" && !String(target.email || "").trim()) {
        throw new HttpStatusError(
          `${target.username} does not have an email address on file for Email 2FA.`,
          400,
        );
      }
      if (nextMethod === "sms" && !String(target.phonenumber || "").trim()) {
        throw new HttpStatusError(
          `${target.username} does not have a phone number on file for SMS 2FA.`,
          400,
        );
      }
    }

    const nowIso = new Date().toISOString();

    await db("users")
      .where({ id: targetUserId, tenant_id: tenantId })
      .update({
        two_factor_enabled: enabled,
        two_factor_method: nextMethod,
        two_factor_updated_at: nowIso,
      });

    if (!enabled) {
      await db("two_factor_codes")
        .where({ user_id: targetUserId, tenant_id: tenantId })
        .whereNull("consumed_at")
        .update({ consumed_at: nowIso })
        .catch(() => {});
    }

    await createAuditLog({
      entity_type: "user",
      entity_id: targetUserId,
      action: "update",
      old_values: {
        two_factor_enabled: parseDbBool(target.two_factor_enabled, false),
        two_factor_method: normalizeTwoFactorMethod(target.two_factor_method),
      },
      new_values: {
        two_factor_enabled: enabled,
        two_factor_method: nextMethod,
      },
    }).catch(() => {});

    await createActivityLog({
      activity_type: "user_two_factor_updated",
      title: `${enabled ? "Enabled" : "Disabled"} 2FA for ${target.username}`,
      description: `Two-factor authentication ${
        enabled ? `enabled via ${nextMethod.toUpperCase()}` : "disabled"
      } from mobile`,
      metadata: {
        user_id: targetUserId,
        two_factor_enabled: enabled,
        two_factor_method: nextMethod,
      },
    }).catch(() => {});

    const updated = await db("users")
      .select(
        "id",
        "username",
        "email",
        "firstname",
        "lastname",
        "phonenumber",
        "role",
        "two_factor_enabled",
        "two_factor_method",
        "two_factor_updated_at",
        "last_login_at",
      )
      .where({ id: targetUserId, tenant_id: tenantId })
      .first();

    const dto = mapTwoFactorAccountRow(updated, session.id);

    await emitSyncEvent({
      tenantId,
      entityType: "employee",
      entityId: targetUserId,
      action: "upsert",
      payload: {
        id: dto.id,
        twoFactorEnabled: dto.twoFactorEnabled,
        twoFactorMethod: dto.twoFactorMethod,
        updatedAt: nowIso,
      },
      actorUserId: session.id,
    });

    return NextResponse.json(dto);
  });
}
