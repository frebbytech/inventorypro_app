import "server-only";
import db from "@/db/knex";
import { generateId } from "@/utils/generator";
import { emitSyncEvent } from "@/lib/sync-bus";
import { dispatchExpoPushNotifications } from "@/lib/pushNotifications";
import { buildEmailHtml, sendBulkEmail } from "@/lib/email";
import { sendBulkSms } from "@/lib/sms";
import {
  parseDbBool,
  parseMemberSaleAlertChannels,
  type MobileMemberSaleAlertChannel,
} from "@/lib/mobile-api";

export interface MemberSaleAlertParams {
  tenantId: string;
  saleId: string;
  receiptNumber: string;
  totalAmount: number;
  itemCount: number;
  paymentMode: string;
  customerName: string;
  currency?: string | null;
  member: {
    id: string;
    role?: string | null;
    fullname?: string | null;
    username?: string | null;
  };
}

export interface MemberSaleAlertDispatchResult {
  dispatched: boolean;
  channels: MobileMemberSaleAlertChannel[];
  inAppRecipients: number;
  emailSent: number;
  smsSent: number;
  skippedReason?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSaleMoney(amount: number, currency: string): string {
  const safeCurrency = (currency || "GHS").trim().toUpperCase();
  const numeric = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${safeCurrency} ${numeric.toFixed(2)}`;
  }
}

function formatPaymentLabel(mode: string): string {
  const clean = String(mode || "cash").trim().toLowerCase();
  if (clean === "momo") return "Mobile Money";
  if (clean === "bank") return "Bank Transfer";
  if (clean === "cheque") return "Cheque";
  return "Cash";
}

export async function notifyAdminsOfMemberSale(
  params: MemberSaleAlertParams,
): Promise<MemberSaleAlertDispatchResult> {
  const actorRole = String(params.member.role || "").trim().toLowerCase();
  if (actorRole === "admin" || actorRole === "super_admin") {
    return {
      dispatched: false,
      channels: [],
      inAppRecipients: 0,
      emailSent: 0,
      smsSent: 0,
      skippedReason: "actor_is_admin",
    };
  }

  try {
    const settingsRow = await db("settings")
      .where("tenant_id", params.tenantId)
      .first(
        "member_sale_alert_enabled",
        "member_sale_alert_channels",
        "business_name",
        "business_email",
        "business_phone",
        "currency",
        "logo",
        "eod_admin_email",
        "eod_admin_phone",
      );

    if (!settingsRow || !parseDbBool(settingsRow.member_sale_alert_enabled, false)) {
      return {
        dispatched: false,
        channels: [],
        inAppRecipients: 0,
        emailSent: 0,
        smsSent: 0,
        skippedReason: "disabled",
      };
    }

    const channels = parseMemberSaleAlertChannels(
      settingsRow.member_sale_alert_channels,
      ["in_app"],
    );
    if (channels.length === 0) {
      return {
        dispatched: false,
        channels: [],
        inAppRecipients: 0,
        emailSent: 0,
        smsSent: 0,
        skippedReason: "no_channels",
      };
    }

    const adminRows = (await db("users")
      .where("tenant_id", params.tenantId)
      .whereIn("role", ["admin", "super_admin", "manager"])
      .select("id", "email", "phonenumber")) as Array<{
      id: string;
      email?: string | null;
      phonenumber?: string | null;
    }>;

    const currency = String(
      params.currency || settingsRow.currency || "GHS",
    ).trim();
    const formattedTotal = formatSaleMoney(params.totalAmount, currency);
    const memberName =
      String(params.member.fullname || params.member.username || "Team member").trim() ||
      "Team member";
    const customerName =
      String(params.customerName || "Walk-in Customer").trim() ||
      "Walk-in Customer";
    const receiptLabel =
      String(params.receiptNumber || params.saleId.slice(0, 8)).trim();
    const paymentLabel = formatPaymentLabel(params.paymentMode);
    const itemLabel = `${params.itemCount} ${params.itemCount === 1 ? "item" : "items"}`;
    const businessName =
      String(settingsRow.business_name || "Inventory Pro").trim() ||
      "Inventory Pro";

    const title = `Member Sale · #${receiptLabel}`;
    const summaryText = `${memberName} recorded a ${paymentLabel} sale of ${formattedTotal} (${itemLabel}) to ${customerName}.`;
    const nowIso = new Date().toISOString();

    let inAppRecipients = 0;
    let emailSent = 0;
    let smsSent = 0;

    const tasks: Promise<void>[] = [];

    if (channels.includes("in_app") && adminRows.length > 0) {
      tasks.push(
        (async () => {
          const pushItems: Array<{
            userId: string;
            title: string;
            body: string;
            data: Record<string, unknown>;
          }> = [];

          for (const admin of adminRows) {
            if (!admin.id || admin.id === params.member.id) continue;
            const notifId = generateId();
            const inserted = await db("notifications")
              .insert({
                id: notifId,
                tenant_id: params.tenantId,
                user_id: admin.id,
                type: "sale",
                title,
                message: summaryText,
                reference_type: "sale",
                reference_id: params.saleId,
                is_read: 0,
                created_at: nowIso,
                updated_at: nowIso,
              })
              .then(() => true)
              .catch(() => false);

            if (inserted) {
              inAppRecipients += 1;
              await emitSyncEvent({
                tenantId: params.tenantId,
                entityType: "notification",
                entityId: notifId,
                action: "upsert",
                payload: { userId: admin.id, user_id: admin.id },
                actorUserId: params.member.id,
              }).catch(() => {});

              pushItems.push({
                userId: admin.id,
                title,
                body: summaryText,
                data: {
                  notificationId: notifId,
                  type: "sale",
                  referenceType: "sale",
                  referenceId: params.saleId,
                },
              });
            }
          }

          if (pushItems.length > 0) {
            await dispatchExpoPushNotifications({
              tenantId: params.tenantId,
              items: pushItems,
            }).catch(() => {});
          }
        })(),
      );
    }

    if (channels.includes("email")) {
      tasks.push(
        (async () => {
          const adminEmails = Array.from(
            new Set(
              adminRows
                .map((a) => String(a.email || "").trim())
                .filter((e) => e.includes("@")),
            ),
          );
          const fallbackEmail = String(
            settingsRow.eod_admin_email || settingsRow.business_email || "",
          ).trim();
          const emailRecipients =
            adminEmails.length > 0
              ? adminEmails
              : fallbackEmail.includes("@")
                ? [fallbackEmail]
                : [];

          if (emailRecipients.length === 0) return;

          const subject = `[${businessName}] ${title} — ${formattedTotal}`;
          const textBody = `${businessName} Member Sale Alert\n\nCashier: ${memberName}\nReceipt: #${receiptLabel}\nCustomer: ${customerName}\nItems: ${itemLabel}\nPayment: ${paymentLabel}\nTotal: ${formattedTotal}`;
          const htmlBody = buildEmailHtml({
            businessName: escapeHtml(businessName),
            logoUrl:
              typeof settingsRow.logo === "string" &&
              settingsRow.logo.startsWith("https://")
                ? settingsRow.logo
                : null,
            title: escapeHtml(title),
            bodyHtml: `
              <p>A team member just completed a sale in <strong>${escapeHtml(businessName)}</strong>.</p>
              <table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
                <tr><td style="color:#666;">Cashier</td><td align="right"><strong>${escapeHtml(memberName)}</strong></td></tr>
                <tr><td style="color:#666;">Receipt</td><td align="right">#${escapeHtml(receiptLabel)}</td></tr>
                <tr><td style="color:#666;">Customer</td><td align="right">${escapeHtml(customerName)}</td></tr>
                <tr><td style="color:#666;">Items</td><td align="right">${escapeHtml(itemLabel)}</td></tr>
                <tr><td style="color:#666;">Payment</td><td align="right">${escapeHtml(paymentLabel)}</td></tr>
                <tr style="border-top:1px solid #eee;"><td style="font-weight:bold;">Total</td><td align="right" style="font-weight:bold;">${escapeHtml(formattedTotal)}</td></tr>
              </table>
            `,
          });

          const emailRes = await sendBulkEmail(
            emailRecipients,
            subject,
            { text: textBody, html: htmlBody },
            { tenantId: params.tenantId },
          );
          emailSent = emailRes.sentCount;
        })(),
      );
    }

    if (channels.includes("sms")) {
      tasks.push(
        (async () => {
          const adminPhones = Array.from(
            new Set(
              adminRows
                .map((a) => String(a.phonenumber || "").trim())
                .filter((p) => p.replace(/\D/g, "").length >= 9),
            ),
          );
          const fallbackPhone = String(
            settingsRow.eod_admin_phone || settingsRow.business_phone || "",
          ).trim();
          const smsRecipients =
            adminPhones.length > 0
              ? adminPhones
              : fallbackPhone.replace(/\D/g, "").length >= 9
                ? [fallbackPhone]
                : [];

          if (smsRecipients.length === 0) return;

          const smsMessage = `[${businessName}] ${memberName} made sale #${receiptLabel}: ${formattedTotal} (${itemLabel}, ${paymentLabel}) to ${customerName}.`;
          const smsRes = await sendBulkSms(
            smsRecipients,
            smsMessage.slice(0, 320),
            undefined,
            params.tenantId,
          );
          smsSent = smsRes.success ? smsRecipients.length : 0;
        })(),
      );
    }

    await Promise.allSettled(tasks);

    return {
      dispatched: inAppRecipients > 0 || emailSent > 0 || smsSent > 0,
      channels,
      inAppRecipients,
      emailSent,
      smsSent,
    };
  } catch (err) {
    console.error("[member-sale-alerts] failed to dispatch admin sale alert:", err);
    return {
      dispatched: false,
      channels: [],
      inAppRecipients: 0,
      emailSent: 0,
      smsSent: 0,
      skippedReason: "error",
    };
  }
}
