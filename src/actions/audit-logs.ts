/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { AuditLog, AuditLogView, Result } from "@/types/globals";
import { checkRole } from "@/utils/roles";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { generateId } from "@/utils/generator";
import { getCurrentUser, getUserFromDb } from "./_actions";

/**
 * Get all logs – admin gets all, others see only their own.
 */
export async function getLogs(): Promise<Result<AuditLogView[]>> {
  try {
    const currentUser = await getCurrentUser();
    const query = db("v_audit_logs").select("*").orderBy("created_at", "desc");

   const isAdmin = await checkRole("admin");
  if (!isAdmin) {
      query.where("user_id", currentUser?.id);
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
    const log = await db("v_audit_logs").select("*").where("id", id).first();
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
    const logs = await db("v_audit_logs")
      .select("*")
      .where("entity_id", entityId)
      .orderBy("created_at", "desc");
    return Result.ok(logs);
  } catch (error: any) {
    console.error("Failed to fetch entity logs:", error);
    return Result.fail(error?.message || "Failed to fetch entity logs");
  }
}

/**
 * Get logs for a specific user (admin only or user viewing own logs).
 */
export async function getUserLogs(userId: string): Promise<Result<AuditLogView[]>> {
 const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized to view these logs");
  }

  try {
    const logs = await db("v_audit_logs")
      .select("*")
      .where("user_id", userId)
      .orderBy("created_at", "desc");
    return Result.ok(logs);
  } catch (error: any) {
    console.error("Failed to fetch user logs:", error);
    return Result.fail(error?.message || "Failed to fetch user logs");
  }
}

/**
 * Create a new audit log entry.
 * Expects: entity_type, entity_id, action, old_values?, new_values?
 */

// export async function createAuditLog(logData: {
//   entity_type: string;
//   entity_id: string;
//   action: AuditLog["action"];
//   old_values?: any;
//   new_values?: any;
// }): Promise<Result<{ id: string }>> {
//   try {
//     const { userId } = await auth();
//     if (!userId) throw new Error("Unauthorized");

//     const currentUser = await getUserFromDb(userId);

//     // Get IP and user-agent from request headers
//     const headersList = await headers();
//     const ip =
//       headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
//       headersList.get("x-real-ip") ||
//       null;
//     const userAgent = headersList.get("user-agent") || null;

//     const newId = generateId();
//     await db("audit_logs").insert({
//       id: newId,
//       user_id: currentUser?.id,
//       entity_type: logData.entity_type,
//       entity_id: logData.entity_id,
//       action: logData.action,
//       old_values: logData.old_values || null,
//       new_values: logData.new_values || null,
//       ip_address: ip,
//       user_agent: userAgent,
//       created_at: db.fn.now(),
//     });

//     revalidatePath("/logs");
//     return Result.ok({ id: newId });
//   } catch (error: any) {
//     console.error("Failed to create audit log:", error);
//     return Result.fail(error?.message || "Failed to create audit log");
//   }
// }
export async function createAuditLog(logData: {
  entity_type: string;
  entity_id: string;
  action: AuditLog["action"];
  old_values?: any;
  new_values?: any;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new Error("Unauthorized");


  // Get IP and user-agent from request headers
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    null;
  const userAgent = headersList.get("user-agent") || null;

  try {
    const result = await db("audit_logs").insert({
      id: generateId(),
      user_id: currentUser?.id,
      entity_type: logData.entity_type,
      entity_id: logData.entity_id,
      action: logData.action,
      old_values: logData.old_values || null,
      new_values: logData.new_values || null,
      ip_address: ip,
      user_agent: userAgent,
      created_at: db.fn.now(),
    });
    revalidatePath("/logs");
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
const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    return Result.fail("Not authorized");
  }

  try {
    const deletedCount = await db("audit_logs").where("id", id).del();
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
