import { NextResponse } from "next/server";
import { sendDailySalesReport } from "@/actions/daily-reports";
import {
  HttpStatusError,
  sanitizeServerMessage,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withMobileAuth(
    req,
    async () => {
      const body = await req.json().catch(() => ({}));
      const dateStr =
        typeof body?.dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dateStr.trim())
          ? body.dateStr.trim()
          : undefined;

      const res = await sendDailySalesReport({
        dateStr,
        force: true,
      });

      if (!res.success || !res.data) {
        throw new HttpStatusError(
          sanitizeServerMessage(
            res.message,
            "Unable to send the daily sales report right now. Please try again.",
          ),
          400,
        );
      }

      const rawSummary = (res.data.dispatchSummary ?? {}) as Record<string, any>;
      const sanitizeChannelEntry = (entry: any, fallback: string) => {
        if (!entry || typeof entry !== "object") return entry;
        if (!("error" in entry) || !entry.error) return entry;
        return {
          ...entry,
          error: sanitizeServerMessage(entry.error, fallback),
        };
      };

      return NextResponse.json({
        ok: true,
        sentAt: String(
          rawSummary.sent_at || new Date().toISOString(),
        ),
        reportDate: String(res.data.report.report_date),
        dispatchSummary: {
          ...rawSummary,
          ...(rawSummary.email
            ? {
                email: sanitizeChannelEntry(
                  rawSummary.email,
                  "Email delivery failed.",
                ),
              }
            : {}),
          ...(rawSummary.sms
            ? {
                sms: sanitizeChannelEntry(
                  rawSummary.sms,
                  "SMS delivery failed.",
                ),
              }
            : {}),
        },
      });
    },
    { requireAdmin: true },
  );
}
