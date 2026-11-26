import "server-only";
import { getDecryptedApiCredentials } from "@/actions/api-settings";

// ── Types ──
export interface SmsPayload {
  /** Single recipient phone (e.g., "024XXXXXXX") or multiple */
  to: string | string[];
  message: string;
  /** Overrides the sender ID from settings */
  senderId?: string;
  /** Optional tenant override for server/mobile background sends */
  tenantId?: string;
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  raw?: any;
}

// ── Core sender ──
export async function sendSms(payload: SmsPayload): Promise<SmsResult> {
  try {
    const creds = await getDecryptedApiCredentials(payload.tenantId);
    if (!creds?.arkessel?.apiKey) {
      return { success: false, error: "Arkessel API key not configured" };
    }

    const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
    if (recipients.length === 0) {
      return { success: false, error: "At least one recipient is required" };
    }

    const sender = payload.senderId || creds.arkessel.senderId || "InvPro";
    const baseUrl = creds.arkessel.baseUrl;

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "api-key": creds.arkessel.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender,
        message: payload.message,
        recipients,
      }),
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `SMS provider error (${response.status}): ${text}`,
        raw: data,
      };
    }

    // Arkessel returns { status: "success", data: [...] } on success
    if (data?.status && data.status !== "success") {
      return {
        success: false,
        error: data?.message || "SMS provider rejected the request",
        raw: data,
      };
    }

    return {
      success: true,
      messageId: data?.data?.[0]?.id || data?.id,
      raw: data,
    };
  } catch (error: any) {
    console.error("sendSms error:", error);
    return { success: false, error: error?.message || "Failed to send SMS" };
  }
}

// ── Convenience wrappers ──

/**
 * Send a one-off SMS to a single recipient.
 */
export async function sendSingleSms(
  to: string,
  message: string,
  senderId?: string,
  tenantId?: string,
): Promise<SmsResult> {
  return sendSms({ to, message, senderId, tenantId });
}

/**
 * Broadcast the same message to multiple recipients.
 * Arkessel's API supports batch recipients in one call.
 */
export async function sendBulkSms(
  recipients: string[],
  message: string,
  senderId?: string,
  tenantId?: string,
): Promise<SmsResult> {
  return sendSms({ to: recipients, message, senderId, tenantId });
}

// ── Prebuilt templates (edit as needed) ──

export function saleReceiptSms(opts: {
  customerName: string;
  saleId: string;
  totalAmount: string;
  businessName: string;
}): string {
  return `Hi ${opts.customerName}, thank you for shopping with ${opts.businessName}! Your receipt #${opts.saleId} for ${opts.totalAmount} is confirmed.`;
}

export function lowStockAlertSms(opts: {
  productName: string;
  stock: number;
  businessName: string;
}): string {
  return `[${opts.businessName}] Low stock alert: ${opts.productName} has only ${opts.stock} units left.`;
}

export function otpSms(code: string, minutes = 5): string {
  return `Your verification code is ${code}. It expires in ${minutes} minutes. Do not share it with anyone.`;
}