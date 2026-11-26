/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";

import { DailySalesReport, Result } from "@/types/globals";
import { generateId } from "@/utils/generator";
import { currencyFormatter } from "@/config/formatter";
import { getCurrentUser, getUser } from "./_actions";
import { getSettings, getSettingsById } from "./settings";
import { createNotification } from "./notifications";
import { createActivityLog } from "./activity-logs";
import { revalidatePath } from "next/cache";
import { sendSingleSms } from "@/lib/sms";
import { sendSingleEmail } from "@/lib/email";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Accra";

/**
 * Format date to YYYY-MM-DD
 */
function getTodayDateString(d?: Date): string {
  const dateObj = d || new Date();
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Generate (or calculate) Daily Sales Report metrics for a target date and tenant
 */
export async function generateDailySalesReport(
  targetDateStr?: string,
  tenantIdOverride?: string,
  createdByOverride?: string,
): Promise<Result<DailySalesReport>> {
  try {
    const dateStr = targetDateStr || getTodayDateString();
    const currentUser = await getCurrentUser().catch(() => null);
    const tenantId =
      tenantIdOverride || currentUser?.tenant_id || DEFAULT_TENANT_ID;

    if (!tenantIdOverride && !currentUser?.id) {
      return Result.fail("Unauthorized");
    }

    // 1. Fetch sales for the target date within this tenant
    const salesForDate = await db("v_sale_summary")
      .select("*")
      .where("tenant_id", tenantId)
      .andWhereRaw("DATE(sale_date) = ?", [dateStr]);

    let totalSalesAmount = 0;
    const totalTransactions = salesForDate.length;
    let completedTransactions = 0;
    let cancelledTransactions = 0;

    const paymentModes: Record<string, number> = {
      cash: 0,
      card: 0,
      transfer: 0,
      mobile_money: 0,
    };

    const cashierMap: Record<
      string,
      { name: string; sales: number; count: number }
    > = {};

    for (const sale of salesForDate) {
      if (sale.status === "cancelled") {
        cancelledTransactions++;
        continue;
      }

      completedTransactions++;
      const amount = Number(sale.total_amount) || 0;
      totalSalesAmount += amount;

      const mode = (sale.payment_mode || "cash").toLowerCase();
      if (mode.includes("card")) paymentModes.card += amount;
      else if (mode.includes("transfer")) paymentModes.transfer += amount;
      else if (
        mode.includes("momo") ||
        mode.includes("mobile") ||
        mode.includes("qr")
      )
        paymentModes.mobile_money += amount;
      else paymentModes.cash += amount;

      const cashierName = sale.user_name || sale.user_username || "Staff";
      if (!cashierMap[cashierName]) {
        cashierMap[cashierName] = { name: cashierName, sales: 0, count: 0 };
      }
      cashierMap[cashierName].sales += amount;
      cashierMap[cashierName].count += 1;
    }

    // 2. Fetch sale items to calculate cost price, profit, and top products
    const itemsForDate = await db("v_sale_items_detail")
      .select("*")
      .where("tenant_id", tenantId)
      .andWhereRaw("DATE(sale_date) = ?", [dateStr]);

    let totalCost = 0;
    let totalItemsSold = 0;
    const productSalesMap: Record<
      string,
      { name: string; quantity: number; revenue: number }
    > = {};

    for (const item of itemsForDate) {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const costPrice =
        Number(item.cost_price) || Number(item.buying_price) || 0;
      const lineTotal = Number(item.total_price) || qty * unitPrice;

      totalItemsSold += qty;
      totalCost += qty * costPrice;

      const pName = item.product_name || item.name || "Product";
      if (!productSalesMap[pName]) {
        productSalesMap[pName] = { name: pName, quantity: 0, revenue: 0 };
      }
      productSalesMap[pName].quantity += qty;
      productSalesMap[pName].revenue += lineTotal;
    }

    const grossProfit = totalSalesAmount - totalCost;

    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const cashierSummary = Object.values(cashierMap);

    // 3. Upsert into daily_sales_reports table scoped by tenant_id
    const existingReport = await db("daily_sales_reports")
      .where({ report_date: dateStr, tenant_id: tenantId })
      .first();

    const reportId = existingReport?.id || generateId();

    const reportData = {
      id: reportId,
      tenant_id: tenantId,
      report_date: dateStr,
      generated_at: db.fn.now(),
      total_sales_amount: Number(totalSalesAmount.toFixed(2)),
      total_transactions: totalTransactions,
      completed_transactions: completedTransactions,
      cancelled_transactions: cancelledTransactions,
      total_items_sold: totalItemsSold,
      total_cost: Number(totalCost.toFixed(2)),
      gross_profit: Number(grossProfit.toFixed(2)),
      payment_breakdown: JSON.stringify(paymentModes),
      top_products: JSON.stringify(topProducts),
      cashier_summary: JSON.stringify(cashierSummary),
      status:
        existingReport?.status === "dispatched" ? "dispatched" : "generated",
      created_by: createdByOverride || currentUser?.id || "system",
      updated_at: db.fn.now(),
    };

    if (existingReport) {
      await db("daily_sales_reports")
        .where({ id: existingReport.id, tenant_id: tenantId })
        .update(reportData);
    } else {
      await db("daily_sales_reports").insert(reportData);
    }

    const reportRecord: DailySalesReport = (await db("daily_sales_reports")
      .where({ id: reportId, tenant_id: tenantId })
      .first()) as DailySalesReport;

    return Result.ok(reportRecord);
  } catch (error: any) {
    console.error("Error generating daily sales report:", error);
    return Result.fail(
      "Unable to generate the daily sales report right now. Please try again.",
    );
  }
}

/**
 * Send Daily Sales Report to workspace admins via configured channels
 */
export async function sendDailySalesReport(options?: {
  dateStr?: string;
  force?: boolean;
}): Promise<Result<{ report: DailySalesReport; dispatchSummary: any }>> {
  try {
    const dateStr = options?.dateStr || getTodayDateString();
    const force = options?.force ?? false;

    const currentUser = await getCurrentUser();
    if (
      !currentUser ||
      !["admin", "super_admin", "manager"].includes(currentUser.role)
    ) {
      return Result.fail("Unauthorized: admin access required");
    }
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const [settingsRes, adminUsers, existingReport] = await Promise.all([
      getSettings(),
      db("users")
        .select(
          "id",
          "email",
          "phonenumber",
          "username",
          "firstname",
          "lastname",
        )
        .where("tenant_id", tenantId)
        .whereIn("role", ["admin", "super_admin", "manager"]),
      db("daily_sales_reports")
        .where({ report_date: dateStr, tenant_id: tenantId })
        .first(),
    ]);

    const settings = settingsRes.data;

    const previousLogs: Record<string, any> = (() => {
      try {
        return existingReport?.dispatch_logs
          ? JSON.parse(existingReport.dispatch_logs)
          : {};
      } catch {
        return {};
      }
    })();

    if (existingReport?.status === "dispatched" && !force) {
      return Result.ok({
        report: existingReport as DailySalesReport,
        dispatchSummary: previousLogs,
      });
    }

    const reportRes = await generateDailySalesReport(
      dateStr,
      tenantId,
      currentUser.id,
    );
    if (!reportRes.success || !reportRes.data) {
      return Result.fail(
        reportRes.message || "Could not generate report for dispatch",
      );
    }
    const report = reportRes.data;

    const targetEmail =
      settings?.eod_admin_email || currentUser?.email || adminUsers[0]?.email;
    const targetPhone =
      settings?.eod_admin_phone ||
      currentUser?.phonenumber ||
      adminUsers[0]?.phonenumber;

    let configuredChannels: string[] = ["in_app", "email", "sms"];
    if (settings?.eod_channels) {
      try {
        configuredChannels = JSON.parse(settings.eod_channels);
      } catch {
        configuredChannels = ["in_app", "email", "sms"];
      }
    }

    const formattedTotal = currencyFormatter(report.total_sales_amount);
    const formattedProfit = currencyFormatter(report.gross_profit);

    const logBroadcast = (
      channel: "email" | "sms",
      subject: string,
      content: string,
      status: "sent" | "failed",
    ) =>
      db("broadcast_messages")
        .insert({
          id: generateId(),
          tenant_id: tenantId,
          sender_id: currentUser?.id || "system",
          sender_name: "Automated Sales Reporter",
          recipient_group: "admin",
          channel,
          subject,
          content,
          recipient_count: 1,
          status,
          created_at: db.fn.now(),
        })
        .catch((err) =>
          console.error(
            `EOD report ${dateStr}: failed to log ${channel} broadcast`,
            err,
          ),
        );

    const channelJobs: Promise<[string, any]>[] = [];

    if (configuredChannels.includes("in_app")) {
      if (previousLogs.in_app?.sent) {
        channelJobs.push(Promise.resolve(["in_app", previousLogs.in_app]));
      } else {
        channelJobs.push(
          (async (): Promise<[string, any]> => {
            const title = `📊 EOD Daily Sales Report (${dateStr})`;
            const message = `End of business hour summary: Total Revenue: ${formattedTotal} | Orders: ${report.completed_transactions} | Profit: ${formattedProfit}`;

            const results = await Promise.allSettled(
              adminUsers
                .filter((a) => a.id)
                .map((admin) =>
                  createNotification({
                    tenant_id: tenantId,
                    user_id: admin.id,
                    type: "report",
                    title,
                    message,
                    reference_type: "daily_sales_report",
                    reference_id: report.id,
                  }),
                ),
            );
            const sentCount = results.filter(
              (r) => r.status === "fulfilled",
            ).length;

            return [
              "in_app",
              {
                sent: sentCount > 0,
                recipientCount: sentCount,
                failedCount: results.length - sentCount,
              },
            ];
          })(),
        );
      }
    }

    const emailEnabled =
      configuredChannels.includes("email") &&
      (settings?.notification_email ?? true);
    if (emailEnabled) {
      if (previousLogs.email?.sent) {
        channelJobs.push(Promise.resolve(["email", previousLogs.email]));
      } else if (!targetEmail) {
        channelJobs.push(
          Promise.resolve([
            "email",
            {
              sent: false,
              skipped: true,
              reason: "No target email configured",
            },
          ]),
        );
      } else {
        channelJobs.push(
          (async (): Promise<[string, any]> => {
            const subject = `📊 Daily Sales Report for ${dateStr} - ${formattedTotal}`;
            const text = `Daily Sales Summary for ${dateStr}:\n- Total Sales: ${formattedTotal}\n- Completed Orders: ${report.completed_transactions}\n- Items Sold: ${report.total_items_sold}\n- Gross Profit: ${formattedProfit}`;
            try {
              await sendSingleEmail(targetEmail, subject, { text });
              await logBroadcast("email", subject, text, "sent");
              return ["email", { sent: true, targetEmail }];
            } catch (err: any) {
              console.error(
                `EOD report ${dateStr}: email dispatch failed`,
                err,
              );
              await logBroadcast("email", subject, text, "failed");
              return [
                "email",
                { sent: false, targetEmail, error: "Email delivery failed." },
              ];
            }
          })(),
        );
      }
    }

    const smsEnabled =
      configuredChannels.includes("sms") &&
      (settings?.notification_sms ?? true);
    if (smsEnabled) {
      if (previousLogs.sms?.sent) {
        channelJobs.push(Promise.resolve(["sms", previousLogs.sms]));
      } else if (!targetPhone) {
        channelJobs.push(
          Promise.resolve([
            "sms",
            {
              sent: false,
              skipped: true,
              reason: "No target phone configured",
            },
          ]),
        );
      } else {
        channelJobs.push(
          (async (): Promise<[string, any]> => {
            const subject = "Daily Sales SMS";
            const text = `[STORE EOD REPORT ${dateStr}] Sales: ${formattedTotal} | Orders: ${report.completed_transactions} | Profit: ${formattedProfit}.`;
            try {
              await sendSingleSms(targetPhone, text, "InvPro");
              await logBroadcast("sms", subject, text, "sent");
              return ["sms", { sent: true, targetPhone }];
            } catch (err: any) {
              console.error(`EOD report ${dateStr}: sms dispatch failed`, err);
              await logBroadcast("sms", subject, text, "failed");
              return [
                "sms",
                { sent: false, targetPhone, error: "SMS delivery failed." },
              ];
            }
          })(),
        );
      }
    }

    const settled = await Promise.all(channelJobs);
    const dispatchResults: Record<string, any> = {
      sent_at: new Date().toISOString(),
    };
    for (const [name, result] of settled) dispatchResults[name] = result;

    const allAttemptedSent = settled
      .filter(([, r]) => !r.skipped)
      .every(([, r]) => r.sent);

    await db("daily_sales_reports")
      .where({ id: report.id, tenant_id: tenantId })
      .update({
        status: allAttemptedSent ? "dispatched" : "partial",
        dispatch_logs: JSON.stringify(dispatchResults),
        updated_at: db.fn.now(),
      });

    await createActivityLog({
      activity_type: "daily_sales_report_sent",
      title: `Daily Sales Report sent for ${dateStr}`,
      description: `Dispatched via ${configuredChannels.join(", ")} | Revenue: ${formattedTotal}`,
      metadata: { report_id: report.id, dispatchResults },
    }).catch(() => {});

    try {
      revalidatePath("/admin/reports/daily");
      revalidatePath("/admin/summary");
      revalidatePath("/admin/settings");
    } catch {
      // Ignore outside Next.js render context
    }

    const updatedReport = (await db("daily_sales_reports")
      .where({ id: report.id, tenant_id: tenantId })
      .first()) as DailySalesReport;

    return Result.ok({
      report: updatedReport,
      dispatchSummary: dispatchResults,
    });
  } catch (error: any) {
    console.error("Failed to send daily sales report:", error);
    return Result.fail(error?.message || "Failed to send daily sales report");
  }
}

export async function sendDailySalesReportAuto(options?: {
  dateStr?: string;
  force?: boolean;
  userId: string;
  tenantId?: string;
}): Promise<Result<{ report: DailySalesReport; dispatchSummary: any }>> {
  try {
    const dateStr = options?.dateStr || getTodayDateString();
    const force = options?.force ?? false;
    const userId = options?.userId;

    const user = await getUser(userId || "");
    const currentUser = user.data;
    if (
      !currentUser ||
      !["admin", "super_admin", "manager"].includes(currentUser.role)
    ) {
      return Result.fail("Unauthorized: admin access required");
    }
    const tenantId =
      options?.tenantId || currentUser.tenant_id || DEFAULT_TENANT_ID;

    const [settingsRes, adminUsers, existingReport] = await Promise.all([
      getSettingsById(userId || ""),
      db("users")
        .select(
          "id",
          "email",
          "phonenumber",
          "username",
          "firstname",
          "lastname",
        )
        .where("tenant_id", tenantId)
        .whereIn("role", ["admin", "super_admin", "manager"])
        .andWhere({ id: userId }),
      db("daily_sales_reports")
        .where({ report_date: dateStr, tenant_id: tenantId })
        .first(),
    ]);

    const settings = settingsRes.data;

    const previousLogs: Record<string, any> = (() => {
      try {
        return existingReport?.dispatch_logs
          ? JSON.parse(existingReport.dispatch_logs)
          : {};
      } catch {
        return {};
      }
    })();

    if (existingReport?.status === "dispatched" && !force) {
      return Result.ok({
        report: existingReport as DailySalesReport,
        dispatchSummary: previousLogs,
      });
    }

    const reportRes = await generateDailySalesReport(
      dateStr,
      tenantId,
      currentUser.id,
    );
    if (!reportRes.success || !reportRes.data) {
      return Result.fail(
        reportRes.message || "Could not generate report for dispatch",
      );
    }
    const report = reportRes.data;

    const targetEmail =
      settings?.eod_admin_email || currentUser?.email || adminUsers[0]?.email;
    const targetPhone =
      settings?.eod_admin_phone ||
      currentUser?.phonenumber ||
      adminUsers[0]?.phonenumber;

    let configuredChannels: string[] = ["in_app", "email", "sms"];
    if (settings?.eod_channels) {
      try {
        configuredChannels = JSON.parse(settings.eod_channels);
      } catch {
        configuredChannels = ["in_app", "email", "sms"];
      }
    }

    const formattedTotal = currencyFormatter(report.total_sales_amount);
    const formattedProfit = currencyFormatter(report.gross_profit);

    const logBroadcast = (
      channel: "email" | "sms",
      subject: string,
      content: string,
      status: "sent" | "failed",
    ) =>
      db("broadcast_messages")
        .insert({
          id: generateId(),
          tenant_id: tenantId,
          sender_id: currentUser?.id || "system",
          sender_name: "Automated Sales Reporter",
          recipient_group: "admin",
          channel,
          subject,
          content,
          recipient_count: 1,
          status,
          created_at: db.fn.now(),
        })
        .catch((err) =>
          console.error(
            `EOD report ${dateStr}: failed to log ${channel} broadcast`,
            err,
          ),
        );

    const channelJobs: Promise<[string, any]>[] = [];

    if (configuredChannels.includes("in_app")) {
      if (previousLogs.in_app?.sent) {
        channelJobs.push(Promise.resolve(["in_app", previousLogs.in_app]));
      } else {
        channelJobs.push(
          (async (): Promise<[string, any]> => {
            const title = `📊 EOD Daily Sales Report (${dateStr})`;
            const message = `End of business hour summary: Total Revenue: ${formattedTotal} | Orders: ${report.completed_transactions} | Profit: ${formattedProfit}`;

            const results = await Promise.allSettled(
              adminUsers
                .filter((a) => a.id)
                .map((admin) =>
                  createNotification({
                    tenant_id: tenantId,
                    user_id: admin.id,
                    type: "report",
                    title,
                    message,
                    reference_type: "daily_sales_report",
                    reference_id: report.id,
                  }),
                ),
            );
            const sentCount = results.filter(
              (r) => r.status === "fulfilled",
            ).length;

            return [
              "in_app",
              {
                sent: sentCount > 0,
                recipientCount: sentCount,
                failedCount: results.length - sentCount,
              },
            ];
          })(),
        );
      }
    }

    const emailEnabled =
      configuredChannels.includes("email") &&
      (settings?.notification_email ?? true);
    if (emailEnabled) {
      if (previousLogs.email?.sent) {
        channelJobs.push(Promise.resolve(["email", previousLogs.email]));
      } else if (!targetEmail) {
        channelJobs.push(
          Promise.resolve([
            "email",
            {
              sent: false,
              skipped: true,
              reason: "No target email configured",
            },
          ]),
        );
      } else {
        channelJobs.push(
          (async (): Promise<[string, any]> => {
            const subject = `📊 Daily Sales Report for ${dateStr} - ${formattedTotal}`;
            const text = `Daily Sales Summary for ${dateStr}:\n- Total Sales: ${formattedTotal}\n- Completed Orders: ${report.completed_transactions}\n- Items Sold: ${report.total_items_sold}\n- Gross Profit: ${formattedProfit}`;
            try {
              await sendSingleEmail(targetEmail, subject, { text });
              await logBroadcast("email", subject, text, "sent");
              return ["email", { sent: true, targetEmail }];
            } catch (err: any) {
              console.error(
                `EOD report ${dateStr}: email dispatch failed`,
                err,
              );
              await logBroadcast("email", subject, text, "failed");
              return [
                "email",
                { sent: false, targetEmail, error: err?.message },
              ];
            }
          })(),
        );
      }
    }

    const smsEnabled =
      configuredChannels.includes("sms") &&
      (settings?.notification_sms ?? true);
    if (smsEnabled) {
      if (previousLogs.sms?.sent) {
        channelJobs.push(Promise.resolve(["sms", previousLogs.sms]));
      } else if (!targetPhone) {
        channelJobs.push(
          Promise.resolve([
            "sms",
            {
              sent: false,
              skipped: true,
              reason: "No target phone configured",
            },
          ]),
        );
      } else {
        channelJobs.push(
          (async (): Promise<[string, any]> => {
            const subject = "Daily Sales SMS";
            const text = `[STORE EOD REPORT ${dateStr}] Sales: ${formattedTotal} | Orders: ${report.completed_transactions} | Profit: ${formattedProfit}.`;
            try {
              await sendSingleSms(targetPhone, text, "InvPro");
              await logBroadcast("sms", subject, text, "sent");
              return ["sms", { sent: true, targetPhone }];
            } catch (err: any) {
              console.error(`EOD report ${dateStr}: sms dispatch failed`, err);
              await logBroadcast("sms", subject, text, "failed");
              return ["sms", { sent: false, targetPhone, error: err?.message }];
            }
          })(),
        );
      }
    }

    const settled = await Promise.all(channelJobs);
    const dispatchResults: Record<string, any> = {
      sent_at: new Date().toISOString(),
    };
    for (const [name, result] of settled) dispatchResults[name] = result;

    const allAttemptedSent = settled
      .filter(([, r]) => !r.skipped)
      .every(([, r]) => r.sent);

    await db("daily_sales_reports")
      .where({ id: report.id, tenant_id: tenantId })
      .update({
        status: allAttemptedSent ? "dispatched" : "partial",
        dispatch_logs: JSON.stringify(dispatchResults),
        updated_at: db.fn.now(),
      });

    const updatedReport = (await db("daily_sales_reports")
      .where({ id: report.id, tenant_id: tenantId })
      .first()) as DailySalesReport;

    return Result.ok({
      report: updatedReport,
      dispatchSummary: dispatchResults,
    });
  } catch (error: any) {
    console.error("Failed to send daily sales report:", error);
    return Result.fail(error?.message || "Failed to send daily sales report");
  }
}

/**
 * Fetch list of all historical daily sales reports for the current tenant
 */
export async function getDailySalesReports(
  limit: number = 30,
): Promise<Result<DailySalesReport[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const reports = await db("daily_sales_reports")
      .where("tenant_id", tenantId)
      .select("*")
      .orderBy("report_date", "desc")
      .limit(limit);

    return Result.ok(reports);
  } catch (error: any) {
    console.error("Failed to fetch daily sales reports:", error);
    return Result.fail(error?.message || "Failed to fetch daily sales reports");
  }
}

/**
 * Get a single daily sales report by ID or date within the current tenant
 */
export async function getDailySalesReportById(
  idOrDate: string,
): Promise<Result<DailySalesReport>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return Result.fail("Unauthorized");
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const report = await db("daily_sales_reports")
      .where("tenant_id", tenantId)
      .andWhere((qb) => qb.where("id", idOrDate).orWhere("report_date", idOrDate))
      .first();

    if (!report) {
      return await generateDailySalesReport(idOrDate, tenantId, currentUser.id);
    }

    return Result.ok(report as DailySalesReport);
  } catch (error: any) {
    console.error("Failed to fetch daily sales report by ID:", error);
    return Result.fail(error?.message || "Failed to fetch daily sales report");
  }
}

function getBusinessLocalTime(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? "0"),
  };
}

function getBusinessLocalDateString(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export async function checkAndSendEODReportAuto(): Promise<
  Result<{ triggered: boolean; message: string }>
> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return Result.fail("Unauthorized");
    }
    const tenantId = currentUser.tenant_id || DEFAULT_TENANT_ID;

    const settingsRes = await getSettings();
    const settings = settingsRes.data;

    if (!settings || settings.eod_report_enabled === false) {
      return Result.ok({
        triggered: false,
        message: "EOD Sales Report auto-trigger is disabled in settings",
      });
    }

    const now = new Date();
    const timeZone = BUSINESS_TIMEZONE;
    const todayDateStr = getBusinessLocalDateString(timeZone, now);

    const existingReport = await db("daily_sales_reports")
      .where({ report_date: todayDateStr, tenant_id: tenantId })
      .first();

    if (existingReport && existingReport.status === "dispatched") {
      return Result.ok({
        triggered: false,
        message: "Today's Daily Sales Report has already been sent",
      });
    }

    const closingTime = settings.eod_business_closing_time || "18:00";
    const [closeHour, closeMin] = closingTime.split(":").map(Number);
    const { hour: currentHour, minute: currentMin } = getBusinessLocalTime(
      timeZone,
      now,
    );

    const isAfterOrAtClosing =
      currentHour > closeHour ||
      (currentHour === closeHour && currentMin >= (closeMin || 0));

    if (!isAfterOrAtClosing) {
      return Result.ok({
        triggered: false,
        message: `Business hours not yet closed (Closing time: ${closingTime} ${timeZone}).`,
      });
    }

    try {
      await db("eod_dispatch_locks").insert({
        id: generateId(),
        tenant_id: tenantId,
        report_date: todayDateStr,
        status: "processing",
        claimed_at: db.fn.now(),
      });
    } catch {
      return Result.ok({
        triggered: false,
        message: "Another dispatch is already in progress for today",
      });
    }

    try {
      const sendRes = await sendDailySalesReport({ dateStr: todayDateStr });
      if (sendRes.success) {
        await db("eod_dispatch_locks")
          .where({ report_date: todayDateStr, tenant_id: tenantId })
          .update({ status: "completed", claimed_at: db.fn.now() })
          .catch(() => {});
        return Result.ok({
          triggered: true,
          message: `Daily Sales Report automatically generated and dispatched for ${todayDateStr}!`,
        });
      }
      await db("eod_dispatch_locks")
        .where({ report_date: todayDateStr, tenant_id: tenantId })
        .delete();
      return Result.fail(sendRes.message || "Dispatch failed");
    } catch (err) {
      await db("eod_dispatch_locks")
        .where({ report_date: todayDateStr, tenant_id: tenantId })
        .delete();
      throw err;
    }
  } catch (error: any) {
    console.error("Auto EOD trigger check error:", error);
    return Result.fail(
      error?.message || "Failed to run auto EOD trigger check",
    );
  }
}
