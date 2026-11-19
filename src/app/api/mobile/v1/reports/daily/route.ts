import { NextResponse } from "next/server";
import { buildDailyReportDto, withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(
    req,
    async ({ session, tenantId }) => {
      const url = new URL(req.url);
      const date = url.searchParams.get("date") || undefined;
      const report = await buildDailyReportDto(tenantId, date, session);
      return NextResponse.json(report);
    },
    { requireAdmin: true },
  );
}
