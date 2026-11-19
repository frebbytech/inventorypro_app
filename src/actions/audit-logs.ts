/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { AuditLog, AuditLogView, Result } from "@/types/globals";
import { checkRole } from "@/utils/roles";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { generateId } from "@/utils/generator";
import { getCurrentUser } from "./_actions";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

/**
 * Get all logs – admin gets all in workspace, others see only their own.
 */
export async function getLogs(): Promise<Result<AuditLogView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const query = db("v_audit_logs")
      .where("tenant_id", tenantId)
      .select("*")
      .orderBy("created_at", "desc");

    const isAdmin = await checkRole("admin");
    if (!isAdmin) {
      query.where("user_id", currentUser.id);
    }
    const logs = await query;
    return Result.ok(logs);
  } catch (error: any) {
    console.error("Failed to fetch logs:", error);
    return Result.fail(error?.message || "Failed to fetch logs");
  }
}

/**
 * Get a single log by ID.
 */
export async function getLog(id: string): Promise<Result<AuditLogView>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const query = db("v_audit_logs")
      .select("*")
      .where({ id, tenant_id: tenantId });

    const isAdmin = await checkRole("admin");
    if (!isAdmin) {
      query.andWhere("user_id", currentUser.id);
    }

    const log = await query.first();
    if (!log) {
      return Result.fail("Log not found");
    }
    return Result.ok(log);
  } catch (error: any) {
    console.error("Failed to fetch log:", error);
    return Result.fail(error?.message || "Failed to fetch log");
  }
}

/**
 * Get all logs for a specific entity (by entity_id).
 */
export async function getEntityLogs(
  entityId: string,
): Promise<Result<AuditLogView[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const logs = await db("v_audit_logs")
      .select("*")
      .where({ entity_id: entityId, tenant_id: tenantId })
      .orderBy("created_at", "desc");
    return Result.ok(logs);
  } catch (error: any) {
    console.error("Failed to fetch entity logs:", error);
    return Result.fail(error?.message || "Failed to fetch entity logs");
  }
}

/**
 * Get logs for a specific user (admin only).
 */
export async function getUserLogs(userId: string): Promise<Result<AuditLogView[]>> {
  const currentUser = await getCurrentUser();
  const isAdmin = await checkRole("admin");
  if (!currentUser?.id || !isAdmin) {
    return Result.fail("Not authorized to view these logs");
  }
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  try {
    const logs = await db("v_audit_logs")
      .select("*")
      .where({ user_id: userId, tenant_id: tenantId })
      .orderBy("created_at", "desc");
    return Result.ok(logs);
  } catch (error: any) {
    console.error("Failed to fetch user logs:", error);
    return Result.fail(error?.message || "Failed to fetch user logs");
  }
}

function serializeAuditJson(value: any): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function createAuditLog(logData: {
  entity_type: string;
  entity_id: string;
  action: AuditLog["action"];
  old_values?: any;
  new_values?: any;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new Error("Unauthorized");
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const headersList = await headers();
    ip =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip") ||
      null;
    userAgent = headersList.get("user-agent") || null;
  } catch {
    // Non-request context (e.g., cron / after callback)
  }

  try {
    const result = await db("audit_logs").insert({
      id: generateId(),
      tenant_id: tenantId,
      user_id: currentUser.id,
      entity_type: logData.entity_type,
      entity_id: logData.entity_id,
      action: logData.action,
      old_values: serializeAuditJson(logData.old_values),
      new_values: serializeAuditJson(logData.new_values),
      ip_address: ip,
      user_agent: userAgent,
      created_at: db.fn.now(),
    });
    try {
      revalidatePath("/logs");
    } catch {
      // Ignore outside Next.js render context
    }
    return result;
  } catch (error) {
    console.error("Failed to create audit log:", error);
    throw error;
  }
}

/**
 * Delete a log – admin only.
 */
export async function removeLog(
  id: string,
): Promise<Result<{ success: true }>> {
  const currentUser = await getCurrentUser();
  const isAdmin = await checkRole("admin");
  if (!currentUser?.id || !isAdmin) {
    return Result.fail("Not authorized");
  }
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  try {
    const deletedCount = await db("audit_logs")
      .where({ id, tenant_id: tenantId })
      .del();
    if (deletedCount === 0) {
      return Result.fail("Log not found");
    }
    revalidatePath("/logs");
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete log:", error);
    return Result.fail(error?.message || "Failed to delete log");
  }
}

/**
 * Toggle log active state – not supported in current schema.
 */
export async function toggleLog(
  id: string,
): Promise<Result<{ success: true }>> {
  return Result.fail("toggleLog is not supported in the audit_logs schema");
}
