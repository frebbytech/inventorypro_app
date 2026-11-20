import { NextResponse } from "next/server";
import db from "@/db/knex";
import {
  createJWT,
  ensureAuthSchema,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import {
  createTwoFactorChallengeToken,
  ensureSecuritySchema,
  issueAndSendTwoFactorCode,
} from "@/lib/security";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
} from "@/lib/tenant";
import {
  getTenantStoreProfile,
  mapSessionUserToMobile,
} from "@/lib/mobile-api";
import { generateId } from "@/utils/generator";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureAuthSchema();
    await ensureSecuritySchema();

    const body = await req.json().catch(() => ({}));
    const identifier = String(
      body.identifier ?? body.usernameOrEmail ?? "",
    ).trim();
    const password = String(body.password ?? "");
    const workspaceSlug = body.workspaceSlug
      ? String(body.workspaceSlug).trim().toLowerCase()
      : undefined;

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Username/email and password are required." },
        { status: 400 },
      );
    }

    let query = db("users as u")
      .leftJoin("tenants as t", "u.tenant_id", "t.id")
      .select(
        "u.*",
        "t.name as tenant_name",
        "t.slug as tenant_slug",
        "t.status as tenant_status",
      )
      .where((qb) => {
        qb.whereRaw("LOWER(u.username) = ?", [identifier.toLowerCase()]).orWhereRaw(
          "LOWER(u.email) = ?",
          [identifier.toLowerCase()],
        );
      });

    if (workspaceSlug) {
      query = query.andWhereRaw("LOWER(t.slug) = ?", [workspaceSlug]);
    }

    const candidates = await query;
    if (!candidates || candidates.length === 0) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 },
      );
    }

    let user = candidates[0];
    if (candidates.length > 1) {
      const matched: any[] = [];
      for (const candidate of candidates) {
        if (
          candidate.password_hash &&
          (await verifyPassword(password, candidate.password_hash))
        ) {
          matched.push(candidate);
        }
      }
      if (matched.length === 1) {
        user = matched[0];
      } else if (matched.length > 1) {
        return NextResponse.json(
          {
            error:
              "Multiple workspaces use this username. Enter your Workspace Code or sign in with your email address.",
          },
          { status: 409 },
        );
      } else {
        return NextResponse.json(
          { error: "Invalid username or password." },
          { status: 401 },
        );
      }
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

    if (user.locked_until) {
      const lockUntilDate = new Date(user.locked_until);
      if (lockUntilDate > new Date()) {
        const remainingMinutes = Math.max(
          1,
          Math.ceil((lockUntilDate.getTime() - Date.now()) / (1000 * 60)),
        );
        return NextResponse.json(
          {
            error: `Account temporarily locked. Try again in ${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""}.`,
          },
          { status: 423 },
        );
      }
      await db("users")
        .where("id", user.id)
        .update({ failed_login_attempts: 0, locked_until: null });
    }

    let valid = false;
    if (user.password_hash) {
      valid = await verifyPassword(password, user.password_hash);
    } else {
      const defaultHash = await hashPassword(password);
      await db("users").where("id", user.id).update({ password_hash: defaultHash });
      valid = true;
    }

    if (!valid) {
      const attempts = (Number(user.failed_login_attempts) || 0) + 1;
      if (attempts >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await db("users")
          .where("id", user.id)
          .update({ failed_login_attempts: attempts, locked_until: lockUntil });
        return NextResponse.json(
          {
            error:
              "Account locked for 15 minutes after 5 failed login attempts.",
          },
          { status: 423 },
        );
      }
      await db("users")
        .where("id", user.id)
        .update({ failed_login_attempts: attempts });
      return NextResponse.json(
        {
          error: `Invalid username or password. ${5 - attempts} attempt${5 - attempts === 1 ? "" : "s"} remaining.`,
        },
        { status: 401 },
      );
    }

    const tenantId = String(user.tenant_id || DEFAULT_TENANT_ID);
    const tenantSlug = String(user.tenant_slug || DEFAULT_TENANT_SLUG);
    const tenantName = String(user.tenant_name || DEFAULT_TENANT_NAME);

    await db("users")
      .where("id", user.id)
      .update({ failed_login_attempts: 0, locked_until: null });

    if (Boolean(user.two_factor_enabled)) {
      const dispatch = await issueAndSendTwoFactorCode({
        ...user,
        tenant_id: tenantId,
      });
      if (!dispatch.success || !dispatch.codeId) {
        return NextResponse.json(
          {
            error:
              dispatch.error ||
              "Two-factor authentication code delivery failed.",
          },
          { status: 400 },
        );
      }

      const challengeToken = await createTwoFactorChallengeToken({
        userId: user.id,
        tenantId,
        codeId: dispatch.codeId,
        method: dispatch.method,
      });

      return NextResponse.json({
        twoFactorRequired: true,
        challengeToken,
        method: dispatch.method,
        maskedTarget: dispatch.maskedTarget || "",
      });
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const role = user.role === "admin" ? "admin" : "member";

    const token = await createJWT({
      userId: user.id,
      tenantId,
      tenantSlug,
      username: user.username,
      role,
    });

    await db("users").where("id", user.id).update({ last_login_at: nowIso });
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
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Authentication failed." },
      { status: 500 },
    );
  }
}
