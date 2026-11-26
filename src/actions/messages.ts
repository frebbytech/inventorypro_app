"use server";

import { after } from "next/server";
import db from "@/db/knex";
import {
  BroadcastMessage,
  BroadcastRecipient,
  RecipientGroup,
  SendBroadcastInput,
  Result,
} from "@/types/globals";
import { generateId } from "@/utils/generator";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./_actions";
import { checkRole } from "@/utils/roles";
import { createActivityLog } from "./activity-logs";
import { getSettings } from "./settings";
import { sendBulkEmail } from "@/lib/email";
import { sendBulkSms } from "@/lib/sms";
import { getApiSettings } from "./api-settings";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { runWithAuthContext, type RequestSessionContext } from "@/lib/request-context";
import { emitSyncEvent } from "@/lib/sync-bus";
import { dispatchExpoPushNotifications } from "@/lib/pushNotifications";

/**
 * Fetch all eligible recipients for a given group within the current workspace
 */
export async function getRecipientsForGroup(
  group: RecipientGroup,
): Promise<Result<BroadcastRecipient[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) throw new Error("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    let recipients: BroadcastRecipient[] = [];

    if (group === "suppliers") {
      const rows = await db("v_supplier_info")
        .where("tenant_id", tenantId)
        .select(
          "supplier_id",
          "supplier_name",
          "company_name",
          "email",
          "phonenumber",
        )
        .orderBy("supplier_name", "asc");

      recipients = rows.map((r: any) => {
        const email = r.email ? String(r.email).trim() : null;
        const phone = r.phonenumber ? String(r.phonenumber).trim() : null;
        return {
          id: String(r.supplier_id),
          name: r.company_name
            ? `${r.supplier_name} (${r.company_name})`
            : r.supplier_name || "Unnamed Supplier",
          email,
          phonenumber: phone,
          company_name: r.company_name || null,
          hasValidEmail: Boolean(email && email.includes("@")),
          hasValidPhone: Boolean(phone && phone.replace(/\D/g, "").length >= 5),
          canReceiveInApp: false,
        };
      });
    } else if (group === "customers") {
      const rows = await db("v_customer_info")
        .where("tenant_id", tenantId)
        .select("customer_id", "customer_name", "email", "phonenumber")
        .orderBy("customer_name", "asc");

      recipients = rows.map((r: any) => {
        const email = r.email ? String(r.email).trim() : null;
        const phone = r.phonenumber ? String(r.phonenumber).trim() : null;
        return {
          id: String(r.customer_id),
          name: r.customer_name || "Unnamed Customer",
          email,
          phonenumber: phone,
          hasValidEmail: Boolean(email && email.includes("@")),
          hasValidPhone: Boolean(phone && phone.replace(/\D/g, "").length >= 5),
          canReceiveInApp: false,
        };
      });
    } else if (group === "employees") {
      const rows = await db("users")
        .where("tenant_id", tenantId)
        .select(
          "id",
          "username",
          "firstname",
          "lastname",
          "email",
          "phonenumber",
          "role",
        )
        .orderBy("firstname", "asc");

      recipients = rows.map((r: any) => {
        const email = r.email ? String(r.email).trim() : null;
        const phone = r.phonenumber ? String(r.phonenumber).trim() : null;
        const fullName =
          r.firstname && r.lastname
            ? `${r.firstname} ${r.lastname}`
            : r.username || "Employee";

        return {
          id: String(r.id),
          name: fullName,
          email,
          phonenumber: phone,
          role: r.role || "staff",
          hasValidEmail: Boolean(email && email.includes("@")),
          hasValidPhone: Boolean(phone && phone.replace(/\D/g, "").length >= 5),
          canReceiveInApp: true,
        };
      });
    }

    return Result.ok(recipients);
  } catch (error: any) {
    console.error(`Failed to fetch recipients for group ${group}:`, error);
    return Result.fail(
      error?.message || `Failed to fetch recipients for ${group}`,
    );
  }
}

/**
 * Fetch broadcast message history for the current workspace
 */
export async function getBroadcastHistory(): Promise<
  Result<BroadcastMessage[]>
> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) throw new Error("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const history = await db("broadcast_messages")
      .where("tenant_id", tenantId)
      .select("*")
      .orderBy("created_at", "desc");

    return Result.ok(history);
  } catch (error: any) {
    console.error("Failed to fetch broadcast history:", error);
    return Result.fail(error?.message || "Failed to fetch broadcast history");
  }
}

export async function sendBroadcastMessage(
  input: SendBroadcastInput,
): Promise<Result<{ id: string; recipientCount: number; status: "queued" }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized. Please log in.");
    }
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const isAdmin = await checkRole("admin");
    if (!isAdmin) {
      return Result.fail("Only administrators can send broadcast messages.");
    }

    const settingsRes = await getSettings();
    const apiSettings = await getApiSettings();
    if (!settingsRes.success || !settingsRes.data) {
      return Result.fail("Failed to verify system notification settings.");
    }
    const settings = settingsRes.data;

    const { channel, recipientGroup, content, subject, recipientIds } = input;

    if (!content || !content.trim()) {
      return Result.fail("Message content cannot be empty.");
    }

    if (channel === "sms") {
      if (!settings.notification_sms) {
        return Result.fail(
          "SMS broadcasting is currently disabled. Enable SMS notifications in Settings first.",
        );
      }
    } else if (channel === "email") {
      if (!settings.notification_email) {
        return Result.fail(
          "Email broadcasting is currently disabled. Enable Email notifications in Settings first.",
        );
      }
      if (!subject || !subject.trim()) {
        return Result.fail(
          "An Email Subject line is required for email broadcasts.",
        );
      }
    } else if (channel === "in_app") {
      if (recipientGroup !== "employees") {
        return Result.fail(
          "In-App messages can only be sent to internal Employees.",
        );
      }
      if (!settings.notification_push) {
        return Result.fail(
          "In-App and Push broadcasting is currently disabled. Enable Push notifications in Settings first.",
        );
      }
    } else {
      return Result.fail(`Unsupported broadcast channel: ${channel}`);
    }

    const recipientsRes = await getRecipientsForGroup(recipientGroup);
    if (!recipientsRes.success || !recipientsRes.data) {
      return Result.fail("Failed to retrieve recipient list.");
    }

    let candidates = recipientsRes.data;
    if (recipientIds && recipientIds.length > 0) {
      const idSet = new Set(recipientIds);
      candidates = candidates.filter((r) => idSet.has(r.id));
    }
    if (candidates.length === 0) {
      return Result.fail(
        `No recipients selected or available in ${recipientGroup}.`,
      );
    }

    let eligibleRecipients: BroadcastRecipient[] = [];
    if (channel === "email") {
      eligibleRecipients = candidates.filter((r) => r.hasValidEmail);
    } else if (channel === "sms") {
      eligibleRecipients = candidates.filter((r) => r.hasValidPhone);
    } else if (channel === "in_app") {
      eligibleRecipients = candidates.filter((r) => r.canReceiveInApp);
    }
    if (eligibleRecipients.length === 0) {
      const channelLabel =
        channel === "email"
          ? "valid email addresses"
          : channel === "sms"
            ? "valid phone numbers"
            : "active employee accounts";
      return Result.fail(
        `None of the selected recipients have ${channelLabel}.`,
      );
    }

    const broadcastId = generateId();
    const senderName =
      currentUser.firstname && currentUser.lastname
        ? `${currentUser.firstname} ${currentUser.lastname}`
        : currentUser.username || "System Admin";

    const sessionSnapshot: RequestSessionContext = {
      id: currentUser.id,
      tenant_id: tenantId,
      tenant_name: currentUser.tenant_name,
      tenant_slug: currentUser.tenant_slug,
      username: currentUser.username,
      email: currentUser.email,
      firstname: currentUser.firstname,
      lastname: currentUser.lastname,
      role: currentUser.role as "admin" | "member",
      phonenumber: currentUser.phonenumber,
    };

    await db("broadcast_messages").insert({
      id: broadcastId,
      tenant_id: tenantId,
      sender_id: currentUser.id,
      sender_name: senderName,
      recipient_group: recipientGroup,
      channel,
      subject: subject || null,
      content,
      recipient_count: eligibleRecipients.length,
      status: "queued",
      created_at: new Date(),
    });

    await emitSyncEvent({
      tenantId,
      entityType: "message",
      entityId: broadcastId,
      action: "upsert",
      payload: { status: "queued" },
      actorUserId: currentUser.id,
    });

    const dispatchWork = async () => {
      await runWithAuthContext(sessionSnapshot, async () => {
        let deliveredCount = 0;
        let failedCount = 0;
        const failures: { id: string; error: string }[] = [];

        try {
          if (channel === "in_app") {
            const notificationRows = eligibleRecipients.map((employee) => ({
              id: generateId(),
              tenant_id: tenantId,
              user_id: employee.id,
              type: "employee",
              title: subject || "New Admin Broadcast",
              message: content,
              is_read: false,
              reference_type: "broadcast",
              reference_id: broadcastId,
              created_at: new Date(),
            }));
            await db("notifications").insert(notificationRows);
            deliveredCount = eligibleRecipients.length;
            await emitSyncEvent({
              tenantId,
              entityType: "notification",
              entityId: broadcastId,
              action: "refresh",
              actorUserId: sessionSnapshot.id,
            });
            void dispatchExpoPushNotifications({
              tenantId,
              items: notificationRows.map((row) => ({
                userId: row.user_id,
                title: row.title,
                body: row.message,
                data: {
                  notificationId: row.id,
                  type: row.type,
                  referenceType: row.reference_type,
                  referenceId: row.reference_id,
                },
              })),
            }).catch(() => {});
          } else if (channel === "email") {
            const emailById = new Map(
              eligibleRecipients.map((r) => [r.email as string, r.id]),
            );
            const emails = eligibleRecipients.map((r) => r.email as string);
            const bulkRes = await sendBulkEmail(emails, subject as string, {
              text: content,
            });
            for (const r of bulkRes.results) {
              const id = emailById.get(r.to) ?? r.to;
              if (r.success) deliveredCount++;
              else {
                failedCount++;
                failures.push({ id, error: r.error || "Unknown email error" });
              }
            }
          } else if (channel === "sms") {
            const phones = eligibleRecipients
              .map((r) => r.phonenumber)
              .filter((p): p is string => Boolean(p));
            const smsRes = await sendBulkSms(
              phones,
              content,
              apiSettings.data?.arkessel_sender_id || "InvPro",
            );
            if (smsRes.success) {
              deliveredCount = eligibleRecipients.length;
            } else {
              failedCount = eligibleRecipients.length;
              failures.push({
                id: "batch",
                error: smsRes.error || "Unknown SMS provider error",
              });
            }
          }

          const status =
            deliveredCount === 0
              ? "failed"
              : failedCount > 0
                ? "partial"
                : "sent";

          await db("broadcast_messages")
            .where({ id: broadcastId, tenant_id: tenantId })
            .update({ status, updated_at: new Date() });

          await createActivityLog({
            activity_type: "broadcast_sent",
            title: `Sent ${channel.toUpperCase()} broadcast to ${recipientGroup}`,
            description: `Subject: "${subject || "N/A"}" • Delivered to ${deliveredCount}/${eligibleRecipients.length} recipients`,
            metadata: {
              broadcast_id: broadcastId,
              channel,
              recipient_group: recipientGroup,
              deliveredCount,
              failedCount,
              failures: failures.slice(0, 20),
            },
          }).catch(() => {});

          await emitSyncEvent({
            tenantId,
            entityType: "message",
            entityId: broadcastId,
            action: "upsert",
            payload: { status },
            actorUserId: sessionSnapshot.id,
          });
        } catch (err: any) {
          console.error(
            `Broadcast ${broadcastId} dispatch failed in after():`,
            err,
          );
          await db("broadcast_messages")
            .where({ id: broadcastId, tenant_id: tenantId })
            .update({ status: "failed", updated_at: new Date() })
            .catch(() => {});
          await emitSyncEvent({
            tenantId,
            entityType: "message",
            entityId: broadcastId,
            action: "upsert",
            payload: { status: "failed" },
            actorUserId: sessionSnapshot.id,
          });
        }

        try {
          revalidatePath("/admin/messages");
          revalidatePath("/admin/settings");
        } catch {
          // Ignore when invoked outside Next.js render context (e.g. mobile API route)
        }
      });
    };

    try {
      after(dispatchWork);
    } catch {
      // Fallback for non-Next.js request execution (e.g. direct API route invocation without after support)
      void dispatchWork();
    }

    return Result.ok({
      id: broadcastId,
      recipientCount: eligibleRecipients.length,
      status: "queued",
    });
  } catch (error: any) {
    console.error("Failed to queue broadcast message:", error);
    return Result.fail(
      error?.message || "An error occurred while queuing the broadcast.",
    );
  }
}

// export async function sendBroadcastMessage(input: SendBroadcastInput): Promise<
//   Result<{
//     id: string;
//     recipientCount: number;
//     deliveredCount: number;
//     failedCount: number;
//   }>
// > {
//   try {
//     // 1. Check user authentication & admin authorization
//     const currentUser = await getCurrentUser();
//     if (!currentUser?.id) {
//       return Result.fail("Unauthorized. Please log in.");
//     }

//     const isAdmin = await checkRole("admin");
//     if (!isAdmin) {
//       return Result.fail("Only administrators can send broadcast messages.");
//     }

//     // 2. Fetch system notification settings
//     const settingsRes = await getSettings();
//     const apiSettings = await getApiSettings();
//     if (!settingsRes.success || !settingsRes.data) {
//       return Result.fail("Failed to verify system notification settings.");
//     }

//     const settings = settingsRes.data;

//     // 3. Channel setting validation
//     const { channel, recipientGroup, content, subject, recipientIds } = input;

//     if (!content || !content.trim()) {
//       return Result.fail("Message content cannot be empty.");
//     }

//     if (channel === "sms") {
//       if (!settings.notification_sms) {
//         return Result.fail(
//           "SMS broadcasting is currently disabled in system settings (`notification_sms: false`). Please enable SMS in Settings before broadcasting.",
//         );
//       }
//     } else if (channel === "email") {
//       if (!settings.notification_email) {
//         return Result.fail(
//           "Email broadcasting is currently disabled in system settings (`notification_email: false`). Please enable Email in Settings before broadcasting.",
//         );
//       }
//       if (!subject || !subject.trim()) {
//         return Result.fail(
//           "An Email Subject line is required for email broadcasts.",
//         );
//       }
//     } else if (channel === "in_app") {
//       if (recipientGroup !== "employees") {
//         return Result.fail(
//           "In-App messages can only be sent to internal Employees.",
//         );
//       }
//       if (!settings.notification_push) {
//         return Result.fail(
//           "In-App / Push broadcasting is currently disabled in system settings (`notification_push: false`). Please enable Push notifications in Settings.",
//         );
//       }
//     } else {
//       return Result.fail(`Unsupported broadcast channel: ${channel}`);
//     }

//     // 4. Resolve & Filter Target Recipients
//     const recipientsRes = await getRecipientsForGroup(recipientGroup);
//     if (!recipientsRes.success || !recipientsRes.data) {
//       return Result.fail("Failed to retrieve recipient list.");
//     }

//     let candidates = recipientsRes.data;

//     if (recipientIds && recipientIds.length > 0) {
//       const idSet = new Set(recipientIds);
//       candidates = candidates.filter((r) => idSet.has(r.id));
//     }

//     if (candidates.length === 0) {
//       return Result.fail(
//         `No recipients selected or available in ${recipientGroup}.`,
//       );
//     }

//     let eligibleRecipients: BroadcastRecipient[] = [];

//     if (channel === "email") {
//       eligibleRecipients = candidates.filter((r) => r.hasValidEmail);
//     } else if (channel === "sms") {
//       eligibleRecipients = candidates.filter((r) => r.hasValidPhone);
//     } else if (channel === "in_app") {
//       eligibleRecipients = candidates.filter((r) => r.canReceiveInApp);
//     }

//     if (eligibleRecipients.length === 0) {
//       const channelLabel =
//         channel === "email"
//           ? "valid email addresses"
//           : channel === "sms"
//             ? "valid phone numbers"
//             : "active employee accounts";
//       return Result.fail(
//         `None of the selected recipients have ${channelLabel}.`,
//       );
//     }

//     // 5. Dispatch Messages
//     const broadcastId = generateId();
//     const senderName =
//       currentUser.firstname && currentUser.lastname
//         ? `${currentUser.firstname} ${currentUser.lastname}`
//         : currentUser.username || "System Admin";

//     let deliveredCount = 0;
//     let failedCount = 0;
//     const failures: { id: string; error: string }[] = [];

//     if (channel === "in_app") {
//       const notificationRows = eligibleRecipients.map((employee) => ({
//         id: generateId(),
//         user_id: employee.id,
//         type: "employee",
//         title: subject || "New Admin Broadcast",
//         message: content,
//         is_read: false,
//         reference_type: "broadcast",
//         reference_id: broadcastId,
//         created_at: new Date(),
//       }));

//       await db("notifications").insert(notificationRows);
//       // In-app inserts don't fail per-row the way network sends can — a
//       // thrown insert already bails out via the outer try/catch.
//       deliveredCount = eligibleRecipients.length;
//     } else if (channel === "email") {
//       // sendBulkEmail sends individually per recipient (never one call with
//       // everyone in `to`, which would leak every address to every other
//       // recipient) and handles its own concurrency-limited batching.
//       const emailById = new Map(
//         eligibleRecipients.map((r) => [r.email as string, r.id]),
//       );
//       const emails = eligibleRecipients.map((r) => r.email as string);

//       const bulkRes = await sendBulkEmail(emails, subject as string, {
//         text: content,
//       });

//       for (const r of bulkRes.results) {
//         const id = emailById.get(r.to) ?? r.to;
//         if (r.success) deliveredCount++;
//         else {
//           failedCount++;
//           failures.push({ id, error: r.error || "Unknown email error" });
//         }
//       }
//     } else if (channel === "sms") {
//       // Arkessel accepts a batch recipient list in one call, so this stays
//       // a single dispatch rather than per-recipient — no address-leak risk
//       // the way email has, since each recipient only sees their own SMS.
//       const phones = eligibleRecipients
//         .map((r) => r.phonenumber)
//         .filter((p): p is string => Boolean(p));
//       const smsRes = await sendBulkSms(
//         phones,
//         content,
//         apiSettings.data?.arkessel_sender_id || "InvPro",
//       );

//       if (smsRes.success) {
//         deliveredCount = eligibleRecipients.length;
//       } else {
//         failedCount = eligibleRecipients.length;
//         failures.push({
//           id: "batch",
//           error: smsRes.error || "Unknown SMS provider error",
//         });
//       }
//     }

//     if (deliveredCount === 0) {
//       // Nothing actually went out — don't record this as a successful
//       // broadcast.
//       await db("broadcast_messages").insert({
//         id: broadcastId,
//         sender_id: currentUser.id,
//         sender_name: senderName,
//         recipient_group: recipientGroup,
//         channel,
//         subject: subject || null,
//         content,
//         recipient_count: eligibleRecipients.length,
//         status: "failed",
//       });

//       return Result.fail(
//         `Broadcast failed for all ${eligibleRecipients.length} recipient(s). ` +
//           (failures[0]?.error ? `First error: ${failures[0].error}` : ""),
//       );
//     }

//     const status = failedCount > 0 ? "partial" : "sent";

//     await db("broadcast_messages").insert({
//       id: broadcastId,
//       sender_id: currentUser.id,
//       sender_name: senderName,
//       recipient_group: recipientGroup,
//       channel,
//       subject: subject || null,
//       content,
//       recipient_count: eligibleRecipients.length,
//       status,
//     });

//     await createActivityLog({
//       activity_type: "broadcast_sent",
//       title: `Sent ${channel.toUpperCase()} broadcast to ${recipientGroup}`,
//       description: `Subject: "${subject || "N/A"}" • Delivered to ${deliveredCount}/${eligibleRecipients.length} recipients`,
//       metadata: {
//         broadcast_id: broadcastId,
//         channel,
//         recipient_group: recipientGroup,
//         deliveredCount,
//         failedCount,
//         failures: failures.slice(0, 20), // cap so a huge failure list doesn't bloat the log
//       },
//     });

//     revalidatePath("/admin/messages");
//     revalidatePath("/admin/settings");

//     return Result.ok({
//       id: broadcastId,
//       recipientCount: eligibleRecipients.length,
//       deliveredCount,
//       failedCount,
//     });
//   } catch (error: any) {
//     console.error("Failed to send broadcast message:", error);
//     return Result.fail(
//       error?.message || "An error occurred while sending the broadcast.",
//     );
//   }
// }

// "use server";

// import db from "@/db/knex";
// // import { ensureFullDatabaseSchema } from "@/lib/db-init";
// import {
//   BroadcastMessage,
//   BroadcastRecipient,
//   RecipientGroup,
//   SendBroadcastInput,
//   Result,
// } from "@/types/globals";
// import { generateId } from "@/utils/generator";
// import { revalidatePath } from "next/cache";
// import { getCurrentUser } from "./_actions";
// import { checkRole } from "@/utils/roles";
// import { createActivityLog } from "./activity-logs";
// import { getSettings } from "./settings";

// /**
//  * Fetch all eligible recipients for a given group (Suppliers, Customers, or Employees)
//  */
// export async function getRecipientsForGroup(
//   group: RecipientGroup
// ): Promise<Result<BroadcastRecipient[]>> {
//   try {
//     // await ensureFullDatabaseSchema();
//     const currentUser = await getCurrentUser();
//     if (!currentUser?.id) throw new Error("Unauthorized");

//     let recipients: BroadcastRecipient[] = [];

//     if (group === "suppliers") {
//       const rows = await db("v_supplier_info")
//         .select("supplier_id", "supplier_name", "company_name", "email", "phonenumber")
//         .orderBy("supplier_name", "asc");

//       recipients = rows.map((r: any) => {
//         const email = r.email ? String(r.email).trim() : null;
//         const phone = r.phonenumber ? String(r.phonenumber).trim() : null;
//         return {
//           id: String(r.supplier_id),
//           name: r.company_name ? `${r.supplier_name} (${r.company_name})` : r.supplier_name || "Unnamed Supplier",
//           email,
//           phonenumber: phone,
//           company_name: r.company_name || null,
//           hasValidEmail: Boolean(email && email.includes("@")),
//           hasValidPhone: Boolean(phone && phone.replace(/\D/g, "").length >= 5),
//           canReceiveInApp: false,
//         };
//       });
//     } else if (group === "customers") {
//       const rows = await db("v_customer_info")
//         .select("customer_id", "customer_name", "email", "phonenumber")
//         .orderBy("customer_name", "asc");

//       recipients = rows.map((r: any) => {
//         const email = r.email ? String(r.email).trim() : null;
//         const phone = r.phonenumber ? String(r.phonenumber).trim() : null;
//         return {
//           id: String(r.cstomer_id),
//           name: r.customer_name || "Unnamed Customer",
//           email,
//           phonenumber: phone,
//           hasValidEmail: Boolean(email && email.includes("@")),
//           hasValidPhone: Boolean(phone && phone.replace(/\D/g, "").length >= 5),
//           canReceiveInApp: false,
//         };
//       });
//     } else if (group === "employees") {
//       const rows = await db("users")
//         .select("id", "username", "firstname", "lastname", "email", "phonenumber", "role")
//         .orderBy("firstname", "asc");

//       recipients = rows.map((r: any) => {
//         const email = r.email ? String(r.email).trim() : null;
//         const phone = r.phonenumber ? String(r.phonenumber).trim() : null;
//         const fullName =
//           r.firstname && r.lastname
//             ? `${r.firstname} ${r.lastname}`
//             : r.username || "Employee";

//         return {
//           id: String(r.id),
//           name: fullName,
//           email,
//           phonenumber: phone,
//           role: r.role || "staff",
//           hasValidEmail: Boolean(email && email.includes("@")),
//           hasValidPhone: Boolean(phone && phone.replace(/\D/g, "").length >= 5),
//           canReceiveInApp: true,
//         };
//       });
//     }

//     return Result.ok(recipients);
//   } catch (error: any) {
//     console.error(`Failed to fetch recipients for group ${group}:`, error);
//     return Result.fail(error?.message || `Failed to fetch recipients for ${group}`);
//   }
// }

// /**
//  * Fetch broadcast message history
//  */
// export async function getBroadcastHistory(): Promise<Result<BroadcastMessage[]>> {
//   try {
//     // await ensureFullDatabaseSchema();
//     const currentUser = await getCurrentUser();
//     if (!currentUser?.id) throw new Error("Unauthorized");

//     const history = await db("broadcast_messages")
//       .select("*")
//       .orderBy("created_at", "desc");

//     return Result.ok(history);
//   } catch (error: any) {
//     console.error("Failed to fetch broadcast history:", error);
//     return Result.fail(error?.message || "Failed to fetch broadcast history");
//   }
// }

// /**
//  * Send / Dispatch a broadcast message (SMS, Email, or In-App)
//  * Enforces notification setting rules:
//  * - SMS: only if settings.notification_sms === true
//  * - Email: only if settings.notification_email === true
//  * - In-App: only if recipientGroup === 'employees' AND settings.notification_push === true
//  */
// export async function sendBroadcastMessage(
//   input: SendBroadcastInput
// ): Promise<Result<{ id: string; recipientCount: number }>> {
//   try {
//     // await ensureFullDatabaseSchema();

//     // 1. Check user authentication & admin authorization
//     const currentUser = await getCurrentUser();
//     if (!currentUser?.id) {
//       return Result.fail("Unauthorized. Please log in.");
//     }

//     const isAdmin = await checkRole("admin");
//     if (!isAdmin) {
//       return Result.fail("Only administrators can send broadcast messages.");
//     }

//     // 2. Fetch system notification settings
//     const settingsRes = await getSettings();
//     if (!settingsRes.success || !settingsRes.data) {
//       return Result.fail("Failed to verify system notification settings.");
//     }

//     const settings = settingsRes.data;

//     // 3. Channel setting validation
//     const { channel, recipientGroup, content, subject, recipientIds } = input;

//     if (!content || !content.trim()) {
//       return Result.fail("Message content cannot be empty.");
//     }

//     if (channel === "sms") {
//       if (!settings.notification_sms) {
//         return Result.fail(
//           "SMS broadcasting is currently disabled in system settings (`notification_sms: false`). Please enable SMS in Settings before broadcasting."
//         );
//       }
//     } else if (channel === "email") {
//       if (!settings.notification_email) {
//         return Result.fail(
//           "Email broadcasting is currently disabled in system settings (`notification_email: false`). Please enable Email in Settings before broadcasting."
//         );
//       }
//       if (!subject || !subject.trim()) {
//         return Result.fail("An Email Subject line is required for email broadcasts.");
//       }
//     } else if (channel === "in_app") {
//       if (recipientGroup !== "employees") {
//         return Result.fail(
//           "In-App messages can only be sent to internal Employees."
//         );
//       }
//       if (!settings.notification_push) {
//         return Result.fail(
//           "In-App / Push broadcasting is currently disabled in system settings (`notification_push: false`). Please enable Push notifications in Settings."
//         );
//       }
//     } else {
//       return Result.fail(`Unsupported broadcast channel: ${channel}`);
//     }

//     // 4. Resolve & Filter Target Recipients
//     const recipientsRes = await getRecipientsForGroup(recipientGroup);
//     if (!recipientsRes.success || !recipientsRes.data) {
//       return Result.fail("Failed to retrieve recipient list.");
//     }

//     let candidates = recipientsRes.data;

//     // If specific recipient IDs selected, filter down
//     if (recipientIds && recipientIds.length > 0) {
//       const idSet = new Set(recipientIds);
//       candidates = candidates.filter((r) => idSet.has(r.id));
//     }

//     if (candidates.length === 0) {
//       return Result.fail(`No recipients selected or available in ${recipientGroup}.`);
//     }

//     // Filter recipients eligible for the chosen channel
//     let eligibleRecipients: BroadcastRecipient[] = [];

//     if (channel === "email") {
//       eligibleRecipients = candidates.filter((r) => r.hasValidEmail);
//     } else if (channel === "sms") {
//       eligibleRecipients = candidates.filter((r) => r.hasValidPhone);
//     } else if (channel === "in_app") {
//       eligibleRecipients = candidates.filter((r) => r.canReceiveInApp);
//     }

//     if (eligibleRecipients.length === 0) {
//       const channelLabel = channel === "email" ? "valid email addresses" : channel === "sms" ? "valid phone numbers" : "active employee accounts";
//       return Result.fail(`None of the selected recipients have ${channelLabel}.`);
//     }

//     // 5. Dispatch Messages
//     const broadcastId = generateId();
//     const senderName =
//       currentUser.firstname && currentUser.lastname
//         ? `${currentUser.firstname} ${currentUser.lastname}`
//         : currentUser.username || "System Admin";

//     // If In-App, insert records into `notifications` table for employees
//     if (channel === "in_app") {
//       const notificationRows = eligibleRecipients.map((employee) => ({
//         id: generateId(),
//         user_id: employee.id,
//         type: "employee",
//         title: subject || "New Admin Broadcast",
//         message: content,
//         is_read: false,
//         reference_type: "broadcast",
//         reference_id: broadcastId,
//         created_at: new Date(),
//       }));

//       await db("notifications").insert(notificationRows);
//     }

//     // Save Broadcast record to `broadcast_messages` table
//     await db("broadcast_messages").insert({
//       id: broadcastId,
//       sender_id: currentUser.id,
//       sender_name: senderName,
//       recipient_group: recipientGroup,
//       channel: channel,
//       subject: subject || null,
//       content: content,
//       recipient_count: eligibleRecipients.length,
//       status: "sent",
//       created_at: new Date(),
//     });

//     // Create Audit/Activity Log
//     await createActivityLog({
//       activity_type: "broadcast_sent",
//       title: `Sent ${channel.toUpperCase()} broadcast to ${recipientGroup}`,
//       description: `Subject: "${subject || 'N/A'}" • Delivered to ${eligibleRecipients.length} recipients`,
//       metadata: {
//         broadcast_id: broadcastId,
//         channel,
//         recipient_group: recipientGroup,
//         count: eligibleRecipients.length,
//       },
//     });

//     revalidatePath("/admin/messages");
//     revalidatePath("/admin/settings");

//     return Result.ok({
//       id: broadcastId,
//       recipientCount: eligibleRecipients.length,
//     });
//   } catch (error: any) {
//     console.error("Failed to send broadcast message:", error);
//     return Result.fail(error?.message || "An error occurred while sending the broadcast.");
//   }
// }
