import { NextResponse } from "next/server";
import db from "@/db/knex";
import {
  createTwoFactorChallengeToken,
  ensureSecuritySchema,
  issueAndSendTwoFactorCode,
  verifyTwoFactorChallengeToken,
} from "@/lib/security";
import {
  DEFAULT_TENANT_ID,
  normalizeTenantAccessMode,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureSecuritySchema();
    const body = await req.json().catch(() => ({}));
    const challengeToken = String(body.challengeToken ?? "");

    const parsed = await verifyTwoFactorChallengeToken(challengeToken);
    if (!parsed) {
      return NextResponse.json(
        { error: "Verification session expired. Please sign in again." },
        { status: 401 },
      );
    }

    const user = await db("users as u")
      .leftJoin("tenants as t", "u.tenant_id", "t.id")
      .select("u.*", "t.status as tenant_status", "t.access_mode as tenant_access_mode")
      .where("u.id", parsed.userId)
      .first();
    if (!user || !user.two_factor_enabled) {
      return NextResponse.json(
        { error: "Two-factor authentication is not enabled for this account." },
        { status: 400 },
      );
    }
    if (user.tenant_status === "suspended") {
      return NextResponse.json(
        { error: "This store workspace is currently suspended. Contact your Super Admin." },
        { status: 403 },
      );
    }
    if (normalizeTenantAccessMode(user.tenant_access_mode) === "web_only") {
      return NextResponse.json(
        { error: "This workspace is restricted to Web Only access. Sign in via the web dashboard or contact your Super Admin." },
        { status: 403 },
      );
    }

    const tenantId = String(user.tenant_id || parsed.tenantId || DEFAULT_TENANT_ID);
    const dispatch = await issueAndSendTwoFactorCode({
      ...user,
      tenant_id: tenantId,
    });
    if (!dispatch.success || !dispatch.codeId) {
      return NextResponse.json(
        { error: dispatch.error || "Unable to resend verification code." },
        { status: 400 },
      );
    }

    const nextChallengeToken = await createTwoFactorChallengeToken({
      userId: user.id,
      tenantId,
      codeId: dispatch.codeId,
      method: dispatch.method,
    });

    return NextResponse.json({
      challengeToken: nextChallengeToken,
      method: dispatch.method,
      maskedTarget: dispatch.maskedTarget || "",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to resend verification code." },
      { status: 500 },
    );
  }
}
