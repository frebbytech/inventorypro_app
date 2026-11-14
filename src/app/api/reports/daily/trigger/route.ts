import { NextRequest, NextResponse } from "next/server";
import { checkAndSendEODReportAuto, sendDailySalesReport } from "@/actions/daily-reports";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";
    const dateStr = searchParams.get("date") || undefined;

    if (force) {
      const result = await sendDailySalesReport({ dateStr, force: true });
      if (!result.success) {
        return NextResponse.json(
          { success: false, message: result.message },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        message: "Daily Sales Report generated and dispatched successfully!",
        data: result.data,
      });
    }

    const autoRes = await checkAndSendEODReportAuto();
    return NextResponse.json(autoRes);
  } catch (error: any) {
    console.error("API daily sales report trigger error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to trigger daily sales report" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }

    const result = await sendDailySalesReport({
      dateStr: body.dateStr,
      force: true,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Daily Sales Report generated and dispatched!",
      data: result.data,
    });
  } catch (error: any) {
    console.error("API POST daily report trigger error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to dispatch daily report" },
      { status: 500 }
    );
  }
}
