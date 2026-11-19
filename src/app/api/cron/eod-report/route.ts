import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import db from "@/db/knex";
import { getUsersWithEODEnabled } from "@/actions/settings";
import { sendDailySalesReportAuto } from "@/actions/daily-reports";
import { Result } from "@/types/globals";
import { runWithAuthContext } from "@/lib/request-context";
import { ensureMultiTenantSchema } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DISPATCH_STALE_AFTER_MINUTES = 30;
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Accra";

type DispatchStatus = "processing" | "completed" | "failed";

interface EODDispatchLock {
  tenant_id: string;
  report_date: string;
  status: DispatchStatus;
  claimed_at: string;
  completed_at?: string | null;
  failed_at?: string | null;
  error_message?: string | null;
}

interface EODUserResult {
  userId: string;
  tenantId: string;
  triggered: boolean;
  success: boolean;
  message: string;
}

interface EODProcessingResult {
  processed: number;
  triggered: number;
  skipped: number;
  failed: number;
  results: EODUserResult[];
}

function isValidCronSecret(req: NextRequest): boolean {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    console.error("CRON_SECRET is not configured");
    return false;
  }

  const authorization = req.headers.get("authorization");
  if (!authorization) return false;

  const expected = `Bearer ${configuredSecret}`;
  const providedBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function getBusinessLocalDateString(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getBusinessLocalTime(
  timeZone: string,
  date: Date,
): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? 0),
  };
}

function parseClosingTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid EOD closing time "${value}". Expected HH:mm.`);
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function isAtOrAfterClosingTime(
  currentHour: number,
  currentMinute: number,
  closingHour: number,
  closingMinute: number,
): boolean {
  return (
    currentHour > closingHour ||
    (currentHour === closingHour && currentMinute >= closingMinute)
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  const err = error as { code?: string; errno?: number; message?: string };
  const message = String(err?.message || "").toLowerCase();

  return (
    err?.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
    err?.code === "SQLITE_CONSTRAINT" ||
    err?.code === "ER_DUP_ENTRY" ||
    err?.code === "23505" ||
    err?.errno === 1062 ||
    message.includes("unique constraint") ||
    message.includes("duplicate entry") ||
    message.includes("unique violation")
  );
}

function getStaleCutoffDate(): Date {
  return new Date(Date.now() - DISPATCH_STALE_AFTER_MINUTES * 60 * 1000);
}

async function claimEODDispatch(
  tenantId: string,
  reportDate: string,
): Promise<boolean> {
  const now = new Date().toISOString();

  try {
    await db("eod_dispatch_locks").insert({
      tenant_id: tenantId,
      report_date: reportDate,
      status: "processing",
      claimed_at: now,
      completed_at: null,
      failed_at: null,
      error_message: null,
    });
    return true;
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const existing = (await db("eod_dispatch_locks")
    .where({ tenant_id: tenantId, report_date: reportDate })
    .first()) as EODDispatchLock | undefined;

  if (!existing || existing.status === "completed") {
    return false;
  }

  if (existing.status === "processing") {
    const claimedAt = new Date(existing.claimed_at);
    if (
      !Number.isNaN(claimedAt.getTime()) &&
      claimedAt > getStaleCutoffDate()
    ) {
      return false;
    }

    const takeoverCount = await db("eod_dispatch_locks")
      .where({
        tenant_id: tenantId,
        report_date: reportDate,
        status: "processing",
        claimed_at: existing.claimed_at,
      })
      .update({
        status: "processing",
        claimed_at: now,
        completed_at: null,
        failed_at: null,
        error_message: null,
      });

    return takeoverCount === 1;
  }

  if (existing.status === "failed") {
    const retryCount = await db("eod_dispatch_locks")
      .where({
        tenant_id: tenantId,
        report_date: reportDate,
        status: "failed",
      })
      .update({
        status: "processing",
        claimed_at: now,
        completed_at: null,
        failed_at: null,
        error_message: null,
      });

    return retryCount === 1;
  }

  return false;
}

async function markEODCompleted(
  tenantId: string,
  reportDate: string,
): Promise<void> {
  await db("eod_dispatch_locks")
    .where({
      tenant_id: tenantId,
      report_date: reportDate,
      status: "processing",
    })
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      error_message: null,
    });
}

async function markEODFailed(
  tenantId: string,
  reportDate: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  await db("eod_dispatch_locks")
    .where({
      tenant_id: tenantId,
      report_date: reportDate,
      status: "processing",
    })
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      error_message: message.slice(0, 2000),
    });
}

async function checkAndSendEODReportAuto(
  eod_business_closing_time: string,
  userId: string,
  tenantId: string,
): Promise<Result<{ triggered: boolean; message: string }>> {
  try {
    const now = new Date();
    const reportDate = getBusinessLocalDateString(BUSINESS_TIMEZONE, now);
    const { hour: currentHour, minute: currentMinute } = getBusinessLocalTime(
      BUSINESS_TIMEZONE,
      now,
    );

    const closingTime = eod_business_closing_time || "18:00";
    const { hour: closingHour, minute: closingMinute } =
      parseClosingTime(closingTime);

    const businessClosed = isAtOrAfterClosingTime(
      currentHour,
      currentMinute,
      closingHour,
      closingMinute,
    );

    if (!businessClosed) {
      return Result.ok({
        triggered: false,
        message:
          `Business hours have not closed yet. Current time: ${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}. Closing time: ${closingTime} ${BUSINESS_TIMEZONE}.`,
      });
    }

    const claimed = await claimEODDispatch(tenantId, reportDate);
    if (!claimed) {
      return Result.ok({
        triggered: false,
        message: `EOD report for ${reportDate} is already completed or is currently being processed.`,
      });
    }

    try {
      const adminRow = await db("users as u")
        .leftJoin("tenants as t", "u.tenant_id", "t.id")
        .select(
          "u.id",
          "u.tenant_id",
          "t.name as tenant_name",
          "t.slug as tenant_slug",
          "u.username",
          "u.email",
          "u.firstname",
          "u.lastname",
          "u.phonenumber",
        )
        .where("u.id", userId)
        .first();

      const sendResult = await runWithAuthContext(
        {
          id: userId,
          tenant_id: tenantId,
          tenant_name: adminRow?.tenant_name || "Inventory Pro",
          tenant_slug: adminRow?.tenant_slug || "default",
          username: adminRow?.username || "admin",
          email: adminRow?.email || "",
          firstname: adminRow?.firstname || "Admin",
          lastname: adminRow?.lastname || "User",
          phonenumber: adminRow?.phonenumber || "",
          role: "admin",
        },
        () =>
          sendDailySalesReportAuto({
            dateStr: reportDate,
            userId,
            tenantId,
          }),
      );

      if (!sendResult.success) {
        const error = new Error(
          sendResult.message || "Daily Sales Report dispatch failed.",
        );
        await markEODFailed(tenantId, reportDate, error).catch(() => {});
        return Result.fail(error.message);
      }

      await markEODCompleted(tenantId, reportDate);

      return Result.ok({
        triggered: true,
        message: `Daily Sales Report for ${reportDate} was successfully generated and dispatched.`,
      });
    } catch (error) {
      await markEODFailed(tenantId, reportDate, error).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error("EOD report cron execution failed:", error);
    return Result.fail(
      error instanceof Error
        ? error.message
        : "Failed to run EOD report automation.",
    );
  }
}

async function checkAndSendEODReportsAuto(): Promise<
  Result<EODProcessingResult>
> {
  try {
    await ensureMultiTenantSchema();
    const users = await getUsersWithEODEnabled();

    if (users.length === 0) {
      return Result.ok({
        processed: 0,
        triggered: 0,
        skipped: 0,
        failed: 0,
        results: [],
      });
    }

    const results: EODUserResult[] = [];

    for (const user of users) {
      try {
        const result = await checkAndSendEODReportAuto(
          user.eod_business_closing_time,
          user.id,
          user.tenant_id,
        );

        if (result.success) {
          results.push({
            userId: user.id,
            tenantId: user.tenant_id,
            success: true,
            triggered: result.data?.triggered ?? false,
            message: result?.data?.message || "",
          });
        } else {
          results.push({
            userId: user.id,
            tenantId: user.tenant_id,
            success: false,
            triggered: false,
            message: result.message || "Failed to process EOD report.",
          });
        }
      } catch (error) {
        results.push({
          userId: user.id,
          tenantId: user.tenant_id,
          success: false,
          triggered: false,
          message:
            error instanceof Error
              ? error.message
              : "Unexpected error while processing EOD report.",
        });
      }
    }

    const triggered = results.filter((r) => r.success && r.triggered).length;
    const failed = results.filter((r) => !r.success).length;
    const skipped = results.filter((r) => r.success && !r.triggered).length;

    return Result.ok({
      processed: users.length,
      triggered,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    console.error("EOD report processing failed:", error);
    return Result.fail(
      error instanceof Error ? error.message : "Failed to process EOD reports.",
    );
  }
}

export async function GET(req: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    console.error("CRON_SECRET environment variable is not configured.");
    return NextResponse.json(
      { success: false, error: "Cron authentication is not configured." },
      { status: 500 },
    );
  }

  if (!isValidCronSecret(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const result = await checkAndSendEODReportsAuto();
  return NextResponse.json(result, {
    status: result.success ? 200 : 500,
  });
}
