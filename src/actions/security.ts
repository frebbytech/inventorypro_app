/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import db from "@/db/knex";
import { createActivityLog } from "@/actions/activity-logs";
import { createAuditLog } from "@/actions/audit-logs";
import { getCurrentUser } from "@/actions/_actions";
import { createJWT, setAuthCookie } from "@/lib/auth";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG } from "@/lib/tenant";
import { emitSyncEvent } from "@/lib/sync-bus";
import {
  createTwoFactorChallengeToken,
  ensureSecuritySchema,
  hashOtpCode,
  issueAndSendTwoFactorCode,
  normalizeTwoFactorMethod,
  verifyTwoFactorChallengeToken,
} from "@/lib/security";
import {
  Result,
  type StaffTwoFactorAccount,
  type TwoFactorMethod,
} from "@/types/globals";
import { generateId } from "@/utils/generator";
import { checkRole } from "@/utils/roles";

function mapUserToTwoFactorAccount(
  row: any,
  currentUserId?: string,
): StaffTwoFactorAccount {
  const firstname = String(row.firstname || "").trim();
  const lastname = String(row.lastname || "").trim();
  const fullname =
    `${firstname} ${lastname}`.trim() || String(row.username || "");

  return {
    id: row.id,
    username: row.username || "",
    email: row.email || "",
    firstname,
    lastname,
    fullname,
    phonenumber: row.phonenumber || "",
    role: row.role === "admin" ? "admin" : "member",
    two_factor_enabled: Boolean(row.two_factor_enabled),
    two_factor_method: normalizeTwoFactorMethod(row.two_factor_method),
    two_factor_updated_at: row.two_factor_updated_at
      ? new Date(row.two_factor_updated_at).toISOString()
      : null,
    last_login_at: row.last_login_at
      ? new Date(row.last_login_at).toISOString()
      : null,
    isCurrentUser: Boolean(currentUserId && row.id === currentUserId),
  };
}

/**
 * Fetch all accounts in the admin's workspace with their 2FA status — admin only.
 */
export async function getStaffTwoFactorAccounts(): Promise<
  Result<StaffTwoFactorAccount[]>
> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    await ensureSecuritySchema();
    const currentUser = await getCurrentUser();
    if (!currentUser?.tenant_id) {
      return Result.fail("Unauthorized");
    }

    const rows = await db("users")
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
        "created_at",
      )
      .where("tenant_id", currentUser.tenant_id)
      .orderByRaw("CASE WHEN role = 'member' THEN 0 ELSE 1 END")
      .orderBy("firstname", "asc")
      .orderBy("username", "asc");

    return Result.ok(
      rows.map((row) => mapUserToTwoFactorAccount(row, currentUser.id)),
    );
  } catch (error: any) {
    console.error("Failed to fetch staff 2FA accounts:", error);
    return Result.fail(
      error?.message || "Failed to load staff security settings",
    );
  }
}

/**
 * Enable, disable, or change the 2FA delivery method for a staff account — admin only.
 */
export async function updateUserTwoFactor(input: {
  userId: string;
  enabled: boolean;
  method?: TwoFactorMethod;
}): Promise<Result<StaffTwoFactorAccount>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    await ensureSecuritySchema();
    const currentUser = await getCurrentUser();
    if (!currentUser?.tenant_id) {
      return Result.fail("Unauthorized");
    }

    const tenantId = currentUser.tenant_id;

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
      .where({ id: input.userId, tenant_id: tenantId })
      .first();

    if (!target) {
      return Result.fail("Staff account not found");
    }

    const nextMethod = normalizeTwoFactorMethod(
      input.method ?? target.two_factor_method,
    );

    if (input.enabled) {
      if (nextMethod === "email" && !String(target.email || "").trim()) {
        return Result.fail(
          `${target.username} does not have an email address on file for Email 2FA.`,
        );
      }
      if (nextMethod === "sms" && !String(target.phonenumber || "").trim()) {
        return Result.fail(
          `${target.username} does not have a phone number on file for SMS 2FA.`,
        );
      }
    }

    const nowIso = new Date().toISOString();

    await db("users")
      .where({ id: input.userId, tenant_id: tenantId })
      .update({
        two_factor_enabled: input.enabled ? 1 : 0,
        two_factor_method: nextMethod,
        two_factor_updated_at: nowIso,
      });

    if (!input.enabled) {
      await db("two_factor_codes")
        .where({ user_id: input.userId, tenant_id: tenantId })
        .whereNull("consumed_at")
        .update({ consumed_at: nowIso })
        .catch(() => {});
    }

    await createAuditLog({
      entity_type: "user",
      entity_id: input.userId,
      action: "update",
      old_values: {
        two_factor_enabled: Boolean(target.two_factor_enabled),
        two_factor_method: normalizeTwoFactorMethod(target.two_factor_method),
      },
      new_values: {
        two_factor_enabled: input.enabled,
        two_factor_method: nextMethod,
      },
    }).catch(() => {});

    await createActivityLog({
      activity_type: "user_two_factor_updated",
      title: `${input.enabled ? "Enabled" : "Disabled"} 2FA for ${target.username}`,
      description: `Two-factor authentication ${input.enabled ? `enabled via ${nextMethod.toUpperCase()}` : "disabled"} by admin`,
      metadata: {
        user_id: input.userId,
        two_factor_enabled: input.enabled,
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
      .where({ id: input.userId, tenant_id: tenantId })
      .first();

    revalidatePath("/admin/settings");
    revalidatePath("/admin/employee");
    await emitSyncEvent({
      tenantId,
      entityType: "employee",
      entityId: input.userId,
      action: "upsert",
      actorUserId: currentUser.id,
    });

    return Result.ok(mapUserToTwoFactorAccount(updated, currentUser.id));
  } catch (error: any) {
    console.error("Failed to update user 2FA setting:", error);
    return Result.fail(
      error?.message || "Failed to update two-factor authentication setting",
    );
  }
}

/**
 * Bulk enable or disable 2FA for multiple staff accounts within tenant — admin only.
 */
export async function bulkUpdateStaffTwoFactor(input: {
  userIds: string[];
  enabled: boolean;
}): Promise<
  Result<{
    updatedCount: number;
    skippedUsernames: string[];
  }>
> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  if (!input.userIds.length) {
    return Result.fail("No staff accounts selected");
  }

  try {
    await ensureSecuritySchema();
    const currentUser = await getCurrentUser();
    if (!currentUser?.tenant_id) {
      return Result.fail("Unauthorized");
    }

    const tenantId = currentUser.tenant_id;

    const targets = await db("users")
      .select(
        "id",
        "username",
        "email",
        "phonenumber",
        "two_factor_enabled",
        "two_factor_method",
      )
      .where("tenant_id", tenantId)
      .whereIn("id", input.userIds);

    const eligibleIds: string[] = [];
    const skippedUsernames: string[] = [];

    for (const user of targets) {
      if (user.id === currentUser.id) {
        continue;
      }

      const method = normalizeTwoFactorMethod(user.two_factor_method);
      if (input.enabled) {
        const hasTarget =
          method === "sms"
            ? Boolean(String(user.phonenumber || "").trim())
            : Boolean(String(user.email || "").trim());
        if (!hasTarget) {
          skippedUsernames.push(user.username || user.id);
          continue;
        }
      }

      eligibleIds.push(user.id);
    }

    const nowIso = new Date().toISOString();

    if (eligibleIds.length > 0) {
      await db("users")
        .where("tenant_id", tenantId)
        .whereIn("id", eligibleIds)
        .update({
          two_factor_enabled: input.enabled ? 1 : 0,
          two_factor_updated_at: nowIso,
        });

      if (!input.enabled) {
        await db("two_factor_codes")
          .where("tenant_id", tenantId)
          .whereIn("user_id", eligibleIds)
          .whereNull("consumed_at")
          .update({ consumed_at: nowIso })
          .catch(() => {});
      }

      await createAuditLog({
        entity_type: "user",
        entity_id: eligibleIds.join(","),
        action: "update",
        new_values: {
          two_factor_enabled: input.enabled,
          affected_count: eligibleIds.length,
        },
      }).catch(() => {});

      await createActivityLog({
        activity_type: "bulk_two_factor_updated",
        title: `${input.enabled ? "Enabled" : "Disabled"} 2FA for ${eligibleIds.length} staff account${eligibleIds.length === 1 ? "" : "s"}`,
        description: `Bulk 2FA update applied by admin`,
        metadata: {
          user_ids: eligibleIds,
          two_factor_enabled: input.enabled,
          skipped_usernames: skippedUsernames,
        },
      }).catch(() => {});

      await emitSyncEvent({
        tenantId,
        entityType: "employee",
        entityId: eligibleIds.join(","),
        action: "refresh",
        actorUserId: currentUser.id,
      });
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin/employee");

    return Result.ok({
      updatedCount: eligibleIds.length,
      skippedUsernames,
    });
  } catch (error: any) {
    console.error("Failed to bulk update staff 2FA:", error);
    return Result.fail(
      error?.message || "Failed to update staff 2FA settings",
    );
  }
}

/**
 * Verify a 6-digit 2FA login code and complete session authentication.
 */
export async function verifyTwoFactorLogin(input: {
  challengeToken: string;
  code: string;
}): Promise<
  Result<{
    id: string;
    role: string;
    username: string;
    tenant_id?: string;
    tenant_slug?: string;
  }>
> {
  try {
    await ensureSecuritySchema();

    const parsed = await verifyTwoFactorChallengeToken(input.challengeToken);
    if (!parsed) {
      return Result.fail(
        "Verification session expired. Please sign in again.",
      );
    }

    const cleanCode = input.code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      return Result.fail("Enter the 6-digit verification code.");
    }

    const challenge = await db("two_factor_codes")
      .where({
        id: parsed.codeId,
        user_id: parsed.userId,
        tenant_id: parsed.tenantId,
      })
      .first();

    if (!challenge || challenge.consumed_at) {
      return Result.fail(
        "This verification code is no longer valid. Request a new code or sign in again.",
      );
    }

    if (new Date(challenge.expires_at) <= new Date()) {
      await db("two_factor_codes")
        .where({ id: challenge.id })
        .update({ consumed_at: new Date().toISOString() });
      return Result.fail(
        "Verification code has expired. Request a new code to continue.",
      );
    }

    const attempts = Number(challenge.attempts || 0) + 1;
    if (attempts > 5) {
      await db("two_factor_codes")
        .where({ id: challenge.id })
        .update({ consumed_at: new Date().toISOString() });
      return Result.fail(
        "Too many incorrect attempts. Please sign in again.",
      );
    }

    if (hashOtpCode(cleanCode) !== challenge.code_hash) {
      await db("two_factor_codes")
        .where({ id: challenge.id })
        .update({ attempts });
      const remaining = Math.max(0, 5 - attempts);
      return Result.fail(
        remaining > 0
          ? `Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Too many incorrect attempts. Please sign in again.",
      );
    }

    const user = await db("users as u")
      .leftJoin("tenants as t", "u.tenant_id", "t.id")
      .select("u.*", "t.slug as tenant_slug", "t.status as tenant_status")
      .where("u.id", parsed.userId)
      .first();
    if (!user) {
      return Result.fail("Account not found");
    }
    if (user.tenant_status === "suspended") {
      return Result.fail(
        "This store workspace is currently suspended. Contact your Super Admin.",
      );
    }

    const tenantId = user.tenant_id || parsed.tenantId || DEFAULT_TENANT_ID;
    const tenantSlug = user.tenant_slug || DEFAULT_TENANT_SLUG;
    const nowIso = new Date().toISOString();

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
      role: user.role || "member",
    });

    await setAuthCookie(token);

    await db("user_sessions")
      .insert({
        id: generateId(),
        tenant_id: tenantId,
        user_id: user.id,
        token,
        is_active: 1,
        last_activity_at: nowIso,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .catch(() => {});

    await createActivityLog({
      activity_type: "user_login",
      title: `User ${user.username} signed in`,
      description: "User completed two-factor authentication",
      metadata: {
        user_id: user.id,
        tenant_id: tenantId,
        two_factor_method: parsed.method,
      },
    }).catch(() => {});

    return Result.ok({
      id: user.id,
      role: user.role || "member",
      username: user.username,
      tenant_id: tenantId,
      tenant_slug: tenantSlug,
    });
  } catch (error: any) {
    console.error("2FA verification failed:", error);
    return Result.fail(error?.message || "Two-factor verification failed");
  }
}

/**
 * Re-issue a fresh 6-digit 2FA verification code using the active challenge token.
 */
export async function resendTwoFactorCode(input: {
  challengeToken: string;
}): Promise<
  Result<{
    challengeToken: string;
    method: TwoFactorMethod;
    maskedTarget: string;
  }>
> {
  try {
    await ensureSecuritySchema();

    const parsed = await verifyTwoFactorChallengeToken(input.challengeToken);
    if (!parsed) {
      return Result.fail(
        "Verification session expired. Please sign in again.",
      );
    }

    const user = await db("users").where("id", parsed.userId).first();
    if (!user || !user.two_factor_enabled) {
      return Result.fail(
        "Two-factor authentication is not active for this account.",
      );
    }

    const tenantId = user.tenant_id || parsed.tenantId || DEFAULT_TENANT_ID;
    const dispatch = await issueAndSendTwoFactorCode({
      ...user,
      tenant_id: tenantId,
    });
    if (!dispatch.success || !dispatch.codeId) {
      return Result.fail(
        dispatch.error || "Unable to resend verification code.",
      );
    }

    const nextChallengeToken = await createTwoFactorChallengeToken({
      userId: user.id,
      tenantId,
      codeId: dispatch.codeId,
      method: dispatch.method,
    });

    return Result.ok({
      challengeToken: nextChallengeToken,
      method: dispatch.method,
      maskedTarget: dispatch.maskedTarget || "",
    });
  } catch (error: any) {
    console.error("Failed to resend 2FA code:", error);
    return Result.fail(error?.message || "Failed to resend verification code");
  }
}
