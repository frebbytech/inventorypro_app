/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import db from "@/db/knex";
import { Result } from "@/types/globals";
import {
  startOfDay,
  endOfDay,
  addDays,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
  differenceInDays,
  parseISO,
  isValid,
  min as earliestOf,
} from "date-fns";
import { getCurrentUser } from "./_actions";

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────

/**
 * How `sale_date` is stored in SQLite.
 *
 *  true  -> UTC instants ("2026-09-19 14:03:00" or "2026-09-19T14:03:00.000Z")
 *  false -> local wall-clock time, no offset
 *
 * This single flag decides both how range boundaries are serialised and how
 * rows are bucketed into hours/days/months. Get it wrong and every preset is
 * off by your UTC offset.
 */
const SALE_DATES_ARE_UTC = true;

/** strftime modifier used when bucketing, so buckets match the user's calendar. */
const TZ_MOD = SALE_DATES_ARE_UTC ? ", 'localtime'" : "";

const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 5000;
/** SQLite's default SQLITE_MAX_VARIABLE_NUMBER is 999 on older builds. */
const IN_CHUNK = 500;

/** Serialise a JS Date to the text form SQLite's datetime() will compare against. */
function dbBound(d: Date): string {
  return SALE_DATES_ARE_UTC
    ? d.toISOString().slice(0, 19).replace("T", " ")
    : format(d, "yyyy-MM-dd HH:mm:ss");
}

// ──────────────────────────────────────────────────────────────
// Types & Interfaces
// ──────────────────────────────────────────────────────────────

export type DatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export interface EmployeeFilterOptions {
  employeeId?: string; // "all" or specific user_id (ignored for non-admins)
  datePreset?: DatePreset;
  startDate?: string; // ISO string
  endDate?: string; // ISO string
  status?: string; // "all" | "completed" | "cancelled" | "refunded" | "pending"
  paymentMode?: string; // "all" | "cash" | "momo" | "card" | "bank" | "cheque"
  searchQuery?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface EmployeeInfo {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  phonenumber?: string;
}

export interface PeriodKpiMetrics {
  totalRevenue: number;
  grossSales: number;
  totalDiscounts: number;
  totalTaxes: number;
  totalTransactions: number;
  completedTransactions: number;
  cancelledTransactions: number;
  cancelledAmount: number;
  refundedTransactions: number;
  refundedAmount: number;
  pendingTransactions: number;
  totalItemsSold: number;
  averageTransactionValue: number;
  successRate: number;
  activeEmployeesCount: number;
  avgTransactionsPerEmployee: number;
  topEmployee: {
    id: string;
    name: string;
    username: string;
    revenue: number;
    transactions: number;
  } | null;
  revenueChangePct: number | null;
  transactionsChangePct: number | null;
  itemsSoldChangePct: number | null;
  atvChangePct: number | null;
}

export interface TimeSeriesPoint {
  period: string;
  timestamp: string;
  revenue: number;
  transactions: number;
  itemsSold: number;
  completedCount: number;
  refundedCount: number;
  cancelledCount: number;
}

export interface EmployeePerformanceRow {
  employeeId: string;
  employeeName: string;
  username: string;
  email: string;
  role: string;
  totalTransactions: number;
  completedTransactions: number;
  cancelledTransactions: number;
  refundedTransactions: number;
  successRate: number;
  totalSales: number;
  grossSales: number;
  totalDiscounts: number;
  totalTaxes: number;
  avgTransactionValue: number;
  itemsSold: number;
  salesContributionPct: number;
  lastTransactionDate: string | null;
}

export interface DetailedTransactionRow {
  saleId: string;
  receiptNo: string;
  saleDate: string;
  employeeId: string;
  employeeName: string;
  employeeUsername: string;
  employeeRole: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  itemCount: number;
  itemsSummary: string;
  totalAmount: number;
  balance: number;
  discount: number;
  tax: number;
  paymentMode: string;
  status: string;
  details?: string;
}

export interface EmployeeSalesSummaryResponse {
  filters: {
    employeeId: string;
    datePreset: DatePreset;
    startDate: string;
    endDate: string;
    status: string;
    paymentMode: string;
    searchQuery: string;
  };
  metrics: PeriodKpiMetrics;
  timeSeries: TimeSeriesPoint[];
  employeeComparison: {
    salesByEmployee: {
      employeeId: string;
      employeeName: string;
      username: string;
      revenue: number;
      transactions: number;
      itemsSold: number;
      atv: number;
      contributionPct: number;
    }[];
    paymentModeBreakdown: {
      mode: string;
      count: number;
      amount: number;
      percentage: number;
    }[];
  };
  employeePerformance: EmployeePerformanceRow[];
  transactions: {
    records: DetailedTransactionRow[];
    totalRecords: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

type Granularity = "hour" | "day" | "month";

// ──────────────────────────────────────────────────────────────
// Date range resolution
// ──────────────────────────────────────────────────────────────

function resolveDateRange(
  preset: DatePreset = "this_month",
  customStart?: string,
  customEnd?: string,
): {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  granularity: Granularity;
} {
  const now = new Date();
  let start: Date;
  let end: Date;
  let prevStart: Date;
  let prevEnd: Date;
  let granularity: Granularity = "day";

  switch (preset) {
    case "today": {
      start = startOfDay(now);
      end = endOfDay(now);
      prevStart = startOfDay(subDays(now, 1));
      prevEnd = endOfDay(subDays(now, 1));
      granularity = "hour";
      break;
    }
    case "yesterday": {
      start = startOfDay(subDays(now, 1));
      end = endOfDay(subDays(now, 1));
      prevStart = startOfDay(subDays(now, 2));
      prevEnd = endOfDay(subDays(now, 2));
      granularity = "hour";
      break;
    }
    case "this_week": {
      start = startOfWeek(now, { weekStartsOn: 1 });
      end = endOfDay(now);
      // Compare like-for-like: same number of elapsed days in the prior week.
      const elapsed = differenceInDays(startOfDay(now), start);
      prevStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      prevEnd = earliestOf([
        endOfDay(addDays(prevStart, elapsed)),
        endOfWeek(prevStart, { weekStartsOn: 1 }),
      ]);
      granularity = "day";
      break;
    }
    case "last_week": {
      start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      end = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      prevStart = startOfWeek(subWeeks(now, 2), { weekStartsOn: 1 });
      prevEnd = endOfWeek(subWeeks(now, 2), { weekStartsOn: 1 });
      granularity = "day";
      break;
    }
    case "this_month": {
      start = startOfMonth(now);
      end = endOfDay(now);
      const elapsed = differenceInDays(startOfDay(now), start);
      prevStart = startOfMonth(subMonths(now, 1));
      // Clamp: a 31st-of-month "today" must not spill past a 28/30-day prior month.
      prevEnd = earliestOf([
        endOfDay(addDays(prevStart, elapsed)),
        endOfMonth(prevStart),
      ]);
      granularity = "day";
      break;
    }
    case "last_month": {
      start = startOfMonth(subMonths(now, 1));
      end = endOfMonth(subMonths(now, 1));
      prevStart = startOfMonth(subMonths(now, 2));
      prevEnd = endOfMonth(subMonths(now, 2));
      granularity = "day";
      break;
    }
    case "this_year": {
      start = startOfYear(now);
      end = endOfDay(now);
      const elapsed = differenceInDays(startOfDay(now), start);
      prevStart = startOfYear(subYears(now, 1));
      prevEnd = earliestOf([
        endOfDay(addDays(prevStart, elapsed)),
        endOfYear(prevStart),
      ]);
      granularity = "month";
      break;
    }
    case "custom":
    default: {
      const parsedStart = customStart ? parseISO(customStart) : null;
      const parsedEnd = customEnd ? parseISO(customEnd) : null;

      let s =
        parsedStart && isValid(parsedStart)
          ? startOfDay(parsedStart)
          : startOfMonth(now);
      let e =
        parsedEnd && isValid(parsedEnd) ? endOfDay(parsedEnd) : endOfDay(now);

      if (s > e) [s, e] = [e, s]; // tolerate reversed pickers

      start = s;
      end = e;

      const durationInDays = differenceInDays(startOfDay(e), startOfDay(s)) + 1;
      prevEnd = endOfDay(subDays(start, 1));
      prevStart = startOfDay(subDays(start, durationInDays));

      // Hourly buckets are keyed by hour-of-day, so they only make sense
      // for a single day. Two days would silently collapse onto each other.
      if (durationInDays <= 1) granularity = "hour";
      else if (durationInDays <= 62) granularity = "day";
      else granularity = "month";
      break;
    }
  }

  return { start, end, prevStart, prevEnd, granularity };
}

function calculatePctChange(current: number, previous: number): number | null {
  // null means "no baseline" — let the UI render a dash instead of a fake +100%.
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const round1 = (n: number) => Math.round((Number(n) || 0) * 10) / 10;
const num = (v: any) => Number(v) || 0;

/** Escape LIKE wildcards so a customer named "100%" doesn't match everything. */
function likeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function buildBuckets(
  granularity: Granularity,
  start: Date,
  end: Date,
): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];

  if (granularity === "hour") {
    for (let h = 0; h < 24; h++) {
      const key = String(h).padStart(2, "0");
      buckets.push({ key, label: `${key}:00` });
    }
    return buckets;
  }

  if (granularity === "day") {
    for (let d = startOfDay(start); d <= end; d = addDays(d, 1)) {
      buckets.push({ key: format(d, "yyyy-MM-dd"), label: format(d, "MMM d") });
    }
    return buckets;
  }

  for (let d = startOfMonth(start); d <= end; d = addMonths(d, 1)) {
    // Year-qualified key: "MM" alone collides across years on multi-year ranges.
    buckets.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") });
  }
  return buckets;
}

function emptyPoint(key: string, label: string): TimeSeriesPoint {
  return {
    period: label,
    timestamp: key,
    revenue: 0,
    transactions: 0,
    itemsSold: 0,
    completedCount: 0,
    refundedCount: 0,
    cancelledCount: 0,
  };
}

async function chunked<T, R>(
  items: T[],
  size: number,
  fn: (chunk: T[]) => Promise<R[]>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await fn(items.slice(i, i + size))));
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 1. Employees list (dropdown / filter)
// ──────────────────────────────────────────────────────────────

export async function getEmployeesList(): Promise<Result<EmployeeInfo[]>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      throw new Error("Unauthorized: Please log in");
    }

    const query = db("users")
      .select(
        "id",
        "username",
        "email",
        "firstname",
        "lastname",
        "role",
        "phonenumber",
      )
      .orderBy("role", "asc")
      .orderBy("firstname", "asc");

    // A non-admin has no business enumerating staff.
    if (currentUser.role !== "admin") {
      query.where("id", currentUser.id);
    }

    const employees = await query;

    return Result.ok(
      employees.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role || "member",
        phonenumber: u.phonenumber || "",
        name:
          [u.firstname, u.lastname].filter(Boolean).join(" ").trim() ||
          u.username ||
          "Employee",
      })),
    );
  } catch (error: any) {
    console.error("Failed to fetch employees list:", error);
    return Result.fail(error?.message || "Failed to fetch employees");
  }
}

// ──────────────────────────────────────────────────────────────
// 2. Core implementation (not a server action — internal only)
// ──────────────────────────────────────────────────────────────

async function buildEmployeeSalesSummary(
  options: EmployeeFilterOptions,
  limits: { maxPageSize: number },
): Promise<EmployeeSalesSummaryResponse> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    throw new Error("Unauthorized: Please log in to view sales summaries");
  }

  const isAdmin = currentUser.role === "admin";
  const employeeId = isAdmin
    ? options.employeeId && options.employeeId !== "all"
      ? options.employeeId
      : "all"
    : currentUser.id;

  const datePreset = options.datePreset || "this_month";
  const { start, end, prevStart, prevEnd, granularity } = resolveDateRange(
    datePreset,
    options.startDate,
    options.endDate,
  );

  const statusFilter =
    options.status && options.status !== "all" ? options.status : "all";
  const paymentFilter =
    options.paymentMode && options.paymentMode !== "all"
      ? options.paymentMode
      : "all";
  const searchQuery = (options.searchQuery || "").trim();
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(
    limits.maxPageSize,
    Math.max(5, Number(options.pageSize) || 10),
  );
  const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";

  const applyFilters = (query: any, isPrev = false) => {
    const from = dbBound(isPrev ? prevStart : start);
    const to = dbBound(isPrev ? prevEnd : end);

    query.whereRaw("datetime(sale_date) between datetime(?) and datetime(?)", [
      from,
      to,
    ]);

    if (employeeId !== "all") query.where("user_id", employeeId);
    if (statusFilter !== "all") query.where("status", statusFilter);
    if (paymentFilter !== "all") query.where("payment_mode", paymentFilter);

    if (searchQuery) {
      const term = likeTerm(searchQuery);
      query.where((b: any) => {
        b.whereILike("receipt_number", term)
          .orWhereILike("customer_name", term)
          .orWhereILike("user_name", term)
          .orWhereILike("sale_id", term)
          .orWhereILike("details", term);
      });
    }
    return query;
  };

  const scoped = (isPrev = false) => applyFilters(db("v_sale_summary"), isPrev);

  // ── Items-sold source of truth ──
  // `v_sale_summary.item_count` turned out to be a line-item / distinct-
  // product count per sale, not a unit count — so a sale of "3x Coke + 2x
  // Water" reported item_count = 2 instead of 5, and every AGG that summed
  // it (totals, per-employee, time series) undercounted actual units sold.
  // Source it from sale_items.quantity directly instead, via the same date
  // range / employee / payment / search filters, but always restricted to
  // completed sales (units "sold" only makes sense for completed sales,
  // same as the original AGG's `case when status = 'completed'` guard).
  const scopedItems = (isPrev = false) => {
    const from = dbBound(isPrev ? prevStart : start);
    const to = dbBound(isPrev ? prevEnd : end);

    const q = db("sale_items as si")
      .join("v_sale_summary as v", "si.sales_id", "v.sale_id")
      .where("v.status", "completed")
      .whereRaw("datetime(v.sale_date) between datetime(?) and datetime(?)", [
        from,
        to,
      ]);

    if (employeeId !== "all") q.where("v.user_id", employeeId);
    if (paymentFilter !== "all") q.where("v.payment_mode", paymentFilter);

    if (searchQuery) {
      const term = likeTerm(searchQuery);
      q.where((b: any) => {
        b.whereILike("v.receipt_number", term)
          .orWhereILike("v.customer_name", term)
          .orWhereILike("v.user_name", term)
          .orWhereILike("v.sale_id", term)
          .orWhereILike("v.details", term);
      });
    }
    return q;
  };

  const bucketExprFor = (col: string) =>
    granularity === "hour"
      ? `strftime('%H', ${col}${TZ_MOD})`
      : granularity === "day"
        ? `strftime('%Y-%m-%d', ${col}${TZ_MOD})`
        : `strftime('%Y-%m', ${col}${TZ_MOD})`;

  const bucketExpr = bucketExprFor("sale_date");
  const bucketExprItems = bucketExprFor("v.sale_date");

  const AGG = `
    count(*)                                                          as total_transactions,
    sum(case when status = 'completed' then 1 else 0 end)             as completed_count,
    sum(case when status = 'cancelled' then 1 else 0 end)             as cancelled_count,
    sum(case when status = 'refunded'  then 1 else 0 end)             as refunded_count,
    sum(case when status = 'completed' then total_amount else 0 end)  as revenue,
    sum(case when status = 'cancelled' then total_amount else 0 end)  as cancelled_amount,
    sum(case when status = 'refunded'  then total_amount else 0 end)  as refunded_amount
  `;
  // (items_sold removed from AGG — now sourced from scopedItems() below.)

  const [
    totalsRow,
    prevTotalsRow,
    employeeRows,
    paymentRows,
    seriesRows,
    pageRows,
    totalItemsSoldRow,
    prevItemsSoldRow,
    itemsSoldByEmployeeRows,
    itemsSoldByBucketRows,
  ] = await Promise.all([
    scoped()
      .select(db.raw(`${AGG}, count(distinct user_id) as active_employees`))
      .first(),

    scoped(true)
      .select(
        db.raw(`
          sum(case when status = 'completed' then 1 else 0 end)            as completed_count,
          sum(case when status = 'completed' then total_amount else 0 end) as revenue
        `),
      )
      .first(),

    scoped()
      .select("user_id")
      .select(
        db.raw(
          `${AGG}, max(user_name) as user_name, max(datetime(sale_date)) as last_sale_date`,
        ),
      )
      .groupBy("user_id"),

    scoped()
      .where("status", "completed")
      .select("payment_mode")
      .select(db.raw("count(*) as count, sum(total_amount) as amount"))
      .groupBy("payment_mode"),

    scoped()
      .select(db.raw(`${bucketExpr} as bucket, ${AGG}`))
      .groupByRaw(bucketExpr),

    scoped()
      .select(
        "sale_id",
        "receipt_number",
        "sale_date",
        "user_id",
        "user_name",
        "customer_id",
        "customer_name",
        "phonenumber",
        "item_count",
        "total_amount",
        "payment_mode",
        "status",
        "details",
      )
      .orderBy(
        {
          sale_date: "sale_date",
          total_amount: "total_amount",
          item_count: "item_count",
          user_name: "user_name",
          customer_name: "customer_name",
          status: "status",
          receipt_number: "receipt_number",
        }[options.sortBy || "sale_date"] || "sale_date",
        sortOrder,
      )
      .orderBy("sale_id", sortOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize),

    scopedItems().sum("si.quantity as items_sold").first(),

    scopedItems(true).sum("si.quantity as items_sold").first(),

    scopedItems()
      .select("v.user_id as user_id")
      .select(db.raw("sum(si.quantity) as items_sold"))
      .groupBy("v.user_id"),

    scopedItems()
      .select(db.raw(`${bucketExprItems} as bucket, sum(si.quantity) as items_sold`))
      .groupByRaw(bucketExprItems),
  ]);

  // ── KPIs ──
  const totalTransactions = num(totalsRow?.total_transactions);
  const completedTransactions = num(totalsRow?.completed_count);
  const cancelledTransactions = num(totalsRow?.cancelled_count);
  const refundedTransactions = num(totalsRow?.refunded_count);
  const pendingTransactions = Math.max(
    0,
    totalTransactions -
      completedTransactions -
      cancelledTransactions -
      refundedTransactions,
  );
  const totalRevenue = num(totalsRow?.revenue);
  const totalItemsSold = num(totalItemsSoldRow?.items_sold);
  const activeEmployeesCount = num(totalsRow?.active_employees);

  const averageTransactionValue = completedTransactions
    ? round2(totalRevenue / completedTransactions)
    : 0;
  const successRate = totalTransactions
    ? round1((completedTransactions / totalTransactions) * 100)
    : 0;

  const prevRevenue = num(prevTotalsRow?.revenue);
  const prevCompleted = num(prevTotalsRow?.completed_count);
  const prevItems = num(prevItemsSoldRow?.items_sold);
  const prevATV = prevCompleted ? prevRevenue / prevCompleted : 0;

  // ── Per-employee aggregates ──
  const statsByEmployee = new Map<string, any>();
  for (const row of employeeRows as any[]) {
    statsByEmployee.set(String(row.user_id ?? "unknown"), row);
  }
  const itemsByEmployee = new Map<string, number>();
  for (const row of itemsSoldByEmployeeRows as any[]) {
    itemsByEmployee.set(String(row.user_id ?? "unknown"), num(row.items_sold));
  }

  const usersQuery = db("users").select(
    "id",
    "username",
    "email",
    "firstname",
    "lastname",
    "role",
  );
  if (employeeId !== "all") usersQuery.where("id", employeeId);
  const users = await usersQuery;

  const employeePerformance: EmployeePerformanceRow[] = [];
  const salesByEmployee: EmployeeSalesSummaryResponse["employeeComparison"]["salesByEmployee"] =
    [];

  for (const u of users) {
    const s = statsByEmployee.get(String(u.id));
    const name =
      [u.firstname, u.lastname].filter(Boolean).join(" ").trim() ||
      u.username ||
      "Staff";

    const totalTxs = num(s?.total_transactions);
    const compTxs = num(s?.completed_count);
    const salesAmt = round2(num(s?.revenue));
    const items = itemsByEmployee.get(String(u.id)) ?? 0;
    const atv = compTxs ? round2(salesAmt / compTxs) : 0;
    const sRate = totalTxs ? round1((compTxs / totalTxs) * 100) : 0;
    const sharePct = totalRevenue ? round1((salesAmt / totalRevenue) * 100) : 0;

    employeePerformance.push({
      employeeId: u.id,
      employeeName: name,
      username: u.username,
      email: u.email,
      role: u.role || "member",
      totalTransactions: totalTxs,
      completedTransactions: compTxs,
      cancelledTransactions: num(s?.cancelled_count),
      refundedTransactions: num(s?.refunded_count),
      successRate: sRate,
      totalSales: salesAmt,
      grossSales: salesAmt,
      totalDiscounts: 0,
      totalTaxes: 0,
      avgTransactionValue: atv,
      itemsSold: items,
      salesContributionPct: sharePct,
      lastTransactionDate: s?.last_sale_date ?? null,
    });

    if (salesAmt > 0 || compTxs > 0) {
      salesByEmployee.push({
        employeeId: u.id,
        employeeName: name,
        username: u.username,
        revenue: salesAmt,
        transactions: compTxs,
        itemsSold: items,
        atv,
        contributionPct: sharePct,
      });
    }
  }

  employeePerformance.sort((a, b) => b.totalSales - a.totalSales);
  salesByEmployee.sort((a, b) => b.revenue - a.revenue);

  const best = salesByEmployee[0];
  const topEmployee: PeriodKpiMetrics["topEmployee"] =
    best && best.revenue > 0
      ? {
          id: best.employeeId,
          name: best.employeeName,
          username: best.username,
          revenue: best.revenue,
          transactions: best.transactions,
        }
      : null;

  const metrics: PeriodKpiMetrics = {
    totalRevenue: round2(totalRevenue),
    grossSales: round2(totalRevenue),
    totalDiscounts: 0,
    totalTaxes: 0,
    totalTransactions,
    completedTransactions,
    cancelledTransactions,
    cancelledAmount: round2(num(totalsRow?.cancelled_amount)),
    refundedTransactions,
    refundedAmount: round2(num(totalsRow?.refunded_amount)),
    pendingTransactions,
    totalItemsSold,
    averageTransactionValue,
    successRate,
    activeEmployeesCount,
    avgTransactionsPerEmployee: activeEmployeesCount
      ? round1(totalTransactions / activeEmployeesCount)
      : 0,
    topEmployee,
    revenueChangePct: calculatePctChange(totalRevenue, prevRevenue),
    transactionsChangePct: calculatePctChange(
      completedTransactions,
      prevCompleted,
    ),
    itemsSoldChangePct: calculatePctChange(totalItemsSold, prevItems),
    atvChangePct: calculatePctChange(averageTransactionValue, prevATV),
  };

  // ── Time series: seeded skeleton + SQL buckets ──
  const timeSeriesMap = new Map<string, TimeSeriesPoint>();
  for (const b of buildBuckets(granularity, start, end)) {
    timeSeriesMap.set(b.key, emptyPoint(b.key, b.label));
  }
  for (const row of seriesRows as any[]) {
    const point = timeSeriesMap.get(String(row.bucket));
    if (!point) continue;
    point.transactions = num(row.total_transactions);
    point.revenue = round2(num(row.revenue));
    point.completedCount = num(row.completed_count);
    point.refundedCount = num(row.refunded_count);
    point.cancelledCount = num(row.cancelled_count);
  }
  for (const row of itemsSoldByBucketRows as any[]) {
    const point = timeSeriesMap.get(String(row.bucket));
    if (!point) continue;
    point.itemsSold = num(row.items_sold);
  }
  const timeSeries = Array.from(timeSeriesMap.values());

  // ── Payment modes ──
  const paymentModeBreakdown = (paymentRows as any[])
    .map((r) => ({
      mode: r.payment_mode || "cash",
      count: num(r.count),
      amount: round2(num(r.amount)),
      percentage: totalRevenue ? round1((num(r.amount) / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // ── Line-item preview for the current page only ──
  const saleIds = (pageRows as any[]).map((r) => r.sale_id).filter(Boolean);
  const itemsSummaryMap = new Map<string, string>();

  if (saleIds.length) {
    const itemsList = await chunked(saleIds, IN_CHUNK, (chunk) =>
      db("sale_items")
        .join("products", "sale_items.product_id", "products.id")
        .select("sale_items.sales_id", "products.name", "sale_items.quantity")
        .whereIn("sale_items.sales_id", chunk),
    );

    const grouped = new Map<string, { name: string; qty: number }[]>();
    for (const itm of itemsList as any[]) {
      const list = grouped.get(itm.sales_id) || [];
      list.push({ name: itm.name, qty: num(itm.quantity) });
      grouped.set(itm.sales_id, list);
    }

    grouped.forEach((items, sid) => {
      const summary = items
        .slice(0, 3)
        .map((i) => `${i.qty}x ${i.name}`)
        .join(", ");
      const remaining = items.length - 3;
      itemsSummaryMap.set(
        sid,
        remaining > 0 ? `${summary} +${remaining} more` : summary,
      );
    });
  }

  const records: DetailedTransactionRow[] = (pageRows as any[]).map((tx) => ({
    saleId: tx.sale_id,
    receiptNo: tx.receipt_number || tx.sale_id,
    saleDate: tx.sale_date,
    employeeId: tx.user_id,
    employeeName: tx.user_name || "Unknown Staff",
    employeeUsername: tx.user_name || "",
    employeeRole: "member",
    customerId: tx.customer_id,
    customerName: tx.customer_name || "Walk-in Customer",
    customerPhone: tx.phonenumber || "",
    // NOTE: this is still v_sale_summary.item_count (line-item count), used
    // here only as a display fallback when no sale_items rows were found.
    // It is no longer used for any KPI math.
    itemCount: num(tx.item_count),
    itemsSummary:
      itemsSummaryMap.get(tx.sale_id) || `${num(tx.item_count) || 1} items`,
    totalAmount: num(tx.total_amount),
    balance: 0,
    discount: 0,
    tax: 0,
    paymentMode: tx.payment_mode || "cash",
    status: tx.status || "completed",
    details: tx.details || "",
  }));

  const totalRecords = totalTransactions;

  return {
    filters: {
      employeeId,
      datePreset,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      status: statusFilter,
      paymentMode: paymentFilter,
      searchQuery,
    },
    metrics,
    timeSeries,
    employeeComparison: { salesByEmployee, paymentModeBreakdown },
    employeePerformance,
    transactions: {
      records,
      totalRecords,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
    },
  };
}
// async function buildEmployeeSalesSummary(
//   options: EmployeeFilterOptions,
//   limits: { maxPageSize: number },
// ): Promise<EmployeeSalesSummaryResponse> {
//   const currentUser = await getCurrentUser();
//   if (!currentUser?.id) {
//     throw new Error("Unauthorized: Please log in to view sales summaries");
//   }

//   const isAdmin = currentUser.role === "admin";
//   // Non-admins are pinned to their own id regardless of what the client sends.
//   const employeeId = isAdmin
//     ? options.employeeId && options.employeeId !== "all"
//       ? options.employeeId
//       : "all"
//     : currentUser.id;

//   const datePreset = options.datePreset || "this_month";
//   const { start, end, prevStart, prevEnd, granularity } = resolveDateRange(
//     datePreset,
//     options.startDate,
//     options.endDate,
//   );

//   const statusFilter =
//     options.status && options.status !== "all" ? options.status : "all";
//   const paymentFilter =
//     options.paymentMode && options.paymentMode !== "all"
//       ? options.paymentMode
//       : "all";
//   const searchQuery = (options.searchQuery || "").trim();
//   const page = Math.max(1, Number(options.page) || 1);
//   const pageSize = Math.min(
//     limits.maxPageSize,
//     Math.max(5, Number(options.pageSize) || 10),
//   );
//   const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";

//   // ── Shared filter application ──
//   // datetime() normalises both sides so a row stored as
//   // "2026-09-19T08:00:00.000Z" still compares correctly against
//   // "2026-09-19 00:00:00". Raw text BETWEEN does not: ' ' < 'T' pushes
//   // same-day rows outside the range, which is why several presets
//   // (today / yesterday / this_week) returned too few rows.
//   const applyFilters = (query: any, isPrev = false) => {
//     const from = dbBound(isPrev ? prevStart : start);
//     const to = dbBound(isPrev ? prevEnd : end);

//     query.whereRaw("datetime(sale_date) between datetime(?) and datetime(?)", [
//       from,
//       to,
//     ]);

//     if (employeeId !== "all") query.where("user_id", employeeId);
//     if (statusFilter !== "all") query.where("status", statusFilter);
//     if (paymentFilter !== "all") query.where("payment_mode", paymentFilter);

//     if (searchQuery) {
//       const term = likeTerm(searchQuery);
//       query.where((b: any) => {
//         b.whereILike("receipt_number", term)
//           .orWhereILike("customer_name", term)
//           .orWhereILike("user_name", term)
//           .orWhereILike("sale_id", term)
//           .orWhereILike("details", term);
//       });
//     }
//     return query;
//   };

//   const scoped = (isPrev = false) => applyFilters(db("v_sale_summary"), isPrev);

//   const bucketExpr =
//     granularity === "hour"
//       ? `strftime('%H', sale_date${TZ_MOD})`
//       : granularity === "day"
//         ? `strftime('%Y-%m-%d', sale_date${TZ_MOD})`
//         : `strftime('%Y-%m', sale_date${TZ_MOD})`;

//   const AGG = `
//     count(*)                                                          as total_transactions,
//     sum(case when status = 'completed' then 1 else 0 end)             as completed_count,
//     sum(case when status = 'cancelled' then 1 else 0 end)             as cancelled_count,
//     sum(case when status = 'refunded'  then 1 else 0 end)             as refunded_count,
//     sum(case when status = 'completed' then total_amount else 0 end)  as revenue,
//     sum(case when status = 'cancelled' then total_amount else 0 end)  as cancelled_amount,
//     sum(case when status = 'refunded'  then total_amount else 0 end)  as refunded_amount,
//     sum(case when status = 'completed' then item_count   else 0 end)  as items_sold
//   `;

//   // ── Everything the dashboard needs, aggregated in SQLite, in parallel ──
//   // (previously: one query pulled every sale row of the period into Node and
//   //  looped over it three times.)
//   const [
//     totalsRow,
//     prevTotalsRow,
//     employeeRows,
//     paymentRows,
//     seriesRows,
//     pageRows,
//   ] = await Promise.all([
//     scoped()
//       .select(db.raw(`${AGG}, count(distinct user_id) as active_employees`))
//       .first(),

//     scoped(true)
//       .select(
//         db.raw(`
//           sum(case when status = 'completed' then 1 else 0 end)            as completed_count,
//           sum(case when status = 'completed' then total_amount else 0 end) as revenue,
//           sum(case when status = 'completed' then item_count else 0 end)   as items_sold
//         `),
//       )
//       .first(),

//     scoped()
//       .select("user_id")
//       .select(
//         db.raw(
//           `${AGG}, max(user_name) as user_name, max(datetime(sale_date)) as last_sale_date`,
//         ),
//       )
//       .groupBy("user_id"),

//     scoped()
//       .where("status", "completed")
//       .select("payment_mode")
//       .select(
//         db.raw("count(*) as count, sum(total_amount) as amount"),
//       )
//       .groupBy("payment_mode"),

//     scoped()
//       .select(db.raw(`${bucketExpr} as bucket, ${AGG}`))
//       .groupByRaw(bucketExpr),

//     scoped()
//       .select(
//         "sale_id",
//         "receipt_number",
//         "sale_date",
//         "user_id",
//         "user_name",
//         "customer_id",
//         "customer_name",
//         "phonenumber",
//         "item_count",
//         "total_amount",
//         "payment_mode",
//         "status",
//         "details",
//       )
//       .orderBy(
//         {
//           sale_date: "sale_date",
//           total_amount: "total_amount",
//           item_count: "item_count",
//           user_name: "user_name",
//           customer_name: "customer_name",
//           status: "status",
//           receipt_number: "receipt_number",
//         }[options.sortBy || "sale_date"] || "sale_date",
//         sortOrder,
//       )
//       .orderBy("sale_id", sortOrder) // stable tiebreak so pages don't shuffle
//       .limit(pageSize)
//       .offset((page - 1) * pageSize),
//   ]);

//   console.log(totalsRow)

//   // ── KPIs ──
//   const totalTransactions = num(totalsRow?.total_transactions);
//   const completedTransactions = num(totalsRow?.completed_count);
//   const cancelledTransactions = num(totalsRow?.cancelled_count);
//   const refundedTransactions = num(totalsRow?.refunded_count);
//   const pendingTransactions = Math.max(
//     0,
//     totalTransactions -
//       completedTransactions -
//       cancelledTransactions -
//       refundedTransactions,
//   );
//   const totalRevenue = num(totalsRow?.revenue);
//   const totalItemsSold = num(totalsRow?.items_sold);
//   const activeEmployeesCount = num(totalsRow?.active_employees);

//   const averageTransactionValue = completedTransactions
//     ? round2(totalRevenue / completedTransactions)
//     : 0;
//   const successRate = totalTransactions
//     ? round1((completedTransactions / totalTransactions) * 100)
//     : 0;

//   const prevRevenue = num(prevTotalsRow?.revenue);
//   const prevCompleted = num(prevTotalsRow?.completed_count);
//   const prevItems = num(prevTotalsRow?.items_sold);
//   const prevATV = prevCompleted ? prevRevenue / prevCompleted : 0;

//   // ── Per-employee aggregates ──
//   const statsByEmployee = new Map<string, any>();
//   for (const row of employeeRows as any[]) {
//     statsByEmployee.set(String(row.user_id ?? "unknown"), row);
//   }

//   const usersQuery = db("users").select(
//     "id",
//     "username",
//     "email",
//     "firstname",
//     "lastname",
//     "role",
//   );
//   if (employeeId !== "all") usersQuery.where("id", employeeId);
//   const users = await usersQuery;

//   const employeePerformance: EmployeePerformanceRow[] = [];
//   const salesByEmployee: EmployeeSalesSummaryResponse["employeeComparison"]["salesByEmployee"] =
//     [];

//   for (const u of users) {
//     const s = statsByEmployee.get(String(u.id));
//     const name =
//       [u.firstname, u.lastname].filter(Boolean).join(" ").trim() ||
//       u.username ||
//       "Staff";

//     const totalTxs = num(s?.total_transactions);
//     const compTxs = num(s?.completed_count);
//     const salesAmt = round2(num(s?.revenue));
//     const items = num(s?.items_sold);
//     const atv = compTxs ? round2(salesAmt / compTxs) : 0;
//     // No transactions => 0%, not a flattering 100%.
//     const sRate = totalTxs ? round1((compTxs / totalTxs) * 100) : 0;
//     const sharePct = totalRevenue ? round1((salesAmt / totalRevenue) * 100) : 0;

//     employeePerformance.push({
//       employeeId: u.id,
//       employeeName: name,
//       username: u.username,
//       email: u.email,
//       role: u.role || "member",
//       totalTransactions: totalTxs,
//       completedTransactions: compTxs,
//       cancelledTransactions: num(s?.cancelled_count),
//       refundedTransactions: num(s?.refunded_count),
//       successRate: sRate,
//       totalSales: salesAmt,
//       // v_sale_summary exposes no discount/tax columns, so gross == net and
//       // the discount/tax fields stay 0. Add them to the view to populate these.
//       grossSales: salesAmt,
//       totalDiscounts: 0,
//       totalTaxes: 0,
//       avgTransactionValue: atv,
//       itemsSold: items,
//       salesContributionPct: sharePct,
//       lastTransactionDate: s?.last_sale_date ?? null,
//     });

//     if (salesAmt > 0 || compTxs > 0) {
//       salesByEmployee.push({
//         employeeId: u.id,
//         employeeName: name,
//         username: u.username,
//         revenue: salesAmt,
//         transactions: compTxs,
//         itemsSold: items,
//         atv,
//         contributionPct: sharePct,
//       });
//     }
//   }

//   employeePerformance.sort((a, b) => b.totalSales - a.totalSales);
//   salesByEmployee.sort((a, b) => b.revenue - a.revenue);

//   const best = salesByEmployee[0];
//   const topEmployee: PeriodKpiMetrics["topEmployee"] =
//     best && best.revenue > 0
//       ? {
//           id: best.employeeId,
//           name: best.employeeName,
//           username: best.username,
//           revenue: best.revenue,
//           transactions: best.transactions,
//         }
//       : null;

//   const metrics: PeriodKpiMetrics = {
//     totalRevenue: round2(totalRevenue),
//     grossSales: round2(totalRevenue),
//     totalDiscounts: 0,
//     totalTaxes: 0,
//     totalTransactions,
//     completedTransactions,
//     cancelledTransactions,
//     cancelledAmount: round2(num(totalsRow?.cancelled_amount)),
//     refundedTransactions,
//     refundedAmount: round2(num(totalsRow?.refunded_amount)),
//     pendingTransactions,
//     totalItemsSold,
//     averageTransactionValue,
//     successRate,
//     activeEmployeesCount,
//     avgTransactionsPerEmployee: activeEmployeesCount
//       ? round1(totalTransactions / activeEmployeesCount)
//       : 0,
//     topEmployee,
//     revenueChangePct: calculatePctChange(totalRevenue, prevRevenue),
//     transactionsChangePct: calculatePctChange(
//       completedTransactions,
//       prevCompleted,
//     ),
//     itemsSoldChangePct: calculatePctChange(totalItemsSold, prevItems),
//     atvChangePct: calculatePctChange(averageTransactionValue, prevATV),
//   };

//   // ── Time series: seeded skeleton + SQL buckets ──
//   const timeSeriesMap = new Map<string, TimeSeriesPoint>();
//   for (const b of buildBuckets(granularity, start, end)) {
//     timeSeriesMap.set(b.key, emptyPoint(b.key, b.label));
//   }
//   for (const row of seriesRows as any[]) {
//     const point = timeSeriesMap.get(String(row.bucket));
//     if (!point) continue; // row outside the seeded window (DST edge, etc.)
//     point.transactions = num(row.total_transactions);
//     point.revenue = round2(num(row.revenue));
//     point.itemsSold = num(row.items_sold);
//     point.completedCount = num(row.completed_count);
//     point.refundedCount = num(row.refunded_count);
//     point.cancelledCount = num(row.cancelled_count);
//   }
//   const timeSeries = Array.from(timeSeriesMap.values());

//   // ── Payment modes ──
//   const paymentModeBreakdown = (paymentRows as any[])
//     .map((r) => ({
//       mode: r.payment_mode || "cash",
//       count: num(r.count),
//       amount: round2(num(r.amount)),
//       percentage: totalRevenue ? round1((num(r.amount) / totalRevenue) * 100) : 0,
//     }))
//     .sort((a, b) => b.amount - a.amount);

//   // ── Line-item preview for the current page only ──
//   const saleIds = (pageRows as any[]).map((r) => r.sale_id).filter(Boolean);
//   const itemsSummaryMap = new Map<string, string>();

//   if (saleIds.length) {
//     const itemsList = await chunked(saleIds, IN_CHUNK, (chunk) =>
//       db("sale_items")
//         .join("products", "sale_items.product_id", "products.id")
//         .select("sale_items.sales_id", "products.name", "sale_items.quantity")
//         .whereIn("sale_items.sales_id", chunk),
//     );

//     const grouped = new Map<string, { name: string; qty: number }[]>();
//     for (const itm of itemsList as any[]) {
//       const list = grouped.get(itm.sales_id) || [];
//       list.push({ name: itm.name, qty: num(itm.quantity) });
//       grouped.set(itm.sales_id, list);
//     }

//     grouped.forEach((items, sid) => {
//       const summary = items
//         .slice(0, 3)
//         .map((i) => `${i.qty}x ${i.name}`)
//         .join(", ");
//       const remaining = items.length - 3;
//       itemsSummaryMap.set(
//         sid,
//         remaining > 0 ? `${summary} +${remaining} more` : summary,
//       );
//     });
//   }

//   const records: DetailedTransactionRow[] = (pageRows as any[]).map((tx) => ({
//     saleId: tx.sale_id,
//     receiptNo: tx.receipt_number || tx.sale_id,
//     saleDate: tx.sale_date,
//     employeeId: tx.user_id,
//     employeeName: tx.user_name || "Unknown Staff",
//     employeeUsername: tx.user_name || "",
//     employeeRole: "member",
//     customerId: tx.customer_id,
//     customerName: tx.customer_name || "Walk-in Customer",
//     customerPhone: tx.phonenumber || "",
//     itemCount: num(tx.item_count),
//     itemsSummary:
//       itemsSummaryMap.get(tx.sale_id) || `${num(tx.item_count) || 1} items`,
//     totalAmount: num(tx.total_amount),
//     balance: 0,
//     discount: 0,
//     tax: 0,
//     paymentMode: tx.payment_mode || "cash",
//     status: tx.status || "completed",
//     details: tx.details || "",
//   }));

//   // totalTransactions already counts exactly the filtered set — no COUNT(*) round-trip.
//   const totalRecords = totalTransactions;

//   return {
//     filters: {
//       employeeId,
//       datePreset,
//       startDate: start.toISOString(),
//       endDate: end.toISOString(),
//       status: statusFilter,
//       paymentMode: paymentFilter,
//       searchQuery,
//     },
//     metrics,
//     timeSeries,
//     employeeComparison: { salesByEmployee, paymentModeBreakdown },
//     employeePerformance,
//     transactions: {
//       records,
//       totalRecords,
//       page,
//       pageSize,
//       totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
//     },
//   };
// }

// ──────────────────────────────────────────────────────────────
// 3. Server actions
// ──────────────────────────────────────────────────────────────

export async function getEmployeeSalesSummaryData(
  options: EmployeeFilterOptions = {},
): Promise<Result<EmployeeSalesSummaryResponse>> {
  try {
    return Result.ok(
      await buildEmployeeSalesSummary(options, {
        maxPageSize: MAX_PAGE_SIZE,
      }),
    );
  } catch (error: any) {
    console.error("Failed to fetch employee sales summary:", error);
    return Result.fail(
      error?.message || "Failed to load employee sales summary",
    );
  }
}

export async function getEmployeeSummaryExportData(
  options: EmployeeFilterOptions = {},
): Promise<
  Result<{ transactions: any[]; employeePerformance: any[]; summaryKpis: any }>
> {
  try {
    // The public action caps pageSize at 100, so the old export silently
    // returned 100 rows. Exports get their own, higher ceiling.
    const data = await buildEmployeeSalesSummary(
      { ...options, page: 1, pageSize: MAX_EXPORT_ROWS },
      { maxPageSize: MAX_EXPORT_ROWS },
    );

    return Result.ok({
      transactions: data.transactions.records,
      employeePerformance: data.employeePerformance,
      summaryKpis: data.metrics,
    });
  } catch (error: any) {
    console.error("Export generation failed:", error);
    return Result.fail(error?.message || "Failed to generate export data");
  }
}


// /* eslint-disable @typescript-eslint/no-explicit-any */
// "use server";

// import db from "@/db/knex";
// import { Result } from "@/types/globals";
// import {
//   startOfDay,
//   endOfDay,
//   subDays,
//   subWeeks,
//   subMonths,
//   subYears,
//   startOfWeek,
//   endOfWeek,
//   startOfMonth,
//   endOfMonth,
//   startOfYear,
//   endOfYear,
//   format,
//   differenceInDays,
//   parseISO,
// } from "date-fns";
// import { getCurrentUser } from "./_actions";
// import { checkRole } from "@/utils/roles";
// import { knex } from "knex";

// // ──────────────────────────────────────────────────────────────
// // Types & Interfaces for Employee Sales Summary
// // ──────────────────────────────────────────────────────────────

// export type DatePreset =
//   | "today"
//   | "yesterday"
//   | "this_week"
//   | "last_week"
//   | "this_month"
//   | "last_month"
//   | "this_year"
//   | "custom";

// export interface EmployeeFilterOptions {
//   employeeId?: string; // "all" or specific user_id
//   datePreset?: DatePreset;
//   startDate?: string; // ISO string
//   endDate?: string; // ISO string
//   status?: string; // "all", "completed", "cancelled", "refunded"
//   paymentMode?: string; // "all", "cash", "momo", "card", "bank", "cheque"
//   searchQuery?: string;
//   page?: number;
//   pageSize?: number;
//   sortBy?: string;
//   sortOrder?: "asc" | "desc";
// }

// export interface EmployeeInfo {
//   id: string;
//   username: string;
//   name: string;
//   email: string;
//   role: string;
//   phonenumber?: string;
// }

// export interface PeriodKpiMetrics {
//   totalRevenue: number;
//   grossSales: number;
//   totalDiscounts: number;
//   totalTaxes: number;
//   totalTransactions: number;
//   completedTransactions: number;
//   cancelledTransactions: number;
//   cancelledAmount: number;
//   refundedTransactions: number;
//   refundedAmount: number;
//   pendingTransactions: number;
//   totalItemsSold: number;
//   averageTransactionValue: number;
//   successRate: number;
//   activeEmployeesCount: number;
//   avgTransactionsPerEmployee: number;
//   topEmployee: {
//     id: string;
//     name: string;
//     username: string;
//     revenue: number;
//     transactions: number;
//   } | null;
//   // Percentage Changes vs Previous Equivalent Period
//   revenueChangePct: number | null;
//   transactionsChangePct: number | null;
//   itemsSoldChangePct: number | null;
//   atvChangePct: number | null;
// }

// export interface TimeSeriesPoint {
//   period: string; // "09:00", "Feb 14", "Week 6", "Jan 2026"
//   timestamp: string;
//   revenue: number;
//   transactions: number;
//   itemsSold: number;
//   completedCount: number;
//   refundedCount: number;
//   cancelledCount: number;
// }

// export interface EmployeePerformanceRow {
//   employeeId: string;
//   employeeName: string;
//   username: string;
//   email: string;
//   role: string;
//   totalTransactions: number;
//   completedTransactions: number;
//   cancelledTransactions: number;
//   refundedTransactions: number;
//   successRate: number;
//   totalSales: number;
//   grossSales: number;
//   totalDiscounts: number;
//   totalTaxes: number;
//   avgTransactionValue: number;
//   itemsSold: number;
//   salesContributionPct: number;
//   lastTransactionDate: string | null;
// }

// export interface DetailedTransactionRow {
//   saleId: string;
//   receiptNo: string;
//   saleDate: string;
//   employeeId: string;
//   employeeName: string;
//   employeeUsername: string;
//   employeeRole: string;
//   customerId?: string;
//   customerName: string;
//   customerPhone?: string;
//   itemCount: number;
//   itemsSummary: string;
//   totalAmount: number;
//   balance: number;
//   discount: number;
//   tax: number;
//   paymentMode: string;
//   status: string;
//   details?: string;
// }

// export interface EmployeeSalesSummaryResponse {
//   filters: {
//     employeeId: string;
//     datePreset: DatePreset;
//     startDate: string;
//     endDate: string;
//     status: string;
//     paymentMode: string;
//     searchQuery: string;
//   };
//   metrics: PeriodKpiMetrics;
//   timeSeries: TimeSeriesPoint[];
//   employeeComparison: {
//     salesByEmployee: {
//       employeeId: string;
//       employeeName: string;
//       username: string;
//       revenue: number;
//       transactions: number;
//       itemsSold: number;
//       atv: number;
//       contributionPct: number;
//     }[];
//     paymentModeBreakdown: {
//       mode: string;
//       count: number;
//       amount: number;
//       percentage: number;
//     }[];
//   };
//   employeePerformance: EmployeePerformanceRow[];
//   transactions: {
//     records: DetailedTransactionRow[];
//     totalRecords: number;
//     page: number;
//     pageSize: number;
//     totalPages: number;
//   };
// }

// // ──────────────────────────────────────────────────────────────
// // Helper: Resolve Date Range from Presets
// // ──────────────────────────────────────────────────────────────

// function resolveDateRange(
//   preset: DatePreset = "this_month",
//   customStart?: string,
//   customEnd?: string,
// ): {
//   start: Date;
//   end: Date;
//   prevStart: Date;
//   prevEnd: Date;
//   granularity: "hour" | "day" | "month";
// } {
//   const now = new Date();
//   let start: Date;
//   let end: Date;
//   let prevStart: Date;
//   let prevEnd: Date;
//   let granularity: "hour" | "day" | "month" = "day";

//   switch (preset) {
//     case "today": {
//       start = startOfDay(now);
//       end = endOfDay(now);
//       prevStart = startOfDay(subDays(now, 1));
//       prevEnd = endOfDay(subDays(now, 1));
//       granularity = "hour";
//       break;
//     }
//     case "yesterday": {
//       start = startOfDay(subDays(now, 1));
//       end = endOfDay(subDays(now, 1));
//       prevStart = startOfDay(subDays(now, 2));
//       prevEnd = endOfDay(subDays(now, 2));
//       granularity = "hour";
//       break;
//     }
//     case "this_week": {
//       start = startOfWeek(now, { weekStartsOn: 1 });
//       end = endOfDay(now);
//       const prevWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
//       const daysPassed = differenceInDays(end, start);
//       prevStart = prevWeekStart;
//       prevEnd = endOfDay(subDays(prevWeekStart, -daysPassed));
//       granularity = "day";
//       break;
//     }
//     case "last_week": {
//       start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
//       end = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
//       prevStart = startOfWeek(subWeeks(now, 2), { weekStartsOn: 1 });
//       prevEnd = endOfWeek(subWeeks(now, 2), { weekStartsOn: 1 });
//       granularity = "day";
//       break;
//     }
//     case "this_month": {
//       start = startOfMonth(now);
//       end = endOfDay(now);
//       prevStart = startOfMonth(subMonths(now, 1));
//       const daysIntoMonth = differenceInDays(end, start);
//       prevEnd = endOfDay(subDays(prevStart, -daysIntoMonth));
//       granularity = "day";
//       break;
//     }
//     case "last_month": {
//       start = startOfMonth(subMonths(now, 1));
//       end = endOfMonth(subMonths(now, 1));
//       prevStart = startOfMonth(subMonths(now, 2));
//       prevEnd = endOfMonth(subMonths(now, 2));
//       granularity = "day";
//       break;
//     }
//     case "this_year": {
//       start = startOfYear(now);
//       end = endOfDay(now);
//       prevStart = startOfYear(subYears(now, 1));
//       const daysIntoYear = differenceInDays(end, start);
//       prevEnd = endOfDay(subDays(prevStart, -daysIntoYear));
//       granularity = "month";
//       break;
//     }
//     case "custom":
//     default: {
//       start = customStart
//         ? startOfDay(parseISO(customStart))
//         : startOfMonth(now);
//       end = customEnd ? endOfDay(parseISO(customEnd)) : endOfDay(now);
//       const durationInDays = Math.max(1, differenceInDays(end, start) + 1);
//       prevStart = startOfDay(subDays(start, durationInDays));
//       prevEnd = endOfDay(subDays(end, durationInDays));

//       if (durationInDays <= 2) {
//         granularity = "hour";
//       } else if (durationInDays <= 60) {
//         granularity = "day";
//       } else {
//         granularity = "month";
//       }
//       break;
//     }
//   }

//   return { start, end, prevStart, prevEnd, granularity };
// }

// // ──────────────────────────────────────────────────────────────
// // Helper: Calculate Percentage Change
// // ──────────────────────────────────────────────────────────────
// function calculatePctChange(current: number, previous: number): number | null {
//   if (previous === 0) {
//     return current > 0 ? 100 : 0;
//   }
//   return Math.round(((current - previous) / previous) * 1000) / 10;
// }

// // ──────────────────────────────────────────────────────────────
// // 1. Fetch Employees List for Dropdown / Search Filter
// // ──────────────────────────────────────────────────────────────
// export async function getEmployeesList(): Promise<Result<EmployeeInfo[]>> {
//   try {
//     const employees = await db("users")
//       .select(
//         "id",
//         "username",
//         "email",
//         "firstname",
//         "lastname",
//         "role",
//         "phonenumber",
//       )
//       .orderBy("role", "asc")
//       .orderBy("firstname", "asc");

//     const formatted: EmployeeInfo[] = employees.map((u) => ({
//       id: u.id,
//       username: u.username,
//       email: u.email,
//       role: u.role || "member",
//       phonenumber: u.phonenumber || "",
//       name:
//         [u.firstname, u.lastname].filter(Boolean).join(" ").trim() ||
//         u.username ||
//         "Employee",
//     }));

//     return Result.ok(formatted);
//   } catch (error: any) {
//     console.error("Failed to fetch employees list:", error);
//     return Result.fail(error?.message || "Failed to fetch employees");
//   }
// }

// // ──────────────────────────────────────────────────────────────
// // 2. Main Employee Sales Summary Action
// // ──────────────────────────────────────────────────────────────
// export async function getEmployeeSalesSummaryData(
//   options: EmployeeFilterOptions = {},
// ): Promise<Result<EmployeeSalesSummaryResponse>> {
//   try {
//     const currentUser = await getCurrentUser();
//     if (!currentUser?.id) {
//       throw new Error("Unauthorized: Please log in to view sales summaries");
//     }

//     const isAdmin = currentUser.role === "admin";
//     const employeeId =
//       options.employeeId && options.employeeId !== "all"
//         ? options.employeeId
//         : !isAdmin
//           ? currentUser.id
//           : "all";

//     const datePreset = options.datePreset || "this_month";
//     const { start, end, prevStart, prevEnd, granularity } = resolveDateRange(
//       datePreset,
//       options.startDate,
//       options.endDate,
//     );

//     const startIso = start.toISOString();
//     const endIso = end.toISOString();
//     const prevStartIso = prevStart.toISOString();
//     const prevEndIso = prevEnd.toISOString();

//     const statusFilter =
//       options.status && options.status !== "all" ? options.status : "all";
//     const paymentFilter =
//       options.paymentMode && options.paymentMode !== "all"
//         ? options.paymentMode
//         : "all";
//     const searchQuery = (options.searchQuery || "").trim();
//     const page = Math.max(1, Number(options.page) || 1);
//     const pageSize = Math.min(100, Math.max(5, Number(options.pageSize) || 10));
//     const sortBy = options.sortBy || "sale_date";
//     const sortOrder = options.sortOrder || "desc";

//     // ── BASE QUERY BUILDER FOR CURRENT PERIOD ──
//     const applyFilters = (
//       query: any,
//       enforceDateRange = true,
//       isPrev = false,
//     ) => {
//       if (enforceDateRange) {
//         const s = isPrev ? prevStartIso : startIso;
//         const e = isPrev ? prevEndIso : endIso;
//         query.whereBetween("sale_date", [s, e]);
//       }

//       if (employeeId !== "all") {
//         query.where("user_id", employeeId);
//       }

//       if (statusFilter !== "all") {
//         query.where("status", statusFilter);
//       }

//       if (paymentFilter !== "all") {
//         query.where("payment_mode", paymentFilter);
//       }

//       if (searchQuery) {
//         query.where((builder: any) => {
//           builder
//             .whereILike("receipt_number", `%${searchQuery}%`)
//             .orWhereILike("customer_name", `%${searchQuery}%`)
//             .orWhereILike("user_name", `%${searchQuery}%`)
//             .orWhereILike("sale_id", `%${searchQuery}%`)
//             .orWhereILike("details", `%${searchQuery}%`);
//         });
//       }
//     };

//     // ── 1. AGGREGATE KPI METRICS (CURRENT PERIOD) ──
//     const currentSalesQuery = db("v_sale_summary");
//     applyFilters(currentSalesQuery, true, false);
//     const currentSales = await currentSalesQuery.select(
//       "sale_id",
//       "user_id",
//       "user_name",
//       "user_name",
//       "total_amount",
//       db.raw("0 as discount"),
//       db.raw("0 as tax"),
//       "item_count",
//       "status",
//       "payment_mode",
//       "sale_date",
//     );

//     let totalRevenue = 0;
//     let grossSales = 0;
//     let totalDiscounts = 0;
//     let totalTaxes = 0;
//     let completedTransactions = 0;
//     let cancelledTransactions = 0;
//     let cancelledAmount = 0;
//     let refundedTransactions = 0;
//     let refundedAmount = 0;
//     let pendingTransactions = 0;
//     let totalItemsSold = 0;

//     const employeeMap = new Map<
//       string,
//       {
//         id: string;
//         name: string;
//         username: string;
//         revenue: number;
//         transactions: number;
//         completed: number;
//         cancelled: number;
//         refunded: number;
//         itemsSold: number;
//         discounts: number;
//         taxes: number;
//         lastSaleDate: string | null;
//       }
//     >();

//     const paymentModesMap = new Map<
//       string,
//       { count: number; amount: number }
//     >();

//     for (const sale of currentSales) {
//       const amount = Number(sale.total_amount) || 0;
//       const discount = Number(sale.discount) || 0;
//       const tax = Number(sale.tax) || 0;
//       const items = Number(sale.item_count) || 0;
//       const status = sale.status || "completed";
//       const uId = sale.user_id || "unknown";
//       const uName = sale.user_name || "Unknown Staff";
//       const uUsername = sale.user_name || "";
//       const pMode = sale.payment_mode || "cash";

//       // Track by Employee
//       if (!employeeMap.has(uId)) {
//         employeeMap.set(uId, {
//           id: uId,
//           name: uName,
//           username: uUsername,
//           revenue: 0,
//           transactions: 0,
//           completed: 0,
//           cancelled: 0,
//           refunded: 0,
//           itemsSold: 0,
//           discounts: 0,
//           taxes: 0,
//           lastSaleDate: null,
//         });
//       }
//       const empData = employeeMap.get(uId)!;
//       empData.transactions += 1;

//       if (
//         !empData.lastSaleDate ||
//         new Date(sale.sale_date) > new Date(empData.lastSaleDate)
//       ) {
//         empData.lastSaleDate = sale.sale_date;
//       }

//       if (status === "completed") {
//         completedTransactions += 1;
//         totalRevenue += amount;
//         grossSales += amount + discount - tax;
//         totalDiscounts += discount;
//         totalTaxes += tax;
//         totalItemsSold += items;

//         empData.completed += 1;
//         empData.revenue += amount;
//         empData.itemsSold += items;
//         empData.discounts += discount;
//         empData.taxes += tax;

//         // Payment Mode
//         const pModeEntry = paymentModesMap.get(pMode) || {
//           count: 0,
//           amount: 0,
//         };
//         pModeEntry.count += 1;
//         pModeEntry.amount += amount;
//         paymentModesMap.set(pMode, pModeEntry);
//       } else if (status === "cancelled") {
//         cancelledTransactions += 1;
//         cancelledAmount += amount;
//         empData.cancelled += 1;
//       } else if (status === "refunded") {
//         refundedTransactions += 1;
//         refundedAmount += amount;
//         empData.refunded += 1;
//       } else {
//         pendingTransactions += 1;
//       }
//     }

//     const totalTransactions = currentSales.length;
//     const averageTransactionValue =
//       completedTransactions > 0
//         ? Math.round((totalRevenue / completedTransactions) * 100) / 100
//         : 0;
//     const successRate =
//       totalTransactions > 0
//         ? Math.round((completedTransactions / totalTransactions) * 1000) / 10
//         : 0;
//     const activeEmployeesCount = employeeMap.size;
//     const avgTransactionsPerEmployee =
//       activeEmployeesCount > 0
//         ? Math.round((totalTransactions / activeEmployeesCount) * 10) / 10
//         : 0;

//     // Determine Top Employee
//     let topEmployee: PeriodKpiMetrics["topEmployee"] = null;
//     let maxRev = -1;
//     employeeMap.forEach((emp) => {
//       if (emp.revenue > maxRev) {
//         maxRev = emp.revenue;
//         topEmployee = {
//           id: emp.id,
//           name: emp.name,
//           username: emp.username,
//           revenue: Math.round(emp.revenue * 100) / 100,
//           transactions: emp.completed,
//         };
//       }
//     });

//     // ── 2. PREVIOUS PERIOD AGGREGATES FOR PERCENTAGE DELTAS ──
//     const prevSalesQuery = db("v_sale_summary");
//     applyFilters(prevSalesQuery, true, true);
//     const prevSales = await prevSalesQuery.select(
//       "sale_id",
//       "total_amount",
//       "item_count",
//       "status",
//     );

//     let prevRevenue = 0;
//     let prevCompleted = 0;
//     let prevItems = 0;
//     for (const ps of prevSales) {
//       if (ps.status === "completed") {
//         prevCompleted += 1;
//         prevRevenue += Number(ps.total_amount) || 0;
//         prevItems += Number(ps.item_count) || 0;
//       }
//     }
//     const prevATV = prevCompleted > 0 ? prevRevenue / prevCompleted : 0;

//     const metrics: PeriodKpiMetrics = {
//       totalRevenue: Math.round(totalRevenue * 100) / 100,
//       grossSales: Math.round(grossSales * 100) / 100,
//       totalDiscounts: Math.round(totalDiscounts * 100) / 100,
//       totalTaxes: Math.round(totalTaxes * 100) / 100,
//       totalTransactions,
//       completedTransactions,
//       cancelledTransactions,
//       cancelledAmount: Math.round(cancelledAmount * 100) / 100,
//       refundedTransactions,
//       refundedAmount: Math.round(refundedAmount * 100) / 100,
//       pendingTransactions,
//       totalItemsSold,
//       averageTransactionValue,
//       successRate,
//       activeEmployeesCount,
//       avgTransactionsPerEmployee,
//       topEmployee,
//       revenueChangePct: calculatePctChange(totalRevenue, prevRevenue),
//       transactionsChangePct: calculatePctChange(
//         completedTransactions,
//         prevCompleted,
//       ),
//       itemsSoldChangePct: calculatePctChange(totalItemsSold, prevItems),
//       atvChangePct: calculatePctChange(averageTransactionValue, prevATV),
//     };

//     // ── 3. TIME SERIES CHART DATA GENERATION ──
//     const timeSeriesMap = new Map<string, TimeSeriesPoint>();

//     if (granularity === "hour") {
//       // 24-hour slots from 00:00 to 23:00
//       for (let h = 0; h < 24; h++) {
//         const hourStr = `${h.toString().padStart(2, "0")}:00`;
//         timeSeriesMap.set(hourStr, {
//           period: hourStr,
//           timestamp: hourStr,
//           revenue: 0,
//           transactions: 0,
//           itemsSold: 0,
//           completedCount: 0,
//           refundedCount: 0,
//           cancelledCount: 0,
//         });
//       }
//       for (const sale of currentSales) {
//         const saleD = new Date(sale.sale_date);
//         const hourKey = `${saleD.getHours().toString().padStart(2, "0")}:00`;
//         const pt = timeSeriesMap.get(hourKey);
//         if (pt) {
//           pt.transactions += 1;
//           const amt = Number(sale.total_amount) || 0;
//           const itm = Number(sale.item_count) || 0;
//           if (sale.status === "completed") {
//             pt.revenue += amt;
//             pt.itemsSold += itm;
//             pt.completedCount += 1;
//           } else if (sale.status === "refunded") {
//             pt.refundedCount += 1;
//           } else if (sale.status === "cancelled") {
//             pt.cancelledCount += 1;
//           }
//         }
//       }
//     } else if (granularity === "day") {
//       const numDays = differenceInDays(end, start) + 1;
//       for (let d = 0; d < numDays; d++) {
//         const curD = subDays(end, numDays - 1 - d);
//         const dateKey = format(curD, "yyyy-MM-dd");
//         const displayLabel = format(curD, "MMM d");
//         timeSeriesMap.set(dateKey, {
//           period: displayLabel,
//           timestamp: dateKey,
//           revenue: 0,
//           transactions: 0,
//           itemsSold: 0,
//           completedCount: 0,
//           refundedCount: 0,
//           cancelledCount: 0,
//         });
//       }
//       for (const sale of currentSales) {
//         const saleDateKey = format(new Date(sale.sale_date), "yyyy-MM-dd");
//         const pt = timeSeriesMap.get(saleDateKey);
//         if (pt) {
//           pt.transactions += 1;
//           const amt = Number(sale.total_amount) || 0;
//           const itm = Number(sale.item_count) || 0;
//           if (sale.status === "completed") {
//             pt.revenue += amt;
//             pt.itemsSold += itm;
//             pt.completedCount += 1;
//           } else if (sale.status === "refunded") {
//             pt.refundedCount += 1;
//           } else if (sale.status === "cancelled") {
//             pt.cancelledCount += 1;
//           }
//         }
//       }
//     } else {
//       // Monthly aggregation
//       const months = [
//         "Jan",
//         "Feb",
//         "Mar",
//         "Apr",
//         "May",
//         "Jun",
//         "Jul",
//         "Aug",
//         "Sep",
//         "Oct",
//         "Nov",
//         "Dec",
//       ];
//       months.forEach((m, idx) => {
//         const mKey = (idx + 1).toString().padStart(2, "0");
//         timeSeriesMap.set(mKey, {
//           period: m,
//           timestamp: mKey,
//           revenue: 0,
//           transactions: 0,
//           itemsSold: 0,
//           completedCount: 0,
//           refundedCount: 0,
//           cancelledCount: 0,
//         });
//       });
//       for (const sale of currentSales) {
//         const mKey = format(new Date(sale.sale_date), "MM");
//         const pt = timeSeriesMap.get(mKey);
//         if (pt) {
//           pt.transactions += 1;
//           const amt = Number(sale.total_amount) || 0;
//           const itm = Number(sale.item_count) || 0;
//           if (sale.status === "completed") {
//             pt.revenue += amt;
//             pt.itemsSold += itm;
//             pt.completedCount += 1;
//           } else if (sale.status === "refunded") {
//             pt.refundedCount += 1;
//           } else if (sale.status === "cancelled") {
//             pt.cancelledCount += 1;
//           }
//         }
//       }
//     }

//     const timeSeries = Array.from(timeSeriesMap.values()).map((p) => ({
//       ...p,
//       revenue: Math.round(p.revenue * 100) / 100,
//     }));

//     // ── 4. EMPLOYEE COMPARISON & PERFORMANCE BREAKDOWN ──
//     const allRegisteredUsers = await db("users").select(
//       "id",
//       "username",
//       "email",
//       "firstname",
//       "lastname",
//       "role",
//     );

//     const employeePerformance: EmployeePerformanceRow[] = [];
//     const salesByEmployee: EmployeeSalesSummaryResponse["employeeComparison"]["salesByEmployee"] =
//       [];

//     // Ensure all employees are included in performance table
//     for (const u of allRegisteredUsers) {
//       const empStats = employeeMap.get(u.id);
//       const empName =
//         [u.firstname, u.lastname].filter(Boolean).join(" ").trim() ||
//         u.username ||
//         "Staff";

//       const totalTxs = empStats ? empStats.transactions : 0;
//       const compTxs = empStats ? empStats.completed : 0;
//       const cancTxs = empStats ? empStats.cancelled : 0;
//       const refTxs = empStats ? empStats.refunded : 0;
//       const salesAmt = empStats ? Math.round(empStats.revenue * 100) / 100 : 0;
//       const itms = empStats ? empStats.itemsSold : 0;
//       const atv =
//         compTxs > 0 ? Math.round((salesAmt / compTxs) * 100) / 100 : 0;
//       const sRate =
//         totalTxs > 0 ? Math.round((compTxs / totalTxs) * 1000) / 10 : 100;
//       const sharePct =
//         totalRevenue > 0
//           ? Math.round((salesAmt / totalRevenue) * 1000) / 10
//           : 0;

//       // Filter performance table if single employee filter is selected
//       if (employeeId === "all" || employeeId === u.id) {
//         employeePerformance.push({
//           employeeId: u.id,
//           employeeName: empName,
//           username: u.username,
//           email: u.email,
//           role: u.role || "member",
//           totalTransactions: totalTxs,
//           completedTransactions: compTxs,
//           cancelledTransactions: cancTxs,
//           refundedTransactions: refTxs,
//           successRate: sRate,
//           totalSales: salesAmt,
//           grossSales: empStats
//             ? Math.round(
//                 (salesAmt + empStats.discounts - empStats.taxes) * 100,
//               ) / 100
//             : 0,
//           totalDiscounts: empStats
//             ? Math.round(empStats.discounts * 100) / 100
//             : 0,
//           totalTaxes: empStats ? Math.round(empStats.taxes * 100) / 100 : 0,
//           avgTransactionValue: atv,
//           itemsSold: itms,
//           salesContributionPct: sharePct,
//           lastTransactionDate: empStats?.lastSaleDate || null,
//         });

//         if (salesAmt > 0 || compTxs > 0) {
//           salesByEmployee.push({
//             employeeId: u.id,
//             employeeName: empName,
//             username: u.username,
//             revenue: salesAmt,
//             transactions: compTxs,
//             itemsSold: itms,
//             atv,
//             contributionPct: sharePct,
//           });
//         }
//       }
//     }

//     // Sort Performance Table by Total Sales descending
//     employeePerformance.sort((a, b) => b.totalSales - a.totalSales);
//     salesByEmployee.sort((a, b) => b.revenue - a.revenue);

//     // Payment Modes list
//     const paymentModeBreakdown = Array.from(paymentModesMap.entries()).map(
//       ([mode, data]) => ({
//         mode,
//         count: data.count,
//         amount: Math.round(data.amount * 100) / 100,
//         percentage:
//           totalRevenue > 0
//             ? Math.round((data.amount / totalRevenue) * 1000) / 10
//             : 0,
//       }),
//     );
//     paymentModeBreakdown.sort((a, b) => b.amount - a.amount);

//     // ── 5. PAGINATED TRANSACTION HISTORY TABLE ──
//     const txQuery = db("v_sale_summary");
//     applyFilters(txQuery, true, false);

//     // Count total records matching filters
//     const totalTxCountResult = await txQuery
//       .clone()
//       .count("sale_id as total")
//       .first();
//     const totalTxRecords = Number(totalTxCountResult?.total) || 0;

//     // Apply Sorting
//     const sortFieldMap: Record<string, string> = {
//       sale_date: "sale_date",
//       total_amount: "total_amount",
//       item_count: "item_count",
//       user_name: "user_name",
//       customer_name: "customer_name",
//       status: "status",
//       receipt_number: "receipt_number",
//     };
//     const resolvedSortField = sortFieldMap[sortBy] || "sale_date";
//     txQuery.orderBy(resolvedSortField, sortOrder === "asc" ? "asc" : "desc");

//     // Pagination
//     const offset = (page - 1) * pageSize;
//     txQuery.limit(pageSize).offset(offset);

//     const rawTransactions = await txQuery.select(
//       "sale_id",
//       "receipt_number",
//       "sale_date",
//       "user_id",
//       "user_name",
//       "user_name",
//       db.raw("'member' as user_role"),
//       "customer_id",
//       "customer_name",
//       "phonenumber",
//       "item_count",
//       "total_amount",
//       db.raw("0 as balance"),
//       db.raw("0 as discount"),
//       db.raw("0 as tax"),
//       "payment_mode",
//       "status",
//       "details",
//     );

//     // Fetch line items summary preview for these transactions
//     const saleIds = rawTransactions.map((r) => r.sale_id);
//     let itemsSummaryMap = new Map<string, string>();

//     if (saleIds.length > 0) {
//       const itemsList = await db("sale_items")
//         .join("products", "sale_items.product_id", "products.id")
//         .select(
//           "sale_items.sales_id",
//           "products.name",
//           "sale_items.quantity",
//         )
//         .whereIn("sale_items.sales_id", saleIds);

//       const groupedBySale = new Map<string, { name: string; qty: number }[]>();
//       for (const itm of itemsList) {
//         if (!groupedBySale.has(itm.sales_id)) {
//           groupedBySale.set(itm.sales_id, []);
//         }
//         groupedBySale.get(itm.sales_id)!.push({
//           name: itm.name,
//           qty: itm.quantity,
//         });
//       }

//       groupedBySale.forEach((items, sid) => {
//         const summary = items
//           .slice(0, 3)
//           .map((i) => `${i.qty}x ${i.name}`)
//           .join(", ");
//         const remaining = items.length - 3;
//         itemsSummaryMap.set(
//           sid,
//           remaining > 0 ? `${summary} +${remaining} more` : summary,
//         );
//       });
//     }

//     const detailedTransactions: DetailedTransactionRow[] = rawTransactions.map(
//       (tx) => ({
//         saleId: tx.sale_id,
//         receiptNo: tx.receipt_number || tx.sale_id,
//         saleDate: tx.sale_date,
//         employeeId: tx.user_id,
//         employeeName: tx.user_name || "Unknown Staff",
//         employeeUsername: tx.user_name || "",
//         employeeRole: tx.user_role || "member",
//         customerId: tx.customer_id,
//         customerName: tx.customer_name || "Walk-in Customer",
//         customerPhone: tx.phonenumber || "",
//         itemCount: Number(tx.item_count) || 0,
//         itemsSummary:
//           itemsSummaryMap.get(tx.sale_id) || `${tx.item_count || 1} items`,
//         totalAmount: Number(tx.total_amount) || 0,
//         balance: Number(tx.balance) || 0,
//         discount: Number(tx.discount) || 0,
//         tax: Number(tx.tax) || 0,
//         paymentMode: tx.payment_mode || "cash",
//         status: tx.status || "completed",
//         details: tx.details || "",
//       }),
//     );

//     const totalPages = Math.ceil(totalTxRecords / pageSize) || 1;

//     return Result.ok({
//       filters: {
//         employeeId,
//         datePreset,
//         startDate: startIso,
//         endDate: endIso,
//         status: statusFilter,
//         paymentMode: paymentFilter,
//         searchQuery,
//       },
//       metrics,
//       timeSeries,
//       employeeComparison: {
//         salesByEmployee,
//         paymentModeBreakdown,
//       },
//       employeePerformance,
//       transactions: {
//         records: detailedTransactions,
//         totalRecords: totalTxRecords,
//         page,
//         pageSize,
//         totalPages,
//       },
//     });
//   } catch (error: any) {
//     console.error("Failed to fetch employee sales summary:", error);
//     return Result.fail(
//       error?.message || "Failed to load employee sales summary",
//     );
//   }
// }

// // ──────────────────────────────────────────────────────────────
// // 3. Export Data Action for CSV / Excel
// // ──────────────────────────────────────────────────────────────
// export async function getEmployeeSummaryExportData(
//   options: EmployeeFilterOptions = {},
// ): Promise<
//   Result<{ transactions: any[]; employeePerformance: any[]; summaryKpis: any }>
// > {
//   try {
//     const fullResult = await getEmployeeSalesSummaryData({
//       ...options,
//       pageSize: 5000, // fetch all records matching filter
//       page: 1,
//     });

//     if (!fullResult.success || !fullResult.data) {
//       throw new Error(fullResult.message || "Failed to retrieve export data");
//     }

//     const { metrics, employeePerformance, transactions } = fullResult.data;

//     return Result.ok({
//       transactions: transactions.records,
//       employeePerformance,
//       summaryKpis: metrics,
//     });
//   } catch (error: any) {
//     console.error("Export generation failed:", error);
//     return Result.fail(error?.message || "Failed to generate export data");
//   }
// }
