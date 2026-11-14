/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { ActivityLog } from "@/types/globals";
import { checkRole } from "@/utils/roles";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { generateId } from "@/utils/generator";
import { getCurrentUser, getUserFromDb } from "./_actions";

/**
 * Get all activity logs – admin sees all, others see only their own.
 */
export async function getActivityLogs() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new Error("Unauthorized");
  const userId = currentUser.id;

  const query = db("v_activity_logs").select("*").orderBy("created_at", "desc");
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
  const log = await db("v_activity_logs").select("*").where("id", id).first();

  if (!log) {
    throw new Error("Activity log not found");
  }

  return log;
}

/**
 * Get activity logs for a specific user.
 * - Admin can view any user's logs.
 * - Non‑admins can only view their own logs.
 */
export async function getUserActivityLogs(userId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new Error("Unauthorized");
  const currentUserId = currentUser.id;

  const isAdmin = await checkRole("admin");

  if (!isAdmin && currentUserId !== userId) {
    throw new Error("Not authorized to view these logs");
  }

  const logs = await db("v_activity_logs")
    .select("*")
    .where("user_id", userId)
    .orderBy("created_at", "desc");

  return logs;
}

/**
 * Create a new activity log entry.
 * @param data - { activity_type, title, description?, metadata? }
 * @returns The inserted record ID(s).
 */
export async function createActivityLog(data: {
  activity_type: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) throw new Error("Unauthorized");

  // Basic validation
  if (!data.activity_type || !data.title) {
    throw new Error("activity_type and title are required");
  }


  // Optionally capture IP and user-agent in metadata
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    null;
  const userAgent = headersList.get("user-agent") || null;

  const enrichedMetadata = {
    ...(data.metadata || {}),
    ...(ip ? { ip_address: ip } : {}),
    ...(userAgent ? { user_agent: userAgent } : {}),
  };

  try {
    const result = await db("activity_logs").insert({
      id: generateId(),
      user_id: currentUser?.id,
      activity_type: data.activity_type,
      title: data.title,
      description: data.description || null,
      metadata: Object.keys(enrichedMetadata).length ? enrichedMetadata : null,
      created_at: db.fn.now(),
    });

    revalidatePath("/activity-logs");
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
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    throw new Error("Not authorized to delete logs");
  }

  try {
    const result = await db("activity_logs").where("id", id).del();
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
 * (Optional) Bulk delete – admin only.
 * @param ids - Array of log IDs.
 */
export async function removeActivityLogs(ids: string[]) {
 const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    throw new Error("Not authorized to delete logs");
  }

  if (!ids || ids.length === 0) {
    throw new Error("No IDs provided");
  }

  try {
    const result = await db("activity_logs").whereIn("id", ids).del();
    revalidatePath("/activity-logs");
    return { deletedCount: result };
  } catch (error) {
    console.error("Failed to delete activity logs:", error);
    throw error;
  }
}

// ─── If you need to update (though rarely) ──────────────────────────────

/**
 * Update an activity log (e.g., modify description or metadata).
 * Admin only, or restrict to own logs? We'll keep admin-only for safety.
 */
export async function updateActivityLog(
  id: string,
  data: Partial<Pick<ActivityLog, "title" | "description" | "metadata">>,
) {
const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    throw new Error("Not authorized to update logs");
  }

  // You can optionally allow users to update only their own logs.
  // For now, admin-only.

  try {
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    if (Object.keys(updateData).length === 0) {
      throw new Error("No fields to update");
    }

    const result = await db("activity_logs").where("id", id).update(updateData);

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
