/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { Notification, InsertNotification, Result } from "@/types/globals";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { generateId } from "@/utils/generator";
import { getCurrentUser } from "./_actions";

// ──────────────────────────────────────────────────────────────
// Read functions
// ──────────────────────────────────────────────────────────────

/**
 * Get all notifications for the current authenticated user.
 * Optionally filter by read status and limit.
 */
export async function getNotifications(options?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<Result<Notification[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }

    let query = db("notifications")
      .select("*")
      .where("user_id", currentUser?.id)
      .orderBy("created_at", "desc");

    if (options?.unreadOnly) {
      query = query.where("is_read", false);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const notifications: Notification[] = await query;
    return Result.ok(notifications);
  } catch (error: any) {
    console.error("Failed to fetch notifications:", error);
    return Result.fail(error?.message || "Failed to fetch notifications");
  }
}

/**
 * Get a single notification by ID – only if it belongs to the current user.
 */
export async function getNotification(
  id: string,
): Promise<Result<Notification>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }

    const notification = await db("notifications")
      .where("id", id)
      .andWhere("user_id", currentUser?.id)
      .first();

    if (!notification) {
      return Result.fail("Notification not found");
    }

    return Result.ok(notification);
  } catch (error: any) {
    console.error("Failed to fetch notification:", error);
    return Result.fail(error?.message || "Failed to fetch notification");
  }
}

/**
 * Get the count of unread notifications for the current user.
 */
export async function getUnreadCount(): Promise<Result<{ count: number }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }

    const result = await db("notifications")
      .where("user_id", currentUser?.id)
      .andWhere("is_read", false)
      .count("id as count")
      .first();

    return Result.ok({ count: Number(result?.count) || 0 });
  } catch (error: any) {
    console.error("Failed to get unread count:", error);
    return Result.fail(error?.message || "Failed to get unread count");
  }
}

// ──────────────────────────────────────────────────────────────
// Create / Update (mark read) / Delete
// ──────────────────────────────────────────────────────────────

/**
 * Create a new notification – usually called internally by other services.
 * Can be exposed for administrative creation if needed.
 */
export async function createNotification(
  notificationData: InsertNotification,
): Promise<Result<{ id: string }>> {
  try {
    // You may want to restrict who can create notifications.
    // For now, allow any authenticated user (or system) to create.
    // If you want only admins, add a role check.
    const currentUser = await getCurrentUser();
    if (!currentUser.id) {
      // If the notification is for another user, we still need to know who.
      // For simplicity, we require a target user_id in the data.
      if (!notificationData.user_id) {
        return Result.fail("User ID is required to create a notification");
      }
    } else {
      // If the caller is authenticated, we can override user_id with the logged-in user?
      // Usually notifications are for others, so we keep the provided user_id.
      // If no user_id provided, we could default to the current user.
      // Let's enforce that user_id is always provided.
      if (!notificationData.user_id) {
        return Result.fail("User ID is required to create a notification");
      }
    }

    // Validate required fields
    if (!notificationData.type || !notificationData.title) {
      return Result.fail("Notification type and title are required");
    }

    const newId = generateId();
    await db("notifications").insert({
      id: newId,
      user_id: notificationData.user_id,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message || null,
      is_read: notificationData.is_read ?? false,
      reference_type: notificationData.reference_type || null,
      reference_id: notificationData.reference_id || null,
    });

    // No audit log for every notification creation (could be noisy), but we can log an activity.
    await createActivityLog({
      activity_type: "notification_created",
      title: `Notification sent to user ${notificationData.user_id}`,
      description: notificationData.title,
      metadata: { notification_id: newId, type: notificationData.type },
    });

    return Result.ok({ id: newId });
  } catch (error: any) {
    console.error("Failed to create notification:", error);
    return Result.fail(error?.message || "Failed to create notification");
  }
}

/**
 * Mark a single notification as read – only if it belongs to the current user.
 */
export async function markNotificationAsRead(
  id: string,
): Promise<Result<{ success: true }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }

    const notification = await db("notifications")
      .where("id", id)
      .andWhere("user_id", currentUser?.id)
      .first();

    if (!notification) {
      return Result.fail("Notification not found");
    }

    // If already read, we can still return success.
    if (notification.is_read) {
      return Result.ok({ success: true });
    }

    await db("notifications")
      .where("id", id)
      .update({ is_read: true, updated_at: db.fn.now() });

    // No audit log, but we may log an activity.
    await createActivityLog({
      activity_type: "notification_read",
      title: "Notification marked as read",
      description: notification.title,
      metadata: { notification_id: id },
    });

    revalidatePath("/notifications");
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to mark notification as read:", error);
    return Result.fail(error?.message || "Failed to mark notification as read");
  }
}

/**
 * Mark all notifications as read for the current user.
 */
export async function markAllNotificationsAsRead(): Promise<
  Result<{ count: number }>
> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }

    const updated = await db("notifications")
      .where("user_id", currentUser?.id)
      .andWhere("is_read", false)
      .update({ is_read: true, updated_at: db.fn.now() });

    await createActivityLog({
      activity_type: "notifications_all_read",
      title: "All notifications marked as read",
      description: `${updated} notifications updated`,
      metadata: { count: updated },
    });

    revalidatePath("/notifications");
    return Result.ok({ count: updated });
  } catch (error: any) {
    console.error("Failed to mark all notifications as read:", error);
    return Result.fail(
      error?.message || "Failed to mark all notifications as read",
    );
  }
}

/**
 * Delete a notification – only if it belongs to the current user.
 */
export async function deleteNotification(
  id: string,
): Promise<Result<{ success: true }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }

    const notification = await db("notifications")
      .where("id", id)
      .andWhere("user_id", currentUser?.id)
      .first();

    if (!notification) {
      return Result.fail("Notification not found");
    }

    await db("notifications").where("id", id).del();

    // Audit log for deletion (optional)
    await createAuditLog({
      entity_type: "notification",
      entity_id: id,
      action: "delete",
      old_values: {
        type: notification.type,
        title: notification.title,
      },
    });

    await createActivityLog({
      activity_type: "notification_deleted",
      title: `Notification deleted`,
      description: notification.title,
      metadata: { notification_id: id },
    });

    revalidatePath("/notifications");
    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Failed to delete notification:", error);
    return Result.fail(error?.message || "Failed to delete notification");
  }
}

/**
 * Delete all notifications for the current user (clear all).
 */
export async function deleteAllNotifications(): Promise<
  Result<{ count: number }>
> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }

    const deleted = await db("notifications")
      .where("user_id", currentUser?.id)
      .del();

    await createAuditLog({
      entity_type: "notifications",
      entity_id: currentUser?.id,
      action: "delete",
      old_values: { user_id: currentUser?.id, count: deleted },
    });

    await createActivityLog({
      activity_type: "notifications_all_deleted",
      title: "All notifications deleted",
      description: `${deleted} notifications removed`,
      metadata: { count: deleted },
    });

    revalidatePath("/notifications");
    return Result.ok({ count: deleted });
  } catch (error: any) {
    console.error("Failed to delete all notifications:", error);
    return Result.fail(error?.message || "Failed to delete all notifications");
  }
}

// ──────────────────────────────────────────────────────────────
// Utility: Create a notification for a specific user
// (can be used by other modules)
// ──────────────────────────────────────────────────────────────

// export async function sendNotification(
//   userId: string,
//   type: string,
//   title: string,
//   message?: string,
//   relatedEntityType?: string,
//   relatedEntityId?: string,
// ): Promise<Result<{ id: string }>> {
  
  
 
//  const d= createNotification({
//     id: generateId(),
//     user_id: userId,
//     type,
//     title,
//     message,
//     reference_type: relatedEntityType,
//     reference_id: relatedEntityId,
//     is_read: false,
//   });



// }
