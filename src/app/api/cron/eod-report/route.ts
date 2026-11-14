import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import db from "@/db/knex";
import { getUsersWithEODEnabled } from "@/actions/settings";
import {
  sendDailySalesReport,
  sendDailySalesReportAuto,
} from "@/actions/daily-reports";
import { Result } from "@/types/globals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Maximum time we consider a previous dispatch "stuck".
const DISPATCH_STALE_AFTER_MINUTES = 30;

const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Accra";

type DispatchStatus = "processing" | "completed" | "failed";

interface EODDispatchLock {
  report_date: string;
  status: DispatchStatus;
  claimed_at: string;
  completed_at?: string | null;
  failed_at?: string | null;
  error_message?: string | null;
}

interface EODUserResult {
  userId: string;
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

/**
 * --------------------------------------------------------------------------
 * Authentication
 * --------------------------------------------------------------------------
 */

function isValidCronSecret(req: NextRequest): boolean {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    console.error("CRON_SECRET is not configured");
    return false;
  }

  const authorization = req.headers.get("authorization");

  if (!authorization) {
    return false;
  }

  const expected = `Bearer ${configuredSecret}`;

  const providedBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * --------------------------------------------------------------------------
 * Time helpers
 * --------------------------------------------------------------------------
 */

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
): {
  hour: number;
  minute: number;
} {
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

function parseClosingTime(value: string): {
  hour: number;
  minute: number;
} {
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

/**
 * --------------------------------------------------------------------------
 * Database helpers
 * --------------------------------------------------------------------------
 */

function isDuplicateKeyError(error: unknown): boolean {
  const err = error as {
    code?: string;
    errno?: number;
    message?: string;
  };

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

/**
 * Try to claim today's EOD dispatch.
 *
 * Returns:
 *
 *   true  -> this request owns the dispatch
 *   false -> another request already owns/completed it
 */
async function claimEODDispatch(reportDate: string): Promise<boolean> {
  const now = new Date().toISOString();

  /**
   * First attempt:
   *
   * INSERT is atomic because report_date is the PRIMARY KEY.
   */
  try {
    await db("eod_dispatch_locks").insert({
      report_date: reportDate,
      status: "processing",
      claimed_at: now,
      completed_at: null,
      failed_at: null,
      error_message: null,
    });

    return true;
  } catch (error) {
    /**
     * A duplicate key means the date already exists.
     *
     * Any other database error must NOT be treated as
     * "another dispatch is running".
     */
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  /**
   * The row already exists.
   */
  const existing = (await db("eod_dispatch_locks")
    .where("report_date", reportDate)
    .first()) as EODDispatchLock | undefined;

  if (!existing) {
    /**
     * Extremely unusual race/transaction case.
     *
     * Let the caller retry rather than generating a report
     * without an idempotency record.
     */
    return false;
  }

  /**
   * Already completed.
   */
  if (existing.status === "completed") {
    return false;
  }

  /**
   * Another request is currently processing it.
   *
   * Check whether the claim is stale before giving up.
   */
  if (existing.status === "processing") {
    const claimedAt = new Date(existing.claimed_at);

    if (
      !Number.isNaN(claimedAt.getTime()) &&
      claimedAt > getStaleCutoffDate()
    ) {
      return false;
    }

    /**
     * The previous worker appears to have crashed.
     *
     * Atomically take over only if the row is still processing
     * with the same claimed_at timestamp we observed.
     */
    const takeoverCount = await db("eod_dispatch_locks")
      .where("report_date", reportDate)
      .where("status", "processing")
      .where("claimed_at", existing.claimed_at)
      .update({
        status: "processing",
        claimed_at: now,
        completed_at: null,
        failed_at: null,
        error_message: null,
      });

    return takeoverCount === 1;
  }

  /**
   * Previous attempt failed.
   *
   * Atomically transition failed -> processing.
   */
  if (existing.status === "failed") {
    const retryCount = await db("eod_dispatch_locks")
      .where("report_date", reportDate)
      .where("status", "failed")
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

/**
 * Mark dispatch as completed.
 */
async function markEODCompleted(reportDate: string): Promise<void> {
  await db("eod_dispatch_locks")
    .where("report_date", reportDate)
    .where("status", "processing")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      error_message: null,
    });
}

/**
 * Mark dispatch as failed.
 *
 * We intentionally keep the row instead of deleting it.
 * The next cron execution can retry it.
 */
async function markEODFailed(
  reportDate: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  await db("eod_dispatch_locks")
    .where("report_date", reportDate)
    .where("status", "processing")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      error_message: message.slice(0, 2000),
    });
}

/**
 * --------------------------------------------------------------------------
 * Main EOD logic
 * --------------------------------------------------------------------------
 */

export async function checkAndSendEODReportAuto(
  eod_business_closing_time: string,
  userId: string,
): Promise<
  Result<{
    triggered: boolean;
    message: string;
  }>
> {
  try {
    // -----------------------------------------------------------------------
    // 3. Determine current business date/time
    // -----------------------------------------------------------------------

    const now = new Date();

    const reportDate = getBusinessLocalDateString(BUSINESS_TIMEZONE, now);

    const { hour: currentHour, minute: currentMinute } = getBusinessLocalTime(
      BUSINESS_TIMEZONE,
      now,
    );

    // -----------------------------------------------------------------------
    // 4. Parse configured closing time
    // -----------------------------------------------------------------------

    const closingTime = eod_business_closing_time || "18:00";

    const { hour: closingHour, minute: closingMinute } =
      parseClosingTime(closingTime);

    // -----------------------------------------------------------------------
    // 5. Don't run before closing time
    // -----------------------------------------------------------------------

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
          `Business hours have not closed yet. ` +
          `Current time: ${String(currentHour).padStart(2, "0")}:` +
          `${String(currentMinute).padStart(2, "0")}. ` +
          `Closing time: ${closingTime} ${BUSINESS_TIMEZONE}.`,
      });
    }

    // -----------------------------------------------------------------------
    // 6. Atomically claim today's dispatch
    // -----------------------------------------------------------------------
    //
    // This is the concurrency/idempotency boundary.
    //
    // Only one invocation should receive `true`.
    //

    const claimed = await claimEODDispatch(reportDate);

    if (!claimed) {
      return Result.ok({
        triggered: false,
        message:
          `EOD report for ${reportDate} is already completed ` +
          `or is currently being processed.`,
      });
    }

    // -----------------------------------------------------------------------
    // 7. Generate and dispatch the report
    // -----------------------------------------------------------------------

    try {
      const sendResult = await sendDailySalesReportAuto({
        dateStr: reportDate,
        userId,
      });

      // ---------------------------------------------------------------------
      // 8. Handle a normal dispatch failure
      // ---------------------------------------------------------------------

      if (!sendResult.success) {
        const error = new Error(
          sendResult.message || "Daily Sales Report dispatch failed.",
        );

        try {
          await markEODFailed(reportDate, error);
        } catch (markError) {
          console.error("Failed to mark EOD dispatch as failed:", markError);
        }

        return Result.fail(error.message);
      }

      // ---------------------------------------------------------------------
      // 9. Mark the dispatch as completed
      // ---------------------------------------------------------------------
      //
      // IMPORTANT:
      //
      // Never delete the dispatch lock after successful processing.
      // It acts as the idempotency record for this business date.
      //

      try {
        await markEODCompleted(reportDate);
      } catch (markError) {
        /**
         * This is an important edge case.
         *
         * The report may already have been successfully sent, but
         * updating the database failed.
         *
         * We deliberately surface this as an error rather than claiming
         * that everything completed successfully.
         */
        console.error(
          `Report was dispatched but failed to mark ${reportDate} as completed:`,
          markError,
        );

        return Result.fail(
          "Daily Sales Report was dispatched, but its completion " +
            "status could not be recorded.",
        );
      }

      // ---------------------------------------------------------------------
      // 10. Success
      // ---------------------------------------------------------------------

      return Result.ok({
        triggered: true,
        message:
          `Daily Sales Report for ${reportDate} ` +
          `was successfully generated and dispatched.`,
      });
    } catch (error) {
      // ---------------------------------------------------------------------
      // 11. Unexpected dispatch failure
      // ---------------------------------------------------------------------

      try {
        await markEODFailed(reportDate, error);
      } catch (markError) {
        console.error("Failed to mark EOD dispatch as failed:", markError);
      }

      throw error;
    }
  } catch (error) {
    // -----------------------------------------------------------------------
    // 12. Top-level error handler
    // -----------------------------------------------------------------------

    console.error("EOD report cron execution failed:", error);

    return Result.fail(
      error instanceof Error
        ? error.message
        : "Failed to run EOD report automation.",
    );
  }
}

export async function checkAndSendEODReportsAuto(): Promise<
  Result<EODProcessingResult>
> {
  try {
    const users = await getUsersWithEODEnabled();
    // console.log(users)

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
        );
        console.log(result)

        if (result.success) {
          results.push({
            userId: user.id,
            success: true,
            triggered: result.data?.triggered ?? false,
            message: result?.data?.message || "",
          });
        } else {
          results.push({
            userId: user.id,
            success: false,
            triggered: false,
            message: result.message || "Failed to process EOD report.",
          });
        }
      } catch (error) {
        results.push({
          userId: user.id,
          success: false,
          triggered: false,
          message:
            error instanceof Error
              ? error.message
              : "Unexpected error while processing EOD report.",
        });
      }
    }

    const triggered = results.filter(
      (result) => result.success && result.triggered,
    ).length;

    const failed = results.filter((result) => !result.success).length;

    const skipped = results.filter(
      (result) => result.success && !result.triggered,
    ).length;

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

// export async function checkAndSendEODReportAuto(): Promise<
//   Result<{
//     triggered: boolean;
//     message: string;
//   }>
// > {
//   let reportDate: string | null = null;

//   try {
//     const settingsRes = await getSettings();

//     if (!settingsRes.success) {
//       return Result.fail(
//         settingsRes.message ||
//           "Unable to load application settings",
//       );
//     }

//     const settings = settingsRes.data;

//     if (!settings) {
//       return Result.fail(
//         "Application settings could not be loaded",
//       );
//     }

//     /**
//      * EOD automation disabled.
//      */
//     if (settings.eod_report_enabled === false) {
//       return Result.ok({
//         triggered: false,
//         message:
//           "EOD Sales Report auto-trigger is disabled in settings.",
//       });
//     }

//     const now = new Date();

//     /**
//      * Everything below uses the business timezone.
//      */
//     reportDate = getBusinessLocalDateString(
//       BUSINESS_TIMEZONE,
//       now,
//     );

//     const {
//       hour: currentHour,
//       minute: currentMinute,
//     } = getBusinessLocalTime(
//       BUSINESS_TIMEZONE,
//       now,
//     );

//     const closingTime =
//       settings.eod_business_closing_time || "18:00";

//     const {
//       hour: closingHour,
//       minute: closingMinute,
//     } = parseClosingTime(closingTime);

//     /**
//      * Do not generate the report before closing.
//      */
//     if (
//       !isAtOrAfterClosingTime(
//         currentHour,
//         currentMinute,
//         closingHour,
//         closingMinute,
//       )
//     ) {
//       return Result.ok({
//         triggered: false,
//         message:
//           `Business hours have not closed yet. ` +
//           `Closing time: ${closingTime} ${BUSINESS_TIMEZONE}.`,
//       });
//     }

//     /**
//      * ----------------------------------------------------------------------
//      * Claim the daily dispatch.
//      * ----------------------------------------------------------------------
//      *
//      * This is the idempotency/concurrency boundary.
//      */
//     const claimed = await claimEODDispatch(reportDate);

//     if (!claimed) {
//       return Result.ok({
//         triggered: false,
//         message:
//           `EOD report for ${reportDate} is already completed ` +
//           `or is currently being processed.`,
//       });
//     }

//     /**
//      * ----------------------------------------------------------------------
//      * Generate and dispatch the report.
//      * ----------------------------------------------------------------------
//      *
//      * IMPORTANT:
//      *
//      * sendDailySalesReport() should itself be idempotent using reportDate
//      * as its business/idempotency key, especially if it sends through
//      * external services such as email or SMS.
//      */
//     try {
//       const sendResult = await sendDailySalesReport({
//         dateStr: reportDate,
//       });

//       if (!sendResult.success) {
//         await markEODFailed(
//           reportDate,
//           new Error(
//             sendResult.message ||
//               "Daily Sales Report dispatch failed",
//           ),
//         );

//         return Result.fail(
//           sendResult.message ||
//             "Daily Sales Report dispatch failed",
//         );
//       }

//       /**
//        * The dispatch completed successfully.
//        *
//        * Do NOT delete the lock.
//        */
//       await markEODCompleted(reportDate);

//       return Result.ok({
//         triggered: true,
//         message:
//           `Daily Sales Report for ${reportDate} ` +
//           `was successfully generated and dispatched.`,
//       });
//     } catch (error) {
//       /**
//        * Preserve the failed state so the next cron invocation
//        * can retry.
//        */
//       try {
//         await markEODFailed(reportDate, error);
//       } catch (markError) {
//         console.error(
//           "Failed to mark EOD dispatch as failed:",
//           markError,
//         );
//       }

//       throw error;
//     }
//   } catch (error) {
//     console.error(
//       "EOD report cron execution failed:",
//       error,
//     );

//     return Result.fail(
//       error instanceof Error
//         ? error.message
//         : "Failed to run EOD report automation.",
//     );
//   }
// }

/**
 * --------------------------------------------------------------------------
 * HTTP endpoint
 * --------------------------------------------------------------------------
 */

export async function GET(req: NextRequest) {
  /**
   * Authentication is deliberately performed before any
   * database work.
   */
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    console.error("CRON_SECRET environment variable is not configured.");

    return NextResponse.json(
      {
        success: false,
        error: "Cron authentication is not configured.",
      },
      { status: 500 },
    );
  }

  if (!isValidCronSecret(req)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized",
      },
      { status: 401 },
    );
  }

  const result = await checkAndSendEODReportsAuto();

  return NextResponse.json(result, {
    status: result.success ? 200 : 500,
  });
}

// /**
//  * ── 1. Replace the client-side DailyReportScheduler with a real cron trigger ──
//  *
//  * File: app/api/cron/eod-report/route.ts
//  *
//  * Vercel Cron (or any external cron / GitHub Actions schedule / systemd timer)
//  * hits this endpoint on a fixed schedule. Because it's server-driven, it runs
//  * whether or not anyone has the admin dashboard open.
//  *
//  * vercel.json:
//  * {
//  *   "crons": [
//  *     { "path": "/api/cron/eod-report", "schedule": "0,15,30,45 * * * *" }
//  *   ]
//  * }
//  * (Every 15 min, same cadence as before — cron minute fields are UTC, so if
//  * you want closing-time granularity tighter than 15 min, add more entries or
//  * switch to a provider with sub-15-min cron, e.g. an external service.)
//  *
//  * The route checks a shared secret so it can't be triggered by an arbitrary
//  * client request.
//  */

// // app/api/cron/eod-report/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { sendDailySalesReport } from "@/actions/daily-reports";
// import { Result } from "@/types/globals";
// import db from "@/db/knex";
// import { getSettings } from "@/actions/settings";

// export async function GET(req: NextRequest) {
//   const auth = req.headers.get("authorization");
//   if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
//     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//   }

//   const result = await checkAndSendEODReportAuto();
//   return NextResponse.json(result, { status: result.success ? 200 : 500, });
// }

// /**
//  * ── 2. Hardened trigger logic ──
//  *
//  * Fixes, vs. the original:
//  *  - Atomic claim via a dedicated lock row (INSERT with a UNIQUE constraint
//  *    on report_date) so two near-simultaneous invocations can't both pass
//  *    the "not yet dispatched" check and both send. Whoever's INSERT succeeds
//  *    owns the dispatch; the loser exits immediately.
//  *  - Business-timezone-aware closing-time comparison via Intl, instead of
//  *    the server process's local timezone.
//  *  - On any failure after claiming, the lock is released so a later run can
//  *    retry — but a crash mid-dispatch inside sendDailySalesReport can still
//  *    duplicate already-sent channels unless that function is made
//  *    idempotent too (see note at the bottom).
//  *
//  * Migration needed (adjust to your migration tool):
//  *   CREATE TABLE IF NOT EXISTS eod_dispatch_locks (
//  *     report_date TEXT PRIMARY KEY,
//  *     claimed_at  TEXT NOT NULL
//  *   );
//  */

// const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Accra";

// function getBusinessLocalTime(timeZone: string, date: Date) {
//   const parts = new Intl.DateTimeFormat("en-US", {
//     timeZone,
//     hour: "2-digit",
//     minute: "2-digit",
//     hourCycle: "h23",
//   }).formatToParts(date);
//   return {
//     hour: Number(parts.find((p) => p.type === "hour")?.value ?? "0"),
//     minute: Number(parts.find((p) => p.type === "minute")?.value ?? "0"),
//   };
// }

// // yyyy-MM-dd in the business's own timezone, not the server's.
// function getBusinessLocalDateString(timeZone: string, date: Date): string {
//   return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date); // en-CA => "yyyy-MM-dd"
// }

// export async function checkAndSendEODReportAuto(): Promise<
//   Result<{ triggered: boolean; message: string }>
// > {
//   try {
//     const settingsRes = await getSettings();
//     const settings = settingsRes.data;

//     if (!settings || settings.eod_report_enabled === false) {
//       return Result.ok({
//         triggered: false,
//         message: "EOD Sales Report auto-trigger is disabled in settings",
//       });
//     }

//     const now = new Date();
//     // const timeZone = settings.eod_timezone || BUSINESS_TIMEZONE;
//     const timeZone = BUSINESS_TIMEZONE;
//     const todayDateStr = getBusinessLocalDateString(timeZone, now);

//     const existingReport = await db("daily_sales_reports")
//       .where("report_date", todayDateStr)
//       .first();

//     if (existingReport && existingReport.status === "dispatched") {
//       return Result.ok({
//         triggered: false,
//         message: "Today's Daily Sales Report has already been sent",
//       });
//     }

//     const closingTime = settings.eod_business_closing_time || "18:00";
//     const [closeHour, closeMin] = closingTime.split(":").map(Number);
//     const { hour: currentHour, minute: currentMin } = getBusinessLocalTime(
//       timeZone,
//       now,
//     );

//     const isAfterOrAtClosing =
//       currentHour > closeHour ||
//       (currentHour === closeHour && currentMin >= (closeMin || 0));

//     if (!isAfterOrAtClosing) {
//       return Result.ok({
//         triggered: false,
//         message: `Business hours not yet closed (Closing time: ${closingTime} ${timeZone}).`,
//       });
//     }

//     // ── Atomic claim ──
//     // Only one concurrent caller can successfully insert this row for a
//     // given report_date; everyone else hits the unique-constraint error
//     // and backs off instead of racing into a duplicate dispatch.
//     try {
//       await db("eod_dispatch_locks").insert({
//         report_date: todayDateStr,
//         claimed_at: db.fn.now(),
//       });
//     } catch {
//       return Result.ok({
//         triggered: false,
//         message: "Another dispatch is already in progress for today",
//       });
//     }

//     try {
//       const sendRes = await sendDailySalesReport({ dateStr: todayDateStr });
//       if (sendRes.success) {
//         return Result.ok({
//           triggered: true,
//           message: `Daily Sales Report automatically generated and dispatched for ${todayDateStr}!`,
//         });
//       }
//       // Dispatch failed — release the claim so the next cron tick can retry.
//       await db("eod_dispatch_locks")
//         .where("report_date", todayDateStr)
//         .delete();
//       return Result.fail(sendRes.message || "Dispatch failed");
//     } catch (err) {
//       await db("eod_dispatch_locks")
//         .where("report_date", todayDateStr)
//         .delete();
//       throw err;
//     }
//   } catch (error: any) {
//     console.error("Auto EOD trigger check error:", error);
//     return Result.fail(
//       error?.message || "Failed to run auto EOD trigger check",
//     );
//   }
// }

// /**
//  * ── 3. What I did NOT change but you should look at ──
//  *
//  * sendDailySalesReport itself isn't idempotent per-channel: if it sends the
//  * email, then throws before reaching the final `status: "dispatched"`
//  * update, a retry (from the lock-release path above) will resend the email.
//  * For true exactly-once delivery per channel, check `dispatch_logs` on the
//  * existing report row before each channel send and skip any channel already
//  * marked sent, rather than relying on the outer try/catch alone.
//  *
//  * The hardcoded fallback contacts ("frebbytech@gmail.com", "+233...") should
//  * be removed from sendDailySalesReport — if settings and all admin users
//  * lack an email/phone, log an explicit configuration error and skip that
//  * channel instead of silently sending real sales data to a baked-in
//  * contact.
//  *
//  * Also add an admin-role check at the top of sendDailySalesReport itself
//  * (not just the cron route), since it's a "use server" action and can be
//  * invoked directly by any client, cron or not.
//  */
