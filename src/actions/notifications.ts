/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { Notification, InsertNotification, Result } from "@/types/globals";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "./audit-logs";
import { createActivityLog } from "./activity-logs";
import { generateId } from "@/utils/generator";
import { getCurrentUser } from "./_actions";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { emitSyncEvent } from "@/lib/sync-bus";

// ──────────────────────────────────────────────────────────────
// Read functions
// ──────────────────────────────────────────────────────────────

/**
 * Get all notifications for the current authenticated user.
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
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    let query = db("notifications")
      .select("*")
      .where({ tenant_id: tenantId, user_id: currentUser.id })
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
 * Get a single notification by ID – only if it belongs to the current user & workspace.
 */
export async function getNotification(
  id: string,
): Promise<Result<Notification>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const notification = await db("notifications")
      .where({ id, tenant_id: tenantId, user_id: currentUser.id })
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
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const result = await db("notifications")
      .where({ tenant_id: tenantId, user_id: currentUser.id, is_read: false })
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
 * Create a new notification scoped to the target user's tenant.
 */
export async function createNotification(
  notificationData: InsertNotification & { tenant_id?: string },
): Promise<Result<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser().catch(() => null);

    if (!notificationData.user_id) {
      return Result.fail("User ID is required to create a notification");
    }

    if (!notificationData.type || !notificationData.title) {
      return Result.fail("Notification type and title are required");
    }

    let tenantId = notificationData.tenant_id || currentUser?.tenant_id;
    if (!tenantId) {
      const targetUser = await db("users")
        .select("tenant_id")
        .where("id", notificationData.user_id)
        .first();
      tenantId = targetUser?.tenant_id || DEFAULT_TENANT_ID;
    }

    const newId = generateId();
    await db("notifications").insert({
      id: newId,
      tenant_id: tenantId,
      user_id: notificationData.user_id,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message || null,
      is_read: notificationData.is_read ?? false,
      reference_type: notificationData.reference_type || null,
      reference_id: notificationData.reference_id || null,
    });

    if (currentUser?.id) {
      await createActivityLog({
        activity_type: "notification_created",
        title: `Notification sent to user ${notificationData.user_id}`,
        description: notificationData.title,
        metadata: { notification_id: newId, type: notificationData.type },
      }).catch(() => {});
    }

    await emitSyncEvent({
      tenantId,
      entityType: "notification",
      entityId: newId,
      action: "upsert",
      payload: { user_id: notificationData.user_id },
      actorUserId: currentUser?.id || null,
    });

    return Result.ok({ id: newId });
  } catch (error: any) {
    console.error("Failed to create notification:", error);
    return Result.fail(error?.message || "Failed to create notification");
  }
}

/**
 * Mark a single notification as read – only if it belongs to the current user & workspace.
 */
export async function markNotificationAsRead(
  id: string,
): Promise<Result<{ success: true }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const notification = await db("notifications")
      .where({ id, tenant_id: tenantId, user_id: currentUser.id })
      .first();

    if (!notification) {
      return Result.fail("Notification not found");
    }

    if (notification.is_read) {
      return Result.ok({ success: true });
    }

    await db("notifications")
      .where({ id, tenant_id: tenantId })
      .update({ is_read: true, updated_at: db.fn.now() });

    await createActivityLog({
      activity_type: "notification_read",
      title: "Notification marked as read",
      description: notification.title,
      metadata: { notification_id: id },
    }).catch(() => {});

    await emitSyncEvent({
      tenantId,
      entityType: "notification",
      entityId: id,
      action: "upsert",
      payload: { is_read: true, user_id: currentUser.id },
      actorUserId: currentUser.id,
    });

    try {
      revalidatePath("/notifications");
    } catch {
      // Ignore outside Next.js render context
    }
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
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const updated = await db("notifications")
      .where({ tenant_id: tenantId, user_id: currentUser.id, is_read: false })
      .update({ is_read: true, updated_at: db.fn.now() });

    await createActivityLog({
      activity_type: "notifications_all_read",
      title: "All notifications marked as read",
      description: `${updated} notifications updated`,
      metadata: { count: updated },
    }).catch(() => {});

    await emitSyncEvent({
      tenantId,
      entityType: "notification",
      entityId: "all",
      action: "refresh",
      payload: {
        userId: currentUser.id,
        user_id: currentUser.id,
        allRead: true,
        all_read: true,
      },
      actorUserId: currentUser.id,
    });

    try {
      revalidatePath("/notifications");
    } catch {
      // Ignore outside Next.js render context
    }
    return Result.ok({ count: updated });
  } catch (error: any) {
    console.error("Failed to mark all notifications as read:", error);
    return Result.fail(
      error?.message || "Failed to mark all notifications as read",
    );
  }
}

/**
 * Delete a notification – only if it belongs to the current user & workspace.
 */
export async function deleteNotification(
  id: string,
): Promise<Result<{ success: true }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const notification = await db("notifications")
      .where({ id, tenant_id: tenantId, user_id: currentUser.id })
      .first();

    if (!notification) {
      return Result.fail("Notification not found");
    }

    await db("notifications").where({ id, tenant_id: tenantId }).del();

    await createAuditLog({
      entity_type: "notification",
      entity_id: id,
      action: "delete",
      old_values: {
        type: notification.type,
        title: notification.title,
      },
    }).catch(() => {});

    await createActivityLog({
      activity_type: "notification_deleted",
      title: `Notification deleted`,
      description: notification.title,
      metadata: { notification_id: id },
    }).catch(() => {});

    await emitSyncEvent({
      tenantId,
      entityType: "notification",
      entityId: id,
      action: "delete",
      actorUserId: currentUser.id,
    });

    try {
      revalidatePath("/notifications");
    } catch {
      // Ignore outside Next.js render context
    }
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
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const deleted = await db("notifications")
      .where({ tenant_id: tenantId, user_id: currentUser.id })
      .del();

    await createAuditLog({
      entity_type: "notifications",
      entity_id: currentUser.id,
      action: "delete",
      old_values: { user_id: currentUser.id, count: deleted },
    }).catch(() => {});

    await createActivityLog({
      activity_type: "notifications_all_deleted",
      title: "All notifications deleted",
      description: `${deleted} notifications removed`,
      metadata: { count: deleted },
    }).catch(() => {});

    await emitSyncEvent({
      tenantId,
      entityType: "notification",
      entityId: "all",
      action: "delete",
      payload: {
        userId: currentUser.id,
        user_id: currentUser.id,
        allDeleted: true,
      },
      actorUserId: currentUser.id,
    });

    try {
      revalidatePath("/notifications");
    } catch {
      // Ignore outside Next.js render context
    }
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
