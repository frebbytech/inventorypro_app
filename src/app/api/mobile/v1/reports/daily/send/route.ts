import { NextResponse } from "next/server";
import { sendDailySalesReport } from "@/actions/daily-reports";
import { HttpStatusError, withMobileAuth } from "@/lib/mobile-api";

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
          res.message || "Failed to send daily sales report.",
          400,
        );
      }

      return NextResponse.json({
        ok: true,
        sentAt: String(
          res.data.dispatchSummary?.sent_at || new Date().toISOString(),
        ),
        reportDate: String(res.data.report.report_date),
        dispatchSummary: res.data.dispatchSummary ?? {},
      });
    },
    { requireAdmin: true },
  );
}
