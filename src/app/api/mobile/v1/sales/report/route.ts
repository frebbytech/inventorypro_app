import { NextResponse } from "next/server";
import { buildSalesReportDto, withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const url = new URL(req.url);
    const rangeParam = url.searchParams.get("range") || "30d";
    const range = (
      ["today", "7d", "30d", "all"].includes(rangeParam) ? rangeParam : "30d"
    ) as "today" | "7d" | "30d" | "all";

    const report = await buildSalesReportDto(tenantId, range, session);
    return NextResponse.json(report);
  });
}
