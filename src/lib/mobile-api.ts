import "server-only";
import { NextResponse } from "next/server";
import db from "@/db/knex";
import {
  getBearerAuthSession,
  buildDefaultSettingsRow,
  type SessionUser as ServerSessionUser,
} from "@/lib/auth";
import { runWithAuthContext } from "@/lib/request-context";
import { decrypt } from "@/lib/encryption";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
} from "@/lib/tenant";
import { generateId } from "@/utils/generator";
import {
  HttpStatusError,
  sanitizeMobileServerError,
  sanitizeServerMessage,
  type MobileErrorCode,
} from "./mobile-error";

export {
  HttpStatusError,
  sanitizeMobileServerError,
  sanitizeServerMessage,
  type MobileErrorCode,
};

export type MobileTwoFactorMethod = "email" | "sms";

export interface MobileDaySchedule {
  day: string;
  label: string;
  closed: boolean;
  openTime: string;
  closeTime: string;
  is24Hours?: boolean;
}

export const DEFAULT_MOBILE_WEEKLY_SCHEDULE: MobileDaySchedule[] = [
  { day: "monday", label: "Monday", closed: false, openTime: "08:00", closeTime: "18:00" },
  { day: "tuesday", label: "Tuesday", closed: false, openTime: "08:00", closeTime: "18:00" },
  { day: "wednesday", label: "Wednesday", closed: false, openTime: "08:00", closeTime: "18:00" },
  { day: "thursday", label: "Thursday", closed: false, openTime: "08:00", closeTime: "18:00" },
  { day: "friday", label: "Friday", closed: false, openTime: "08:00", closeTime: "18:00" },
  { day: "saturday", label: "Saturday", closed: false, openTime: "09:00", closeTime: "16:00" },
  { day: "sunday", label: "Sunday", closed: true, openTime: "09:00", closeTime: "16:00" },
];

export interface MobileSessionUser {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  phonenumber?: string;
  role: "admin" | "member";
  lastLoginAt?: string | null;
  twoFactorEnabled?: boolean;
  twoFactorMethod?: MobileTwoFactorMethod;
}

export interface MobileStaffTwoFactorAccount {
  id: string;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  fullname: string;
  phonenumber: string;
  role: "admin" | "member";
  twoFactorEnabled: boolean;
  twoFactorMethod: MobileTwoFactorMethod;
  twoFactorUpdatedAt: string | null;
  lastLoginAt: string | null;
  isCurrentUser: boolean;
}

export interface MobileStoreProfile {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  currency: string;
  taxRate: number;
  stockAlertThreshold: number;
  language: string;
  notificationEmail: boolean;
  notificationPush: boolean;
  notificationSms: boolean;
  memberSaleAlertEnabled: boolean;
  memberSaleAlertChannels: MobileMemberSaleAlertChannel[];
  stockAudioAlert: boolean;
  stockAudioTone: "chime" | "bell" | "marimba" | "ping";
  stockAudioVolume: number;
  eodReportEnabled: boolean;
  eodBusinessClosingTime: string;
  eodAdminEmail: string;
  eodAdminPhone: string;
  business247: boolean;
  businessOpeningTime: string;
  businessClosingTime: string;
  businessHoursSchedule: MobileDaySchedule[];
  businessHoursNotes: string;
  printAfterSale: boolean;
  paperSize: "thermal_58mm" | "thermal_80mm" | "a4";
}

export type MobileMemberSaleAlertChannel = "in_app" | "email" | "sms";

const VALID_MEMBER_SALE_CHANNELS: MobileMemberSaleAlertChannel[] = [
  "in_app",
  "email",
  "sms",
];

export function parseMemberSaleAlertChannels(
  raw?: unknown,
  fallback: MobileMemberSaleAlertChannel[] = ["in_app"],
): MobileMemberSaleAlertChannel[] {
  let list: unknown[] | null = null;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [...fallback];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        list = parsed;
      }
    } catch {
      list = trimmed.split(",").map((s) => s.trim());
    }
  }
  if (!list) return [...fallback];
  const normalized = new Set<MobileMemberSaleAlertChannel>();
  for (const item of list) {
    const v = String(item || "").trim().toLowerCase() as MobileMemberSaleAlertChannel;
    if (VALID_MEMBER_SALE_CHANNELS.includes(v)) {
      normalized.add(v);
    }
  }
  return VALID_MEMBER_SALE_CHANNELS.filter((ch) => normalized.has(ch));
}

export function parseDbBool(val: unknown, fallback = false): boolean {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  const s = String(val).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

export function parseBusinessHoursSchedule(raw?: unknown): MobileDaySchedule[] {
  if (Array.isArray(raw) && raw.length === 7) {
    return raw.map((d: any, idx: number) => ({
      day: String(d?.day || DEFAULT_MOBILE_WEEKLY_SCHEDULE[idx].day),
      label: String(d?.label || DEFAULT_MOBILE_WEEKLY_SCHEDULE[idx].label),
      closed: Boolean(d?.closed),
      openTime: String(d?.openTime || "08:00"),
      closeTime: String(d?.closeTime || "18:00"),
      ...(d?.is24Hours !== undefined ? { is24Hours: Boolean(d.is24Hours) } : {}),
    }));
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length === 7 &&
        parsed.every(
          (d) =>
            typeof d?.day === "string" &&
            typeof d?.openTime === "string" &&
            typeof d?.closeTime === "string",
        )
      ) {
        return parsed.map((d: any, idx: number) => ({
          day: String(d.day || DEFAULT_MOBILE_WEEKLY_SCHEDULE[idx].day),
          label: String(d.label || DEFAULT_MOBILE_WEEKLY_SCHEDULE[idx].label),
          closed: Boolean(d.closed),
          openTime: String(d.openTime || "08:00"),
          closeTime: String(d.closeTime || "18:00"),
          ...(d.is24Hours !== undefined ? { is24Hours: Boolean(d.is24Hours) } : {}),
        }));
      }
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_MOBILE_WEEKLY_SCHEDULE.map((d) => ({ ...d }));
}

export function normalizeTone(
  val: unknown,
): "chime" | "bell" | "marimba" | "ping" {
  if (val === "bell" || val === "marimba" || val === "ping") return val;
  return "chime";
}

export function normalizePaperSize(
  val: unknown,
): "thermal_58mm" | "thermal_80mm" | "a4" {
  if (val === "a4") return "a4";
  if (val === "thermal_58mm") return "thermal_58mm";
  return "thermal_80mm";
}

export function mapSessionUserToMobile(
  session: ServerSessionUser,
  twoFactor?: {
    twoFactorEnabled?: boolean;
    twoFactorMethod?: MobileTwoFactorMethod;
  },
): MobileSessionUser {
  return {
    id: session.id,
    tenantId: session.tenant_id || DEFAULT_TENANT_ID,
    tenantSlug: session.tenant_slug || DEFAULT_TENANT_SLUG,
    tenantName: session.tenant_name || DEFAULT_TENANT_NAME,
    username: session.username,
    email: session.email,
    firstname: session.firstname,
    lastname: session.lastname,
    phonenumber: session.phonenumber || "",
    role: session.role === "admin" ? "admin" : "member",
    lastLoginAt: session.last_login_at ?? null,
    ...(twoFactor?.twoFactorEnabled !== undefined
      ? { twoFactorEnabled: twoFactor.twoFactorEnabled }
      : {}),
    ...(twoFactor?.twoFactorMethod !== undefined
      ? { twoFactorMethod: twoFactor.twoFactorMethod }
      : {}),
  };
}

export async function getUserTwoFactorFlags(
  userId: string,
): Promise<{
  twoFactorEnabled: boolean;
  twoFactorMethod: MobileTwoFactorMethod;
}> {
  try {
    const row = await db("users")
      .where("id", userId)
      .select("two_factor_enabled", "two_factor_method")
      .first();
    return {
      twoFactorEnabled: parseDbBool(row?.two_factor_enabled, false),
      twoFactorMethod: row?.two_factor_method === "sms" ? "sms" : "email",
    };
  } catch {
    return { twoFactorEnabled: false, twoFactorMethod: "email" };
  }
}

export function mapTwoFactorAccountRow(
  row: any,
  currentUserId?: string,
): MobileStaffTwoFactorAccount {
  const firstname = String(row.firstname || "").trim();
  const lastname = String(row.lastname || "").trim();
  const fullname =
    `${firstname} ${lastname}`.trim() || String(row.username || "");
  return {
    id: String(row.id),
    username: String(row.username || ""),
    email: String(row.email || ""),
    firstname,
    lastname,
    fullname,
    phonenumber: String(row.phonenumber || ""),
    role: row.role === "admin" ? "admin" : "member",
    twoFactorEnabled: parseDbBool(row.two_factor_enabled, false),
    twoFactorMethod: row.two_factor_method === "sms" ? "sms" : "email",
    twoFactorUpdatedAt: row.two_factor_updated_at
      ? new Date(row.two_factor_updated_at).toISOString()
      : null,
    lastLoginAt: row.last_login_at
      ? new Date(row.last_login_at).toISOString()
      : null,
    isCurrentUser: Boolean(currentUserId && String(row.id) === currentUserId),
  };
}

export async function getTwoFactorChannelStatus(
  tenantId: string,
): Promise<{ emailConfigured: boolean; smsConfigured: boolean }> {
  try {
    const rows = await db("api_settings")
      .leftJoin("users", "api_settings.user_id", "users.id")
      .where("api_settings.tenant_id", tenantId)
      .select(
        "api_settings.smtp_user",
        "api_settings.smtp_password",
        "api_settings.arkessel_api_key",
      )
      .orderByRaw("CASE WHEN users.role = 'admin' THEN 0 ELSE 1 END");

    const row = rows[0];
    if (!row) {
      return { emailConfigured: false, smsConfigured: false };
    }
    const emailConfigured = Boolean(
      row.smtp_user && row.smtp_password && decrypt(String(row.smtp_password)),
    );
    const smsConfigured = Boolean(
      row.arkessel_api_key && decrypt(String(row.arkessel_api_key)),
    );
    return {
      emailConfigured,
      smsConfigured,
    };
  } catch {
    return { emailConfigured: false, smsConfigured: false };
  }
}

export async function getTenantStoreProfile(
  tenantId: string,
  fallbackUser?: ServerSessionUser,
): Promise<MobileStoreProfile> {
  let settings = await db("settings")
    .where("tenant_id", tenantId)
    .orderByRaw("CASE WHEN user_id = ? THEN 0 ELSE 1 END", [
      fallbackUser?.id || "",
    ])
    .first();

  if (!settings && fallbackUser) {
    const defaults = buildDefaultSettingsRow({
      userId: fallbackUser.id,
      tenantId,
      businessName: fallbackUser.tenant_name || DEFAULT_TENANT_NAME,
      businessEmail: fallbackUser.email || "",
      businessPhone: fallbackUser.phonenumber || "",
    });
    await db("settings")
      .insert(defaults)
      .catch(() => {});
    settings = defaults;
  }

  // Postgres/Web stores tax_rate as percentage (0..100, e.g. 1.0 = 1%).
  // Mobile POS and Mobile StoreProfile standardize taxRate as decimal (0..1, e.g. 0.01 = 1%).
  const taxRatePercent = Math.max(0, Number(settings?.tax_rate ?? 0));
  const taxRateDecimal = Number((taxRatePercent / 100).toFixed(4));
  const rawVolume = Number(settings?.stock_audio_volume ?? 0.5);
  const volume = Number.isFinite(rawVolume)
    ? Math.min(1, Math.max(0, rawVolume))
    : 0.5;

  return {
    storeName:
      settings?.business_name ||
      fallbackUser?.tenant_name ||
      DEFAULT_TENANT_NAME,
    storeAddress: settings?.business_address || "",
    storePhone: settings?.business_phone || "",
    storeEmail: settings?.business_email || "",
    currency: settings?.currency || "GHS",
    taxRate: taxRateDecimal,
    stockAlertThreshold: Math.max(1, Number(settings?.stock_alert_threshold ?? 5)),
    language: String(settings?.language || "en"),
    notificationEmail: parseDbBool(settings?.notification_email, false),
    notificationPush: parseDbBool(settings?.notification_push, false),
    notificationSms: parseDbBool(settings?.notification_sms, false),
    memberSaleAlertEnabled: parseDbBool(
      settings?.member_sale_alert_enabled,
      false,
    ),
    memberSaleAlertChannels: parseMemberSaleAlertChannels(
      settings?.member_sale_alert_channels,
      ["in_app"],
    ),
    stockAudioAlert: parseDbBool(settings?.stock_audio_alert, true),
    stockAudioTone: normalizeTone(settings?.stock_audio_tone),
    stockAudioVolume: volume,
    eodReportEnabled: parseDbBool(settings?.eod_report_enabled, false),
    eodBusinessClosingTime: String(settings?.eod_business_closing_time || "18:00"),
    eodAdminEmail: String(settings?.eod_admin_email || ""),
    eodAdminPhone: String(settings?.eod_admin_phone || ""),
    business247: parseDbBool(settings?.business_24_7, false),
    businessOpeningTime: String(settings?.business_opening_time || "08:00"),
    businessClosingTime: String(settings?.business_closing_time || "18:00"),
    businessHoursSchedule: parseBusinessHoursSchedule(settings?.business_hours_schedule),
    businessHoursNotes: String(settings?.business_hours_notes || ""),
    printAfterSale: parseDbBool(settings?.print_after_sale, true),
    paperSize: normalizePaperSize(settings?.paper_size),
  };
}

export function parseSaleDetails(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") return parsed;
      return { notes: String(parsed) };
    } catch {
      return { notes: trimmed };
    }
  }
  return {};
}

export function extractClientMutationId(
  req: Request,
  body?: Record<string, any> | null,
): string | null {
  const fromHeader = req.headers.get("x-client-mutation-id")?.trim();
  if (fromHeader) return fromHeader;
  const fromBody =
    body && typeof body.clientMutationId === "string"
      ? body.clientMutationId.trim()
      : null;
  return fromBody || null;
}

export function getErrorStatus(err: unknown): {
  status: number;
  message: string;
  code: MobileErrorCode;
} {
  return sanitizeMobileServerError(err, { context: "mobile-api" });
}

export async function withMobileAuth(
  req: Request,
  handler: (ctx: {
    session: ServerSessionUser;
    tenantId: string;
    token: string;
    clientMutationId: string | null;
  }) => Promise<NextResponse>,
  opts?: { requireAdmin?: boolean },
): Promise<NextResponse> {
  try {
    const auth = await getBearerAuthSession(req);
    if (!auth) {
      return NextResponse.json(
        {
          error: "Your session has expired. Please sign in again.",
          code: "UNAUTHORIZED",
        },
        { status: 401 },
      );
    }
    if (opts?.requireAdmin && auth.session.role !== "admin") {
      return NextResponse.json(
        {
          error: "Administrator privileges are required.",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const clientMutationId =
      req.headers.get("x-client-mutation-id")?.trim() || null;

    return await runWithAuthContext(auth.session, () =>
      handler({
        session: auth.session,
        tenantId: auth.session.tenant_id || DEFAULT_TENANT_ID,
        token: auth.token,
        clientMutationId,
      }),
    );
  } catch (err) {
    const { status, message, code } = getErrorStatus(err);
    return NextResponse.json({ error: message, code }, { status });
  }
}

export function mapProductRow(row: any) {
  const costPrice = Number(row.cost_price ?? 0);
  const unitPrice = Number(row.unit_price ?? 0);
  const stockQuantity = Number(row.stock_quantity ?? 0);
  return {
    id: String(row.id ?? row.product_id),
    name: String(row.name ?? row.product_name ?? ""),
    description: String(row.description ?? ""),
    categoryId: String(row.category_id ?? ""),
    categoryName: String(row.category_name ?? "General"),
    barcode: String(row.barcode ?? ""),
    photoUrl: String(row.photo_url ?? ""),
    costPrice,
    unitPrice,
    stockQuantity,
    lowStockThreshold: Number(row.low_stock_threshold ?? 5),
    stockValue: Number(row.stock_value ?? stockQuantity * unitPrice),
    active: row.active !== undefined ? Boolean(Number(row.active)) : Boolean(Number(row.is_active ?? 1)),
    version: Number(row.version ?? 1),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export async function getSaleReceiptDetailDto(
  tenantId: string,
  saleId: string,
  fallbackUser?: ServerSessionUser,
) {
  const sale = await db("sales as s")
    .leftJoin("customers as c", "s.customer_id", "c.id")
    .leftJoin("users as u", "s.user_id", "u.id")
    .select(
      "s.*",
      "c.name as customer_name",
      "c.phonenumber as customer_phone",
      "u.username as attendant_username",
      "u.firstname as attendant_firstname",
      "u.lastname as attendant_lastname",
    )
    .where({ "s.id": saleId, "s.tenant_id": tenantId })
    .first();

  if (!sale) return null;

  const items = await db("sale_items as si")
    .leftJoin("products as p", "si.product_id", "p.id")
    .select(
      "si.id",
      "si.product_id",
      "p.name as product_name",
      "si.quantity",
      "si.unit_price",
    )
    .where({ "si.sales_id": saleId, "si.tenant_id": tenantId });

  const store = await getTenantStoreProfile(tenantId, fallbackUser);
  const details = parseSaleDetails(sale.details);
  const computedSubtotal = items.reduce(
    (sum: number, item: any) =>
      sum + Number(item.quantity ?? 0) * Number(item.unit_price ?? 0),
    0,
  );
  const totalAmount = Number(sale.total_amount ?? 0);
  const isRefunded =
    sale.status === "failed" || Boolean(details.refunded);
  const attendantFull = `${sale.attendant_firstname || ""} ${sale.attendant_lastname || ""}`.trim();

  return {
    id: String(sale.id),
    receiptNo: String(sale.receipt_number || `INVP-${sale.id.slice(0, 8)}`),
    customerName: String(sale.customer_name || "Walk-in Customer"),
    customerPhone: sale.customer_phone || undefined,
    saleDate: String(sale.date || sale.created_at || new Date().toISOString()),
    subtotal: Number(details.subtotal ?? computedSubtotal),
    taxRate: Number(details.taxRate ?? 0),
    taxAmount: Number(details.taxAmount ?? 0),
    discountAmount: Number(details.discountAmount ?? 0),
    totalAmount,
    amountPaid: Number(details.amountPaid ?? totalAmount),
    paymentMode: (sale.payment_mode || "cash") as "cash" | "momo" | "bank" | "cheque",
    status: (isRefunded ? "refunded" : sale.status || "completed") as
      | "completed"
      | "pending"
      | "failed"
      | "refunded",
    attendantName: attendantFull || String(sale.attendant_username || "Staff"),
    notes: details.notes ? String(details.notes) : undefined,
    storeName: store.storeName,
    storeAddress: store.storeAddress,
    storePhone: store.storePhone,
    storeEmail: store.storeEmail,
    currency: store.currency,
    items: items.map((it: any) => {
      const q = Number(it.quantity ?? 0);
      const up = Number(it.unit_price ?? 0);
      return {
        id: String(it.id),
        productId: String(it.product_id),
        productName: String(it.product_name || "Product"),
        quantity: q,
        unitPrice: up,
        subtotal: q * up,
      };
    }),
  };
}

export async function ensureCategoryIdForTenant(
  trx: typeof db,
  tenantId: string,
  userId: string,
  categoryName?: string,
): Promise<{ id: string; name: string; created: boolean }> {
  const cleanName = (categoryName || "General").trim() || "General";
  const existing = await trx("product_categories")
    .where("tenant_id", tenantId)
    .whereRaw("LOWER(name) = ?", [cleanName.toLowerCase()])
    .first("id", "name");

  if (existing) {
    return { id: String(existing.id), name: String(existing.name), created: false };
  }

  const id = generateId();
  await trx("product_categories").insert({
    id,
    tenant_id: tenantId,
    user_id: userId,
    name: cleanName,
    description: `${cleanName} products`,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return { id, name: cleanName, created: true };
}

export async function resolveDefaultSupplierIdForTenant(
  trx: typeof db,
  tenantId: string,
  userId: string,
): Promise<string> {
  const existing = await trx("suppliers")
    .where("tenant_id", tenantId)
    .orderBy("created_at", "asc")
    .first("id");

  if (existing?.id) return String(existing.id);

  const id = generateId();
  await trx("suppliers").insert({
    id,
    tenant_id: tenantId,
    user_id: userId,
    name: "Direct Stock Supplier",
    company_name: "Direct Restock",
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return id;
}

export function getDateRangeStartIso(
  range: "today" | "7d" | "30d" | "all",
): string | null {
  const now = new Date();
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.toISOString();
  }
  if (range === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

export async function buildSalesReportDto(
  tenantId: string,
  dateRange: "today" | "7d" | "30d" | "all",
  fallbackUser?: ServerSessionUser,
) {
  const store = await getTenantStoreProfile(tenantId, fallbackUser);
  const startIso = getDateRangeStartIso(dateRange);

  let salesQuery = db("sales").where("tenant_id", tenantId);
  if (startIso) {
    salesQuery = salesQuery.where("date", ">=", startIso);
  }
  const salesRows = await salesQuery.select("*");

  const saleIds = salesRows.map((s: any) => s.id);
  const itemRows =
    saleIds.length > 0
      ? await db("sale_items as si")
          .leftJoin("products as p", "si.product_id", "p.id")
          .where("si.tenant_id", tenantId)
          .whereIn("si.sales_id", saleIds)
          .select(
            "si.sales_id",
            "si.product_id",
            "p.name as product_name",
            "p.cost_price",
            "si.quantity",
            "si.unit_price",
          )
      : [];

  let completedCount = 0;
  let refundedCount = 0;
  let grossRevenue = 0;
  let refundedAmount = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  const paymentTotals = new Map<string, { count: number; amount: number }>();
  const completedSaleIds = new Set<string>();

  for (const s of salesRows) {
    const details = parseSaleDetails(s.details);
    const amount = Number(s.total_amount ?? 0);
    const isRefunded = s.status === "failed" || Boolean(details.refunded);

    if (isRefunded) {
      refundedCount += 1;
      refundedAmount += amount;
      continue;
    }

    if (s.status === "completed") {
      completedCount += 1;
      grossRevenue += amount;
      totalDiscount += Number(details.discountAmount ?? 0);
      totalTax += Number(details.taxAmount ?? 0);
      completedSaleIds.add(String(s.id));

      const mode = String(s.payment_mode || "cash");
      const entry = paymentTotals.get(mode) || { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += amount;
      paymentTotals.set(mode, entry);
    }
  }

  let estimatedCost = 0;
  let totalUnitsSold = 0;
  const productAgg = new Map<
    string,
    { productId: string; productName: string; unitsSold: number; revenue: number }
  >();

  for (const item of itemRows) {
    if (!completedSaleIds.has(String(item.sales_id))) continue;
    const qty = Number(item.quantity ?? 0);
    const up = Number(item.unit_price ?? 0);
    const cost = Number(item.cost_price ?? 0);
    const rev = qty * up;
    totalUnitsSold += qty;
    estimatedCost += qty * cost;

    const pid = String(item.product_id);
    const existing = productAgg.get(pid) || {
      productId: pid,
      productName: String(item.product_name || "Product"),
      unitsSold: 0,
      revenue: 0,
    };
    existing.unitsSold += qty;
    existing.revenue += rev;
    productAgg.set(pid, existing);
  }

  const grossProfit = grossRevenue - estimatedCost;
  const profitMarginPercent =
    grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
  const averageOrderValue =
    completedCount > 0 ? grossRevenue / completedCount : 0;

  const modes: Array<"cash" | "momo" | "bank" | "cheque"> = [
    "cash",
    "momo",
    "bank",
    "cheque",
  ];
  const paymentBreakdown = modes.map((mode) => {
    const entry = paymentTotals.get(mode) || { count: 0, amount: 0 };
    return {
      paymentMode: mode,
      count: entry.count,
      amount: entry.amount,
      sharePercent: grossRevenue > 0 ? (entry.amount / grossRevenue) * 100 : 0,
    };
  });

  const topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    dateRange,
    currency: store.currency,
    completedCount,
    refundedCount,
    grossRevenue,
    refundedAmount,
    totalDiscount,
    totalTax,
    estimatedCost,
    grossProfit,
    profitMarginPercent,
    averageOrderValue,
    totalUnitsSold,
    paymentBreakdown,
    topProducts,
  };
}

export async function buildDailyReportDto(
  tenantId: string,
  targetDateStr?: string,
  fallbackUser?: ServerSessionUser,
) {
  const dateStr =
    targetDateStr && /^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)
      ? targetDateStr
      : new Date().toISOString().slice(0, 10);
  const startIso = `${dateStr}T00:00:00.000Z`;
  const endIso = `${dateStr}T23:59:59.999Z`;

  const store = await getTenantStoreProfile(tenantId, fallbackUser);

  const salesRows = await db("sales as s")
    .leftJoin("users as u", "s.user_id", "u.id")
    .where("s.tenant_id", tenantId)
    .whereBetween("s.date", [startIso, endIso])
    .select(
      "s.*",
      "u.username as cashier_username",
      "u.firstname as cashier_firstname",
      "u.lastname as cashier_lastname",
    );

  const saleIds = salesRows.map((s: any) => s.id);
  const itemRows =
    saleIds.length > 0
      ? await db("sale_items as si")
          .leftJoin("products as p", "si.product_id", "p.id")
          .where("si.tenant_id", tenantId)
          .whereIn("si.sales_id", saleIds)
          .select(
            "si.sales_id",
            "si.product_id",
            "p.name as product_name",
            "p.cost_price",
            "si.quantity",
            "si.unit_price",
          )
      : [];

  let completedCount = 0;
  let refundedCount = 0;
  let grossRevenue = 0;
  let refundedAmount = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  const completedIds = new Set<string>();
  const paymentTotals = new Map<string, { count: number; amount: number }>();
  const cashierAgg = new Map<
    string,
    { userId: string; cashierName: string; salesCount: number; revenue: number }
  >();

  for (const s of salesRows) {
    const details = parseSaleDetails(s.details);
    const amount = Number(s.total_amount ?? 0);
    const isRefunded = s.status === "failed" || Boolean(details.refunded);

    if (isRefunded) {
      refundedCount += 1;
      refundedAmount += amount;
      continue;
    }

    if (s.status === "completed") {
      completedCount += 1;
      grossRevenue += amount;
      totalDiscount += Number(details.discountAmount ?? 0);
      totalTax += Number(details.taxAmount ?? 0);
      completedIds.add(String(s.id));

      const mode = String(s.payment_mode || "cash");
      const entry = paymentTotals.get(mode) || { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += amount;
      paymentTotals.set(mode, entry);

      const uid = String(s.user_id || "");
      const fullName =
        `${s.cashier_firstname || ""} ${s.cashier_lastname || ""}`.trim() ||
        String(s.cashier_username || "Staff");
      const cEntry = cashierAgg.get(uid) || {
        userId: uid,
        cashierName: fullName,
        salesCount: 0,
        revenue: 0,
      };
      cEntry.salesCount += 1;
      cEntry.revenue += amount;
      cashierAgg.set(uid, cEntry);
    }
  }

  let estimatedCost = 0;
  let totalUnitsSold = 0;
  const productAgg = new Map<
    string,
    { productId: string; productName: string; unitsSold: number; revenue: number }
  >();

  for (const item of itemRows) {
    if (!completedIds.has(String(item.sales_id))) continue;
    const qty = Number(item.quantity ?? 0);
    const up = Number(item.unit_price ?? 0);
    const cost = Number(item.cost_price ?? 0);
    totalUnitsSold += qty;
    estimatedCost += qty * cost;

    const pid = String(item.product_id);
    const pEntry = productAgg.get(pid) || {
      productId: pid,
      productName: String(item.product_name || "Product"),
      unitsSold: 0,
      revenue: 0,
    };
    pEntry.unitsSold += qty;
    pEntry.revenue += qty * up;
    productAgg.set(pid, pEntry);
  }

  const grossProfit = grossRevenue - estimatedCost;
  const modes: Array<"cash" | "momo" | "bank" | "cheque"> = [
    "cash",
    "momo",
    "bank",
    "cheque",
  ];

  return {
    date: dateStr,
    currency: store.currency,
    storeName: store.storeName,
    totalTransactions: salesRows.length,
    completedCount,
    refundedCount,
    grossRevenue,
    refundedAmount,
    totalDiscount,
    totalTax,
    estimatedCost,
    grossProfit,
    profitMarginPercent:
      grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0,
    averageOrderValue:
      completedCount > 0 ? grossRevenue / completedCount : 0,
    totalUnitsSold,
    paymentBreakdown: modes.map((mode) => {
      const e = paymentTotals.get(mode) || { count: 0, amount: 0 };
      return {
        paymentMode: mode,
        count: e.count,
        amount: e.amount,
        sharePercent: grossRevenue > 0 ? (e.amount / grossRevenue) * 100 : 0,
      };
    }),
    topProducts: Array.from(productAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    cashierBreakdown: Array.from(cashierAgg.values()).sort(
      (a, b) => b.revenue - a.revenue,
    ),
  };
}
