/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { User, Result, DeleteDataProps, TwoFactorMethod } from "@/types/globals";
import { checkRole } from "@/utils/roles";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { generateId } from "@/utils/generator";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
  normalizeTenantAccessMode,
} from "@/lib/tenant";
import { emitSyncEvent } from "@/lib/sync-bus";
import {
  buildDefaultSettingsRow,
  getAuthSession,
  hashPassword,
  verifyPassword,
  createJWT,
  setAuthCookie,
  getAuthSessionInfo,
  removeAuthCookie,
  ensureAuthSchema,
  registerWorkspaceAccount,
} from "@/lib/auth";
import {
  createTwoFactorChallengeToken,
  ensureSecuritySchema,
  issueAndSendTwoFactorCode,
} from "@/lib/security";

const REMOVABLE_TENANT_TABLES = new Set([
  "products",
  "product_categories",
  "customers",
  "suppliers",
  "sales",
  "inventory",
  "supplier_transactions",
  "notifications",
  "audit_logs",
  "activity_logs",
]);

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

export async function getUserFromDb(id: string) {
  await ensureAuthSchema();
  return db("users as u")
    .leftJoin("tenants as t", "u.tenant_id", "t.id")
    .select(
      "u.id",
      "u.tenant_id",
      "t.name as tenant_name",
      "t.slug as tenant_slug",
      "u.firstname",
      "u.lastname",
      "u.username",
      db.raw("u.firstname || ' ' || u.lastname as fullname"),
      "u.phonenumber",
      "u.email",
      "u.role",
      "u.failed_login_attempts",
      "u.locked_until",
      "u.created_at",
      "u.updated_at",
      "u.last_login_at as lastSignedIn",
    )
    .where("u.id", id)
    .first();
}

export async function getCurrentUser() {
  const session = await getAuthSession();
  if (!session?.id) {
    return null;
  }

  const user = await db("users as u")
    .leftJoin("tenants as t", "u.tenant_id", "t.id")
    .select(
      "u.id",
      "u.tenant_id",
      "t.name as tenant_name",
      "t.slug as tenant_slug",
      "u.username",
      "u.firstname",
      "u.lastname",
      db.raw("u.firstname || ' ' || u.lastname as fullname"),
      "u.email",
      "u.phonenumber",
      "u.role",
      "u.created_at",
      "u.updated_at",
      "u.last_login_at as lastSignedIn",
    )
    .where("u.id", session.id)
    .first();

  if (!user) return null;

  return {
    ...user,
    tenant_id: user.tenant_id || session.tenant_id || DEFAULT_TENANT_ID,
    tenant_name: user.tenant_name || session.tenant_name || DEFAULT_TENANT_NAME,
    tenant_slug: user.tenant_slug || session.tenant_slug || DEFAULT_TENANT_SLUG,
  };
}

// ──────────────────────────────────────────────────────────────
// Auth Actions (Login / Register Workspace / Logout)
// ──────────────────────────────────────────────────────────────

export async function loginUser(formData: {
  usernameOrEmail: string;
  password: string;
  workspaceSlug?: string;
}): Promise<
  Result<{
    id: string;
    role: string;
    username: string;
    tenant_id?: string;
    tenant_slug?: string;
    tenant_name?: string;
    requiresTwoFactor?: boolean;
    challengeToken?: string;
    method?: TwoFactorMethod;
    maskedTarget?: string;
  }>
> {
  await ensureAuthSchema();
  await ensureSecuritySchema();

  try {
    const identifier = formData.usernameOrEmail.trim();
    const workspaceSlug = formData.workspaceSlug?.trim().toLowerCase();

    if (!identifier || !formData.password) {
      return Result.fail("Username/email and password are required");
    }

    let query = db("users as u")
      .leftJoin("tenants as t", "u.tenant_id", "t.id")
      .select(
        "u.*",
        "t.name as tenant_name",
        "t.slug as tenant_slug",
        "t.status as tenant_status",
        "t.access_mode as tenant_access_mode",
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
      return Result.fail("Invalid username or password");
    }

    let user = candidates[0];
    if (candidates.length > 1) {
      const matched: any[] = [];
      for (const candidate of candidates) {
        if (
          candidate.password_hash &&
          (await verifyPassword(formData.password, candidate.password_hash))
        ) {
          matched.push(candidate);
        }
      }
      if (matched.length === 1) {
        user = matched[0];
      } else if (matched.length > 1) {
        return Result.fail(
          "Multiple workspaces use this username. Please enter your Workspace Code or sign in with your email address.",
        );
      } else {
        return Result.fail("Invalid username or password");
      }
    }

    if (user.tenant_status === "suspended") {
      return Result.fail(
        "This store workspace is currently suspended. Contact your Super Admin.",
      );
    }

    const tenantId = user.tenant_id || DEFAULT_TENANT_ID;
    const tenantSlug = user.tenant_slug || DEFAULT_TENANT_SLUG;
    const tenantName = user.tenant_name || DEFAULT_TENANT_NAME;

    // Check account lockout status
    if (user.locked_until) {
      const lockUntilDate = new Date(user.locked_until);
      const now = new Date();

      if (lockUntilDate > now) {
        const remainingMinutes = Math.max(
          1,
          Math.ceil((lockUntilDate.getTime() - now.getTime()) / (1000 * 60)),
        );
        return Result.fail(
          `Account is temporarily locked due to 5 consecutive failed login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""}.`,
        );
      } else {
        await db("users").where("id", user.id).update({
          failed_login_attempts: 0,
          locked_until: null,
        });
        user.failed_login_attempts = 0;
        user.locked_until = null;
      }
    }

    let isValid = false;
    if (user.password_hash) {
      isValid = await verifyPassword(formData.password, user.password_hash);
    } else {
      const defaultHash = await hashPassword(formData.password);
      await db("users")
        .where("id", user.id)
        .update({ password_hash: defaultHash });
      isValid = true;
    }

    if (!isValid) {
      const newAttempts = (Number(user.failed_login_attempts) || 0) + 1;
      const MAX_ATTEMPTS = 5;

      if (newAttempts >= MAX_ATTEMPTS) {
        const lockDurationMinutes = 15;
        const lockUntil = new Date(
          Date.now() + lockDurationMinutes * 60 * 1000,
        ).toISOString();

        await db("users").where("id", user.id).update({
          failed_login_attempts: newAttempts,
          locked_until: lockUntil,
        });

        await createActivityLog({
          activity_type: "user_account_locked",
          title: `Account locked for ${user.username}`,
          description: `Account locked for ${lockDurationMinutes} minutes after ${MAX_ATTEMPTS} failed login attempts`,
          metadata: { user_id: user.id, tenant_id: tenantId },
        }).catch(() => {});

        return Result.fail(
          `Account locked after 5 failed login attempts. Please try again in ${lockDurationMinutes} minutes.`,
        );
      } else {
        await db("users").where("id", user.id).update({
          failed_login_attempts: newAttempts,
        });

        const remainingAttempts = MAX_ATTEMPTS - newAttempts;
        return Result.fail(
          `Invalid username or password. ${remainingAttempts} attempt${remainingAttempts > 1 ? "s" : ""} remaining before account lockout.`,
        );
      }
    }

    // Login credentials verified -> Reset failed login attempts and clear lockout
    await db("users").where("id", user.id).update({
      failed_login_attempts: 0,
      locked_until: null,
    });

    if (normalizeTenantAccessMode(user.tenant_access_mode) === "mobile_only") {
      return Result.fail(
        "This workspace is restricted to Mobile App access only. Sign in on the InventoryPro mobile app or contact your Super Admin.",
      );
    }

    // Enforce Two-Factor Authentication if enabled for this account
    if (Boolean(user.two_factor_enabled)) {
      const dispatch = await issueAndSendTwoFactorCode({
        ...user,
        tenant_id: tenantId,
      });
      if (!dispatch.success || !dispatch.codeId) {
        return Result.fail(
          dispatch.error ||
            "Two-factor authentication is required, but verification code delivery failed.",
        );
      }

      const challengeToken = await createTwoFactorChallengeToken({
        userId: user.id,
        tenantId,
        codeId: dispatch.codeId,
        method: dispatch.method,
      });

      return Result.ok({
        id: user.id,
        role: user.role || "member",
        username: user.username,
        tenant_id: tenantId,
        tenant_slug: tenantSlug,
        tenant_name: tenantName,
        requiresTwoFactor: true,
        challengeToken,
        method: dispatch.method,
        maskedTarget: dispatch.maskedTarget || "",
      });
    }

    const token = await createJWT({
      userId: user.id,
      tenantId,
      tenantSlug,
      username: user.username,
      role: user.role || "member",
    });

    await setAuthCookie(token);

    const nowIso = new Date().toISOString();
    await db("users")
      .where("id", user.id)
      .update({ last_login_at: nowIso });

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
        device_name: "Web Browser",
        device_type: "web",
        operating_system: "Web",
        is_active: 1,
        last_activity_at: nowIso,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .catch(() => {});

    await createActivityLog({
      activity_type: "user_login",
      title: `User ${user.username} signed in`,
      description: "User logged into system successfully",
      metadata: { user_id: user.id, tenant_id: tenantId },
    }).catch(() => {});

    return Result.ok({
      id: user.id,
      role: user.role || "member",
      username: user.username,
      tenant_id: tenantId,
      tenant_slug: tenantSlug,
      tenant_name: tenantName,
    });
  } catch (error: any) {
    console.error("Login failed:", error);
    return Result.fail(error?.message || "Authentication failed");
  }
}

export async function registerWorkspaceAction(_input: {
  storeName: string;
  username: string;
  email: string;
  password: string;
  firstname?: string;
  lastname?: string;
  phonenumber?: string;
  currency?: string;
}): Promise<
  Result<{
    id: string;
    role: string;
    username: string;
    tenant_id: string;
    tenant_slug: string;
    tenant_name: string;
  }>
> {
  return Result.fail(
    "Workspace self-registration is disabled. Contact your Super Admin to provision a new store tenant.",
  );
}

export async function logoutUser(): Promise<Result<{ success: boolean }>> {
  try {
    await removeAuthCookie();
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Logout failed:", error);
    return Result.fail(error?.message || "Failed to log out");
  }
}

export async function getSessionStatus(): Promise<
  Result<{
    authenticated: boolean;
    expiresAt: number | null;
    user: any;
  }>
> {
  try {
    const info = await getAuthSessionInfo();
    if (!info || !info.session) {
      return Result.ok({ authenticated: false, expiresAt: null, user: null });
    }
    return Result.ok({
      authenticated: true,
      expiresAt: info.expiresAt,
      user: info.session,
    });
  } catch (err: any) {
    return Result.fail(err?.message || "Failed to check session status");
  }
}

export async function extendSession(): Promise<
  Result<{
    success: boolean;
    expiresAt: number;
  }>
> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return Result.fail("No active session found to extend");
    }

    const newToken = await createJWT({
      userId: session.id,
      tenantId: session.tenant_id,
      tenantSlug: session.tenant_slug,
      username: session.username,
      role: session.role,
    });

    await setAuthCookie(newToken);

    const newExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    await db("user_sessions")
      .where({ user_id: session.id, tenant_id: session.tenant_id, is_active: 1 })
      .update({
        token: newToken,
        last_activity_at: new Date().toISOString(),
        expires_at: new Date(newExpiresAt).toISOString(),
      })
      .catch(() => {});

    await createActivityLog({
      activity_type: "session_extended",
      title: `Session extended for ${session.username}`,
      description: "User extended active session from warning dialog",
      metadata: { user_id: session.id },
    }).catch(() => {});

    return Result.ok({
      success: true,
      expiresAt: newExpiresAt,
    });
  } catch (error: any) {
    console.error("Failed to extend session:", error);
    return Result.fail(error?.message || "Failed to extend session");
  }
}

// ──────────────────────────────────────────────────────────────
// Read functions (strictly tenant-scoped)
// ──────────────────────────────────────────────────────────────

export async function getUsers(): Promise<Result<User[]>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.tenant_id) {
    return Result.fail("Unauthorized");
  }

  try {
    const users: User[] = await db("users")
      .select(
        "id",
        "tenant_id",
        "firstname",
        "lastname",
        "username",
        db.raw("firstname || ' ' || lastname as fullname"),
        "phonenumber",
        "email",
        "role",
        "failed_login_attempts",
        "locked_until",
        "created_at",
        "updated_at",
      )
      .where("tenant_id", currentUser.tenant_id)
      .whereNot("id", currentUser.id)
      .orderBy("created_at", "desc");

    return Result.ok(users);
  } catch (error: any) {
    console.error("Failed to fetch users:", error);
    return Result.fail(error?.message || "Failed to fetch users");
  }
}

export async function unlockUser(
  id: string,
): Promise<Result<{ success: true }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.tenant_id) {
    return Result.fail("Unauthorized");
  }

  try {
    const user = await getUserFromDb(id);
    if (!user || user.tenant_id !== currentUser.tenant_id) {
      return Result.fail("User not found");
    }

    await db("users")
      .where({ id, tenant_id: currentUser.tenant_id })
      .update({
        failed_login_attempts: 0,
        locked_until: null,
      });

    await createAuditLog({
      entity_type: "user",
      entity_id: id,
      action: "update",
      old_values: {
        locked_until: user.locked_until,
        failed_login_attempts: user.failed_login_attempts,
      },
      new_values: { locked_until: null, failed_login_attempts: 0 },
    });

    await createActivityLog({
      activity_type: "user_unlocked",
      title: `User account unlocked for ${user.username}`,
      description: "Admin unlocked user account",
      metadata: { user_id: id },
    });

    revalidatePath("/admin/employee");
    await emitSyncEvent({
      tenantId: currentUser.tenant_id,
      entityType: "employee",
      entityId: id,
      action: "upsert",
      actorUserId: currentUser.id,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to unlock user:", error);
    return Result.fail(error?.message || "Failed to unlock user");
  }
}

export async function getUser(userId: string): Promise<Result<any>> {
  try {
    const currentUser = await getCurrentUser();
    const user = await getUserFromDb(userId);
    if (!user) {
      return Result.fail("User not found");
    }
    if (
      currentUser?.tenant_id &&
      user.tenant_id &&
      user.tenant_id !== currentUser.tenant_id
    ) {
      return Result.fail("User not found");
    }

    return Result.ok(user);
  } catch (error: any) {
    console.error("Failed to fetch user:", error);
    return Result.fail(error?.message || "Failed to fetch user");
  }
}

// ──────────────────────────────────────────────────────────────
// Create / Update / Delete (strictly tenant-scoped)
// ──────────────────────────────────────────────────────────────

export async function createUser(formData: {
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  phonenumber: string;
  password: string;
  role: "admin" | "member";
}): Promise<Result<{ id: string }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.id || !currentUser?.tenant_id) {
    return Result.fail("Unauthorized");
  }

  const tenantId = currentUser.tenant_id;

  try {
    const cleanUsername = formData.username.trim();
    const cleanEmail = formData.email.trim().toLowerCase();

    const existing = await db("users")
      .where((qb) => {
        qb.where((inner) => {
          inner
            .where("tenant_id", tenantId)
            .whereRaw("LOWER(username) = ?", [cleanUsername.toLowerCase()]);
        }).orWhereRaw("LOWER(email) = ?", [cleanEmail]);
      })
      .first("id", "email");

    if (existing) {
      return Result.fail(
        String(existing.email || "").toLowerCase() === cleanEmail
          ? "Email address already exists"
          : "Username already exists in this workspace",
      );
    }

    const localId = generateId();
    const pwdHash = await hashPassword(formData.password);

    await db("users").insert({
      id: localId,
      tenant_id: tenantId,
      username: cleanUsername,
      email: cleanEmail,
      firstname: formData.firstname.trim(),
      lastname: formData.lastname.trim(),
      phonenumber: formData.phonenumber.trim(),
      role: formData.role,
      password_hash: pwdHash,
    });

    const tenantSettings = await db("settings")
      .where("tenant_id", tenantId)
      .first();

    if (!tenantSettings) {
      await db("settings")
        .insert(
          buildDefaultSettingsRow({
            userId: localId,
            tenantId,
            businessName: currentUser.tenant_name || DEFAULT_TENANT_NAME,
          }),
        )
        .catch(() => {});
    }

    await createAuditLog({
      entity_type: "user",
      entity_id: localId,
      action: "create",
      new_values: {
        username: cleanUsername,
        email: cleanEmail,
        role: formData.role,
        firstname: formData.firstname,
        lastname: formData.lastname,
        phonenumber: formData.phonenumber,
      },
    });

    await createActivityLog({
      activity_type: "user_created",
      title: `User ${cleanUsername} created`,
      description: `Admin created user with role ${formData.role}`,
      metadata: { user_id: localId },
    });

    revalidatePath("/admin/employee");
    await emitSyncEvent({
      tenantId,
      entityType: "employee",
      entityId: localId,
      action: "upsert",
      actorUserId: currentUser.id,
    });

    return Result.ok({ id: localId });
  } catch (error: any) {
    console.error("Failed to create user:", error);
    return Result.fail(error?.message || "Failed to create user");
  }
}

export async function updateUser(formData: {
  id: string;
  username?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  phonenumber?: string;
  role?: "admin" | "member";
}): Promise<Result<{ success: true }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.tenant_id) {
    return Result.fail("Unauthorized");
  }

  const tenantId = currentUser.tenant_id;

  try {
    const fetchedUser = await getUserFromDb(formData.id);
    if (!fetchedUser || fetchedUser.tenant_id !== tenantId) {
      return Result.fail("User not found");
    }

    const updateData: any = {};
    if (formData.username !== undefined) {
      const nextUsername = formData.username.trim();
      const dupUsername = await db("users")
        .where("tenant_id", tenantId)
        .whereRaw("LOWER(username) = ?", [nextUsername.toLowerCase()])
        .whereNot("id", formData.id)
        .first("id");
      if (dupUsername) {
        return Result.fail("Username already exists in this workspace");
      }
      updateData.username = nextUsername;
    }

    if (formData.email !== undefined) {
      const nextEmail = formData.email.trim().toLowerCase();
      const dupEmail = await db("users")
        .whereRaw("LOWER(email) = ?", [nextEmail])
        .whereNot("id", formData.id)
        .first("id");
      if (dupEmail) {
        return Result.fail("Email already exists");
      }
      updateData.email = nextEmail;
    }

    if (formData.firstname !== undefined)
      updateData.firstname = formData.firstname.trim();
    if (formData.lastname !== undefined)
      updateData.lastname = formData.lastname.trim();
    if (formData.role !== undefined) updateData.role = formData.role;
    if (formData.phonenumber !== undefined)
      updateData.phonenumber = formData.phonenumber.trim();

    if (Object.keys(updateData).length > 0) {
      updateData.updated_at = new Date().toISOString();
      await db("users")
        .where({ id: formData.id, tenant_id: tenantId })
        .update(updateData);
    }

    await createAuditLog({
      entity_type: "user",
      entity_id: formData.id,
      action: "update",
      old_values: {
        username: fetchedUser.username,
        email: fetchedUser.email,
        role: fetchedUser.role,
        firstname: fetchedUser.firstname,
        lastname: fetchedUser.lastname,
      },
      new_values: {
        username: formData.username ?? fetchedUser.username,
        email: formData.email ?? fetchedUser.email,
        role: formData.role ?? fetchedUser.role,
        firstname: formData.firstname ?? fetchedUser.firstname,
        lastname: formData.lastname ?? fetchedUser.lastname,
      },
    });

    await createActivityLog({
      activity_type: "user_updated",
      title: `User ${fetchedUser.username} updated`,
      description: "User profile updated",
      metadata: { user_id: formData.id },
    });

    revalidatePath(`/admin/employee/${formData.id}`);
    revalidatePath("/admin/employee");
    await emitSyncEvent({
      tenantId,
      entityType: "employee",
      entityId: formData.id,
      action: "upsert",
      actorUserId: currentUser.id,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to update user:", error);
    return Result.fail(error?.message || "Failed to update user");
  }
}

export async function setRole(
  id: string,
  role: "admin" | "member",
): Promise<Result<{ success: true }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.tenant_id) {
    return Result.fail("Unauthorized");
  }

  try {
    const user = await getUserFromDb(id);
    if (!user || user.tenant_id !== currentUser.tenant_id) {
      return Result.fail("User not found");
    }

    await db("users")
      .where({ id, tenant_id: currentUser.tenant_id })
      .update({ role, updated_at: new Date().toISOString() });

    await createAuditLog({
      entity_type: "user",
      entity_id: id,
      action: "update",
      old_values: { role: user.role },
      new_values: { role },
    });

    await createActivityLog({
      activity_type: "user_role_changed",
      title: `Role changed for ${user.username}`,
      description: `Changed from ${user.role} to ${role}`,
      metadata: { user_id: id },
    });

    revalidatePath("/admin/employee");
    await emitSyncEvent({
      tenantId: currentUser.tenant_id,
      entityType: "employee",
      entityId: id,
      action: "upsert",
      actorUserId: currentUser.id,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to set role:", error);
    return Result.fail(error?.message || "Failed to set role");
  }
}

export async function removeUser(
  id: string,
): Promise<Result<{ success: true }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.tenant_id) {
    return Result.fail("Unauthorized");
  }

  if (id === currentUser.id) {
    return Result.fail("You cannot delete your own active account.");
  }

  try {
    const user = await getUserFromDb(id);
    if (!user || user.tenant_id !== currentUser.tenant_id) {
      return Result.fail("User not found");
    }

    await db("user_sessions")
      .where({ user_id: id, tenant_id: currentUser.tenant_id })
      .del()
      .catch(() => {});
    await db("users")
      .where({ id, tenant_id: currentUser.tenant_id })
      .del();

    await createAuditLog({
      entity_type: "user",
      entity_id: id,
      action: "delete",
      old_values: {
        username: user.username,
        email: user.email,
        role: user.role,
        firstname: user.firstname,
        lastname: user.lastname,
      },
    });

    await createActivityLog({
      activity_type: "user_deleted",
      title: `User ${user.username} deleted`,
      description: "User account permanently removed",
      metadata: { user_id: id },
    });

    revalidatePath("/admin/employee");
    await emitSyncEvent({
      tenantId: currentUser.tenant_id,
      entityType: "employee",
      entityId: id,
      action: "delete",
      actorUserId: currentUser.id,
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete user:", error);
    return Result.fail(error?.message || "Failed to delete user");
  }
}

export async function updatePassword(
  id: string,
  newPassword: string,
): Promise<Result<{ success: true }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.tenant_id) {
    return Result.fail("Unauthorized");
  }

  try {
    const user = await getUserFromDb(id);
    if (!user || user.tenant_id !== currentUser.tenant_id) {
      return Result.fail("User not found");
    }

    const pwdHash = await hashPassword(newPassword);
    await db("users")
      .where({ id, tenant_id: currentUser.tenant_id })
      .update({ password_hash: pwdHash, updated_at: new Date().toISOString() });

    await createAuditLog({
      entity_type: "user",
      entity_id: id,
      action: "update",
      old_values: { password: "[REDACTED]" },
      new_values: { password: "[CHANGED]" },
    });

    await createActivityLog({
      activity_type: "user_password_changed",
      title: `Password changed for ${user.username}`,
      description: "User password updated",
      metadata: { user_id: id },
    });

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to update password:", error);
    return Result.fail(error?.message || "Failed to update password");
  }
}

export async function removeData({
  ids,
  table,
}: DeleteDataProps): Promise<Result<{ deletedCount: number }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.tenant_id) {
    return Result.fail("Unauthorized");
  }

  if (!REMOVABLE_TENANT_TABLES.has(table)) {
    return Result.fail("Bulk deletion is not permitted on this table.");
  }

  try {
    const result = await db(table)
      .where("tenant_id", currentUser.tenant_id)
      .whereIn("id", ids)
      .del();

    await createAuditLog({
      entity_type: table,
      entity_id: ids.join(","),
      action: "delete",
      old_values: { ids },
    });

    const tableEntityMap: Record<string, string> = {
      product_categories: "category",
      products: "product",
      customers: "customer",
      suppliers: "supplier",
      supplier_transactions: "supplier_transaction",
      inventory: "inventory",
      sales: "sale",
      notifications: "notification",
      broadcast_messages: "message",
      users: "employee",
      settings: "settings",
    };

    revalidatePath(`/admin/${table}`);
    await emitSyncEvent({
      tenantId: currentUser.tenant_id,
      entityType: (tableEntityMap[table] || table.replace(/s$/, "")) as any,
      entityId: ids.map(String).join(","),
      action: "refresh",
      actorUserId: currentUser.id,
    });

    return Result.ok({ deletedCount: result });
  } catch (error: any) {
    console.error(`Failed to delete from ${table}:`, error);
    return Result.fail(error?.message || "Failed to delete data");
  }
}
