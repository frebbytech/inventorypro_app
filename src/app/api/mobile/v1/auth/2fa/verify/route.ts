import { NextResponse } from "next/server";
import db from "@/db/knex";
import { createJWT } from "@/lib/auth";
import {
  ensureSecuritySchema,
  hashOtpCode,
  verifyTwoFactorChallengeToken,
} from "@/lib/security";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
  normalizeTenantAccessMode,
} from "@/lib/tenant";
import {
  getTenantStoreProfile,
  mapSessionUserToMobile,
  sanitizeMobileServerError,
} from "@/lib/mobile-api";
import { generateId } from "@/utils/generator";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureSecuritySchema();

    const body = await req.json().catch(() => ({}));
    const challengeToken = String(body.challengeToken ?? "");
    const code = String(body.code ?? "").replace(/\s+/g, "");

    const parsed = await verifyTwoFactorChallengeToken(challengeToken);
    if (!parsed) {
      return NextResponse.json(
        { error: "Verification session expired. Please sign in again." },
        { status: 401 },
      );
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: "Enter the 6-digit verification code." },
        { status: 400 },
      );
    }

    const challenge = await db("two_factor_codes")
      .where({
        id: parsed.codeId,
        user_id: parsed.userId,
        tenant_id: parsed.tenantId,
      })
      .first();

    if (!challenge || challenge.consumed_at) {
      return NextResponse.json(
        { error: "Verification code is no longer valid." },
        { status: 400 },
      );
    }

    if (new Date(challenge.expires_at) <= new Date()) {
      await db("two_factor_codes")
        .where({ id: challenge.id })
        .update({ consumed_at: new Date().toISOString() });
      return NextResponse.json(
        { error: "Verification code has expired." },
        { status: 400 },
      );
    }

    const attempts = Number(challenge.attempts || 0) + 1;
    if (attempts > 5) {
      await db("two_factor_codes")
        .where({ id: challenge.id })
        .update({ consumed_at: new Date().toISOString() });
      return NextResponse.json(
        { error: "Too many incorrect attempts. Please sign in again." },
        { status: 400 },
      );
    }

    if (hashOtpCode(code) !== challenge.code_hash) {
      await db("two_factor_codes").where({ id: challenge.id }).update({ attempts });
      return NextResponse.json(
        {
          error: `Invalid verification code. ${Math.max(0, 5 - attempts)} attempt${5 - attempts === 1 ? "" : "s"} remaining.`,
        },
        { status: 400 },
      );
    }

    const user = await db("users as u")
      .leftJoin("tenants as t", "u.tenant_id", "t.id")
      .select(
        "u.*",
        "t.name as tenant_name",
        "t.slug as tenant_slug",
        "t.status as tenant_status",
        "t.access_mode as tenant_access_mode",
      )
      .where("u.id", parsed.userId)
      .first();

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    if (user.tenant_status === "suspended") {
      return NextResponse.json(
        {
          error:
            "This store workspace is currently suspended. Contact your Super Admin.",
        },
        { status: 403 },
      );
    }

    if (normalizeTenantAccessMode(user.tenant_access_mode) === "web_only") {
      return NextResponse.json(
        {
          error:
            "This workspace is restricted to Web Only access. Sign in via the web dashboard or contact your Super Admin.",
        },
        { status: 403 },
      );
    }

    const tenantId = String(user.tenant_id || parsed.tenantId || DEFAULT_TENANT_ID);
    const tenantSlug = String(user.tenant_slug || DEFAULT_TENANT_SLUG);
    const tenantName = String(user.tenant_name || DEFAULT_TENANT_NAME);
    const role = user.role === "admin" ? "admin" : "member";
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await db("two_factor_codes")
      .where({ id: challenge.id })
      .update({ consumed_at: nowIso });

    await db("users").where("id", user.id).update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: nowIso,
    });

    const token = await createJWT({
      userId: user.id,
      tenantId,
      tenantSlug,
      username: user.username,
      role,
    });

    await db("user_sessions")
      .where("user_id", user.id)
      .andWhere((qb) => {
        qb.where("expires_at", "<", nowIso).orWhere("is_active", 0);
      })
      .del()
      .catch(() => {});

    await db("user_sessions")
      .insert({
        id: generateId(),
        tenant_id: tenantId,
        user_id: user.id,
        token,
        device_name: body.deviceName || "InventoryPro Mobile",
        device_type: body.deviceType || "mobile",
        operating_system: body.operatingSystem || "Mobile App",
        is_active: 1,
        last_activity_at: nowIso,
        expires_at: expiresAt,
      })
      .catch(() => {});

    const sessionUser = {
      id: user.id,
      tenant_id: tenantId,
      tenant_name: tenantName,
      tenant_slug: tenantSlug,
      username: user.username,
      email: user.email || "",
      firstname: user.firstname || "",
      lastname: user.lastname || "",
      phonenumber: user.phonenumber || "",
      role: role as "admin" | "member",
      last_login_at: nowIso,
    };
    const store = await getTenantStoreProfile(tenantId, sessionUser);

    return NextResponse.json({
      token,
      expiresAt,
      user: mapSessionUserToMobile(sessionUser, {
        twoFactorEnabled: Boolean(user.two_factor_enabled),
        twoFactorMethod: user.two_factor_method === "sms" ? "sms" : "email",
      }),
      store,
      tenant: { id: tenantId, name: tenantName, slug: tenantSlug },
    });
  } catch (err: unknown) {
    const sanitized = sanitizeMobileServerError(err, {
      fallbackMessage:
        "Two-factor verification could not be completed. Please try again.",
      context: "mobile/auth/2fa/verify",
    });
    return NextResponse.json(
      { error: sanitized.message, code: sanitized.code },
      { status: sanitized.status },
    );
  }
}
