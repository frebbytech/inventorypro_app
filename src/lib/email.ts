import "server-only";
import nodemailer, { Transporter } from "nodemailer";
import { getDecryptedApiCredentials } from "@/actions/api-settings";

// ── Types ──
export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailPayload {
  to: string | string[];
  subject: string;
  /** Plain text body (required unless html is provided) */
  text?: string;
  /** Optional HTML body */
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** Overrides the "From" name/email from settings */
  fromName?: string;
  fromEmail?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  raw?: any;
}

export interface BulkEmailRecipientResult {
  to: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BulkEmailResult {
  /** true only if every recipient succeeded — check `results` for partial outcomes */
  success: boolean;
  sentCount: number;
  failedCount: number;
  results: BulkEmailRecipientResult[];
}

// ── Transporter cache (per server instance) ──
let cachedTransporter: Transporter | null = null;
let cachedFingerprint: string | null = null;

async function getTransporter(): Promise<Transporter> {
  const creds = await getDecryptedApiCredentials();
  if (!creds?.smtp?.user || !creds?.smtp?.pass) {
    throw new Error("SMTP credentials not configured");
  }

  // Invalidate cache if credentials changed
  const fingerprint = `${creds.smtp.host}:${creds.smtp.port}:${creds.smtp.user}:${creds.smtp.secure}`;
  if (cachedTransporter && cachedFingerprint === fingerprint) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: creds.smtp.host,
    port: creds.smtp.port,
    secure: creds.smtp.secure,
    auth: { user: creds.smtp.user, pass: creds.smtp.pass },
    // Sensible defaults for Gmail
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });
  cachedFingerprint = fingerprint;
  return cachedTransporter;
}

// ── Core sender ──
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  try {
    const creds = await getDecryptedApiCredentials();
    if (!creds?.smtp?.user || !creds?.smtp?.pass) {
      return { success: false, error: "SMTP credentials not configured" };
    }

    if (!payload.text && !payload.html) {
      return { success: false, error: "Email must include text or html body" };
    }

    const transporter = await getTransporter();

    const fromName = payload.fromName || creds.smtp.fromName || "";
    const fromEmail =
      payload.fromEmail || creds.smtp.fromEmail || creds.smtp.user;
    const from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

    const info = await transporter.sendMail({
      from,
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      replyTo: payload.replyTo,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      attachments: payload.attachments,
    });

    return { success: true, messageId: info.messageId, raw: info };
  } catch (error: any) {
    console.error("sendEmail error:", error);
    return { success: false, error: error?.message || "Failed to send email" };
  }
}

// ── Convenience wrappers ──

/**
 * Send a one-off email to a single recipient.
 */
export async function sendSingleEmail(
  to: string,
  subject: string,
  body: { text?: string; html?: string }
): Promise<EmailResult> {
  return sendEmail({ to, subject, ...body });
}

export async function sendEmailWithAttachment(
  to: string,
  subject: string,
  body: { text?: string; html?: string },
  attachments: EmailAttachment[]
): Promise<EmailResult> {
  return sendEmail({ to, subject, ...body, attachments });
}

const DEFAULT_BULK_CONCURRENCY = 10;

/**
 * Send the same email to many recipients.
 *
 * Unlike sendBulkSms (which hands every recipient to the SMS provider in
 * one batched call — each recipient only ever sees their own text), email
 * has no equivalent "safe" batch primitive: putting every address in one
 * `to`/`cc` would expose every recipient's address to every other
 * recipient. So this sends individually, one message per recipient, in
 * concurrency-limited chunks so a large list doesn't open more simultaneous
 * connections than the pooled SMTP transporter allows (maxConnections: 3
 * above) — raise `concurrency` if you've raised that too, but there's
 * little benefit past it since nodemailer just queues the rest internally.
 *
 * Duplicate addresses are deduped so the same person never gets the
 * broadcast twice from one call.
 */
export async function sendBulkEmail(
  recipients: string[],
  subject: string,
  body: { text?: string; html?: string },
  opts?: { concurrency?: number; fromName?: string; fromEmail?: string }
): Promise<BulkEmailResult> {
  const concurrency = opts?.concurrency ?? DEFAULT_BULK_CONCURRENCY;
  const uniqueRecipients = Array.from(
    new Set(recipients.map((r) => r.trim()).filter(Boolean)),
  );

  if (uniqueRecipients.length === 0) {
    return { success: false, sentCount: 0, failedCount: 0, results: [] };
  }

  const results: BulkEmailRecipientResult[] = [];

  for (let i = 0; i < uniqueRecipients.length; i += concurrency) {
    const chunk = uniqueRecipients.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (to): Promise<BulkEmailRecipientResult> => {
        const res = await sendEmail({
          to,
          subject,
          ...body,
          fromName: opts?.fromName,
          fromEmail: opts?.fromEmail,
        });
        return {
          to,
          success: res.success,
          messageId: res.messageId,
          error: res.error,
        };
      }),
    );
    results.push(...chunkResults);
  }

  const sentCount = results.filter((r) => r.success).length;
  const failedCount = results.length - sentCount;

  return {
    success: failedCount === 0,
    sentCount,
    failedCount,
    results,
  };
}

/**
 * Verify the SMTP connection (already used by the API Settings page).
 */
export async function verifySmtpConnection(): Promise<EmailResult> {
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "SMTP verify failed" };
  }
}

// ── HTML email wrapper (nice, consistent branding) ──
export function buildEmailHtml(opts: {
  businessName: string;
  logoUrl?: string | null;
  title: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  const { businessName, logoUrl, title, bodyHtml, footerNote } = opts;
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .header { padding: 24px; text-align: center; border-bottom: 1px solid #eee; }
        .header img { max-height: 60px; }
        .header h1 { margin: 0; font-size: 18px; color: #111; }
        .content { padding: 24px; color: #333; line-height: 1.6; font-size: 14px; }
        .footer { padding: 16px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logoUrl ? `<img src="${logoUrl}" alt="${businessName}" />` : ""}
          <h1>${businessName}</h1>
        </div>
        <div class="content">
          <h2 style="margin-top:0;">${title}</h2>
          ${bodyHtml}
        </div>
        <div class="footer">
          ${footerNote || `© ${new Date().getFullYear()} ${businessName}. All rights reserved.`}
        </div>
      </div>
    </body>
  </html>`;
}

// ── Prebuilt email templates ──

export function saleReceiptEmailHtml(opts: {
  businessName: string;
  logoUrl?: string | null;
  customerName: string;
  saleId: string;
  saleDate: string;
  items: { name: string; quantity: number; unitPrice: string; subtotal: string }[];
  totalAmount: string;
}): string {
  const rows = opts.items
    .map(
      (i) => `
      <tr>
        <td style="padding:6px 0;">${i.name}</td>
        <td style="text-align:right;">${i.quantity}</td>
        <td style="text-align:right;">${i.unitPrice}</td>
        <td style="text-align:right;">${i.subtotal}</td>
      </tr>`
    )
    .join("");

  const bodyHtml = `
    <p>Hi ${opts.customerName},</p>
    <p>Thank you for your purchase! Here's a summary of your receipt <strong>#${opts.saleId}</strong> on ${opts.saleDate}.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="border-bottom:1px solid #eee;">
          <th align="left" style="padding-bottom:6px;">Item</th>
          <th align="right">Qty</th>
          <th align="right">Price</th>
          <th align="right">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="text-align:right;padding-top:12px;font-weight:bold;">Grand Total:</td>
          <td style="text-align:right;padding-top:12px;font-weight:bold;">${opts.totalAmount}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin-top:20px;">We appreciate your business!</p>
  `;

  return buildEmailHtml({
    businessName: opts.businessName,
    logoUrl: opts.logoUrl,
    title: "Your Receipt",
    bodyHtml,
  });
}

export function verifyEmailHtml(opts: {
  businessName: string;
  logoUrl?: string | null;
  code: string;
}): string {
  return buildEmailHtml({
    businessName: opts.businessName,
    logoUrl: opts.logoUrl,
    title: "Verify your email",
    bodyHtml: `
      <p>Use the following code to verify your email address:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:4px;text-align:center;margin:24px 0;">${opts.code}</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}