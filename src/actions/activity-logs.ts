/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { ActivityLog } from "@/types/globals";
import { checkRole } from "@/utils/roles";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { generateId } from "@/utils/generator";
import { getCurrentUser } from "./_actions";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

/**
 * Get all activity logs – admin sees all in workspace, others see only their own.
 */
export async function getActivityLogs() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new Error("Unauthorized");
  const userId = currentUser.id;
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  const query = db("v_activity_logs")
    .where("tenant_id", tenantId)
    .select("*")
    .orderBy("created_at", "desc");
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    query.where("user_id", userId);
  }

  const logs = await query;
  return logs;
}

/**
 * Get a single activity log by ID.
 */
export async function getActivityLog(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new Error("Unauthorized");
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  const query = db("v_activity_logs")
    .select("*")
    .where({ id, tenant_id: tenantId });

  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    query.andWhere("user_id", currentUser.id);
  }

  const log = await query.first();

  if (!log) {
    throw new Error("Activity log not found");
  }

  return log;
}

/**
 * Get activity logs for a specific user within the current workspace.
 */
export async function getUserActivityLogs(userId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new Error("Unauthorized");
  const currentUserId = currentUser.id;
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  const isAdmin = await checkRole("admin");

  if (!isAdmin && currentUserId !== userId) {
    throw new Error("Not authorized to view these logs");
  }

  const logs = await db("v_activity_logs")
    .select("*")
    .where({ user_id: userId, tenant_id: tenantId })
    .orderBy("created_at", "desc");

  return logs;
}

/**
 * Create a new activity log entry.
 */
export async function createActivityLog(data: {
  activity_type: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new Error("Unauthorized");
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  if (!data.activity_type || !data.title) {
    throw new Error("activity_type and title are required");
  }

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

  const enrichedMetadata = {
    ...(data.metadata || {}),
    ...(ip ? { ip_address: ip } : {}),
    ...(userAgent ? { user_agent: userAgent } : {}),
  };

  try {
    const result = await db("activity_logs").insert({
      id: generateId(),
      tenant_id: tenantId,
      user_id: currentUser.id,
      activity_type: data.activity_type,
      title: data.title,
      description: data.description || null,
      metadata: Object.keys(enrichedMetadata).length
        ? JSON.stringify(enrichedMetadata)
        : null,
      created_at: db.fn.now(),
    });

    try {
      revalidatePath("/activity-logs");
    } catch {
      // Ignore outside Next.js render context
    }
    return result;
  } catch (error) {
    console.error("Failed to create activity log:", error);
    throw new Error("Database error while creating activity log");
  }
}

/**
 * Delete an activity log – admin only.
 */
export async function removeActivityLog(id: string) {
  const currentUser = await getCurrentUser();
  const isAdmin = await checkRole("admin");
  if (!currentUser?.id || !isAdmin) {
    throw new Error("Not authorized to delete logs");
  }
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  try {
    const result = await db("activity_logs")
      .where({ id, tenant_id: tenantId })
      .del();
    if (result === 0) {
      throw new Error("Activity log not found");
    }
    revalidatePath("/activity-logs");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete activity log:", error);
    throw error;
  }
}

/**
 * Bulk delete – admin only.
 */
export async function removeActivityLogs(ids: string[]) {
  const currentUser = await getCurrentUser();
  const isAdmin = await checkRole("admin");
  if (!currentUser?.id || !isAdmin) {
    throw new Error("Not authorized to delete logs");
  }
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  if (!ids || ids.length === 0) {
    throw new Error("No IDs provided");
  }

  try {
    const result = await db("activity_logs")
      .where("tenant_id", tenantId)
      .whereIn("id", ids)
      .del();
    revalidatePath("/activity-logs");
    return { deletedCount: result };
  } catch (error) {
    console.error("Failed to delete activity logs:", error);
    throw error;
  }
}

/**
 * Update an activity log. Admin only.
 */
export async function updateActivityLog(
  id: string,
  data: Partial<Pick<ActivityLog, "title" | "description" | "metadata">>,
) {
  const currentUser = await getCurrentUser();
  const isAdmin = await checkRole("admin");
  if (!currentUser?.id || !isAdmin) {
    throw new Error("Not authorized to update logs");
  }
  const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

  try {
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.metadata !== undefined) {
      updateData.metadata =
        typeof data.metadata === "string"
          ? data.metadata
          : JSON.stringify(data.metadata);
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error("No fields to update");
    }

    const result = await db("activity_logs")
      .where({ id, tenant_id: tenantId })
      .update(updateData);

    if (result === 0) {
      throw new Error("Activity log not found");
    }

    revalidatePath("/activity-logs");
    return { success: true };
  } catch (error) {
    console.error("Failed to update activity log:", error);
    throw error;
  }
}
