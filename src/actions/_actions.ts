/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { User, Result, DeleteDataProps } from "@/types/globals";
import { checkRole } from "@/utils/roles";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { generateId } from "@/utils/generator";
import {
  getAuthSession,
  hashPassword,
  verifyPassword,
  createJWT,
  setAuthCookie,
  getAuthSessionInfo,
  removeAuthCookie,
  ensureAuthSchema,
} from "@/lib/auth";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

export async function getUserFromDb(id: string) {
  await ensureAuthSchema();
  return db("users")
    .select(
      "id",
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
      "last_login_at as lastSignedIn",
    )
    .where("id", id)
    .first();
}

export async function getCurrentUser() {
  const session = await getAuthSession();
  if (!session?.id) {
    // await removeAuthCookie();
    return null;
  }

  return db("users")
    .select(
      "id",
      "username",
      "firstname",
      "lastname",
      db.raw("firstname || ' ' || lastname as fullname"),
      "email",
      "phonenumber",
      "role",
      "created_at",
      "updated_at",
      "last_login_at as lastSignedIn",
    )
    .where("id", session.id)
    .first();
}

// ──────────────────────────────────────────────────────────────
// Auth Actions (Login / Logout)
// ──────────────────────────────────────────────────────────────

export async function loginUser(formData: {
  usernameOrEmail: string;
  password: string;
}): Promise<Result<{ id: string; role: string; username: string }>> {
  await ensureAuthSchema();

  try {
    const user = await db("users")
      .where("username", formData.usernameOrEmail)
      .orWhere("email", formData.usernameOrEmail)
      .first();
    // console.log(user)
    if (!user) {
      return Result.fail("Invalid username or password");
    }

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
        // Lockout expired -> reset count and clear lock
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
      // Legacy or newly seeded user without hash
      // If user has no password_hash set, auto-set password and log in
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
        // Lock account for 15 minutes after 5 failed attempts
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
          metadata: { user_id: user.id },
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

    // Login successful -> Reset failed login attempts and clear lockout
    await db("users").where("id", user.id).update({
      failed_login_attempts: 0,
      locked_until: null,
    });

    const token = await createJWT({
      userId: user.id,
      username: user.username,
      role: user.role || "member",
    });

    await setAuthCookie(token);

    // Update last login timestamp
    await db("users")
      .where("id", user.id)
      .update({ last_login_at: new Date().toISOString() });

    // Save session in sessions table
    await db("user_sessions")
      .insert({
        id: generateId(),
        user_id: user.id,
        token,
        expires_at: new Date(
          Date.now() + 1 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .catch(() => {});

    await createActivityLog({
      activity_type: "user_login",
      title: `User ${user.username} signed in`,
      description: "User logged into system successfully",
      metadata: { user_id: user.id },
    }).catch(() => {});

    return Result.ok({
      id: user.id,
      role: user.role || "member",
      username: user.username,
    });
  } catch (error: any) {
    console.error("Login failed:", error);
    return Result.fail(error?.message || "Authentication failed");
  }
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

/**
 * Check session status and remaining validity
 */
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

/**
 * Extend current session by issuing a new JWT and updating cookie and DB session
 */
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
      username: session.username,
      role: session.role,
    });

    await setAuthCookie(newToken);

    const newExpiresAt = Date.now() + 1 * 24 * 60 * 60 * 1000;

    await db("sessions")
      .where("user_id", session.id)
      .update({
        token: newToken,
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
// Read functions
// ──────────────────────────────────────────────────────────────

/**
 * Get all users – admin only.
 */
export async function getUsers(): Promise<Result<User[]>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  const curentUser = await getCurrentUser();

  try {
    const users: User[] = await db("users")
      .select(
        "id",
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
      .whereNot("id", curentUser?.id || "")
      .orderBy("created_at", "desc");

    return Result.ok(users);
  } catch (error: any) {
    console.error("Failed to fetch users:", error);
    return Result.fail(error?.message || "Failed to fetch users");
  }
}

/**
 * Unlock a locked user account - admin only.
 */
export async function unlockUser(
  id: string,
): Promise<Result<{ success: true }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const user = await getUserFromDb(id);
    if (!user) {
      return Result.fail("User not found");
    }

    await db("users").where("id", id).update({
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
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to unlock user:", error);
    return Result.fail(error?.message || "Failed to unlock user");
  }
}

/**
 * Get a single user by ID.
 */
export async function getUser(userId: string): Promise<Result<any>> {
  try {
    const user = await getUserFromDb(userId);
    if (!user) {
      return Result.fail("User not found");
    }

    return Result.ok(user);
  } catch (error: any) {
    console.error("Failed to fetch user:", error);
    return Result.fail(error?.message || "Failed to fetch user");
  }
}

// ──────────────────────────────────────────────────────────────
// Create / Update / Delete
// ──────────────────────────────────────────────────────────────

/**
 * Create a new user – admin only.
 */
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

  try {
    const existing = await db("users")
      .where("username", formData.username)
      .orWhere("email", formData.email)
      .first();

    if (existing) {
      return Result.fail("Username or email already exists");
    }

    const localId = generateId();
    const pwdHash = await hashPassword(formData.password);

    await db("users").insert({
      id: localId,
      username: formData.username,
      email: formData.email,
      firstname: formData.firstname,
      lastname: formData.lastname,
      phonenumber: formData.phonenumber,
      role: formData.role,
      password_hash: pwdHash,
    });

    const currentUser = await getCurrentUser();

    if (currentUser?.id) {
      const settings = await db("settings")
        .select("*")
        .where("user_id", currentUser.id)
        .first();

      await db("settings")
        .insert({
          ...settings,
          id: generateId(),
          user_id: localId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .catch(() => {});
    }

    await createAuditLog({
      entity_type: "user",
      entity_id: localId,
      action: "create",
      new_values: {
        username: formData.username,
        email: formData.email,
        role: formData.role,
        firstname: formData.firstname,
        lastname: formData.lastname,
        phonenumber: formData.phonenumber,
      },
    });

    await createActivityLog({
      activity_type: "user_created",
      title: `User ${formData.username} created`,
      description: `Admin created user with role ${formData.role}`,
      metadata: { user_id: localId },
    });

    revalidatePath("/admin/employee");
    return Result.ok({ id: localId });
  } catch (error: any) {
    console.error("Failed to create user:", error);
    return Result.fail(error?.message || "Failed to create user");
  }
}

/**
 * Update an existing user – admin only.
 */
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

  try {
    const fetchedUser = await getUserFromDb(formData.id);
    if (!fetchedUser) {
      return Result.fail("User not found");
    }

    const updateData: any = {};
    if (formData.username !== undefined)
      updateData.username = formData.username;
    if (formData.email !== undefined) updateData.email = formData.email;
    if (formData.firstname !== undefined)
      updateData.firstname = formData.firstname;
    if (formData.lastname !== undefined)
      updateData.lastname = formData.lastname;
    if (formData.role !== undefined) updateData.role = formData.role;
    if (formData.phonenumber !== undefined)
      updateData.phonenumber = formData.phonenumber;

    if (Object.keys(updateData).length > 0) {
      await db("users").where("id", formData.id).update(updateData);
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
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to update user:", error);
    return Result.fail(error?.message || "Failed to update user");
  }
}

/**
 * Change user role – admin only.
 */
export async function setRole(
  id: string,
  role: "admin" | "member",
): Promise<Result<{ success: true }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const user = await getUserFromDb(id);
    if (!user) {
      return Result.fail("User not found");
    }

    await db("users").where("id", id).update({ role });

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
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to set role:", error);
    return Result.fail(error?.message || "Failed to set role");
  }
}

/**
 * Delete a user – admin only.
 */
export async function removeUser(
  id: string,
): Promise<Result<{ success: true }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const user = await getUserFromDb(id);
    if (!user) {
      return Result.fail("User not found");
    }

    await db("user_sessions")
      .where("user_id", id)
      .del()
      .catch(() => {});
    await db("users").where("id", id).del();

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
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete user:", error);
    return Result.fail(error?.message || "Failed to delete user");
  }
}

/**
 * Update a user's password – admin only.
 */
export async function updatePassword(
  id: string,
  newPassword: string,
): Promise<Result<{ success: true }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const user = await getUserFromDb(id);
    if (!user) {
      return Result.fail("User not found");
    }

    const pwdHash = await hashPassword(newPassword);
    await db("users").where("id", id).update({ password_hash: pwdHash });

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

/**
 * Bulk delete data from any table – admin only.
 */
export async function removeData({
  ids,
  table,
}: DeleteDataProps): Promise<Result<{ deletedCount: number }>> {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const result = await db(table).whereIn("id", ids).del();

    await createAuditLog({
      entity_type: table,
      entity_id: ids.join(","),
      action: "delete",
      old_values: { ids },
    });

    revalidatePath(`/admin/${table}`);
    return Result.ok({ deletedCount: result });
  } catch (error: any) {
    console.error(`Failed to delete from ${table}:`, error);
    return Result.fail(error?.message || "Failed to delete data");
  }
}
