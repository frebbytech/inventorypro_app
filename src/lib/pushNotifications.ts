import "server-only";
import db from "@/db/knex";
import { applyMultiTenantSchema } from "@/lib/tenant-schema";
import { generateId } from "@/utils/generator";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_TOKEN_REGEX = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/;

export interface MobilePushMessageItem {
  userId: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
  sound?: "default" | null;
}

export interface ExpoPushSendResult {
  attempted: number;
  sent: number;
  deactivatedTokens: number;
  skippedReason?: string;
}

export type ExpoPushTransport = (
  messages: Array<{
    to: string;
    title: string;
    body: string;
    sound: "default" | null;
    channelId: string;
    data: Record<string, unknown>;
  }>,
  headers: Record<string, string>,
) => Promise<{
  ok: boolean;
  status: number;
  tickets: Array<{ status?: string; details?: { error?: string } }>;
}>;

let customTransportForTests: ExpoPushTransport | null = null;

export function setExpoPushTransportForTests(
  transport: ExpoPushTransport | null,
): void {
  customTransportForTests = transport;
}

export function isValidExpoPushToken(token: unknown): token is string {
  if (typeof token !== "string") return false;
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 256) return false;
  return EXPO_TOKEN_REGEX.test(trimmed);
}

export function normalizePushPlatform(platform: unknown): "ios" | "android" | "web" {
  const clean = String(platform || "").trim().toLowerCase();
  if (clean === "ios" || clean === "android") return clean;
  return "web";
}

function parseBoolFlag(val: unknown, fallback = true): boolean {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  const lower = String(val).trim().toLowerCase();
  if (lower === "false" || lower === "0" || lower === "no") return false;
  if (lower === "true" || lower === "1" || lower === "yes") return true;
  return fallback;
}

export async function registerMobilePushToken(params: {
  tenantId: string;
  userId: string;
  token: string;
  platform?: string;
  deviceName?: string | null;
}): Promise<{ id: string; token: string; platform: string }> {
  await applyMultiTenantSchema(db);

  const cleanToken = params.token.trim();
  if (!isValidExpoPushToken(cleanToken)) {
    throw new Error("Invalid Expo push token format.");
  }

  const platform = normalizePushPlatform(params.platform);
  const deviceName = params.deviceName
    ? String(params.deviceName).trim().slice(0, 120)
    : null;
  const nowIso = new Date().toISOString();

  // If the same hardware device changed accounts, deactivate stale rows for this token on other users
  await db("mobile_push_tokens")
    .where({ token: cleanToken })
    .whereNot({ user_id: params.userId })
    .update({
      is_active: 0,
      updated_at: nowIso,
    });

  const existing = await db("mobile_push_tokens")
    .where({ user_id: params.userId, token: cleanToken })
    .first("id");

  if (existing?.id) {
    await db("mobile_push_tokens")
      .where({ id: existing.id })
      .update({
        tenant_id: params.tenantId,
        platform,
        device_name: deviceName,
        is_active: 1,
        last_seen_at: nowIso,
        updated_at: nowIso,
      });
    return { id: String(existing.id), token: cleanToken, platform };
  }

  const id = generateId("ptk");
  await db("mobile_push_tokens").insert({
    id,
    tenant_id: params.tenantId,
    user_id: params.userId,
    token: cleanToken,
    platform,
    device_name: deviceName,
    is_active: 1,
    last_seen_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  });

  return { id, token: cleanToken, platform };
}

export async function unregisterMobilePushToken(params: {
  tenantId: string;
  userId: string;
  token?: string | null;
}): Promise<number> {
  await applyMultiTenantSchema(db);
  const nowIso = new Date().toISOString();

  let query = db("mobile_push_tokens").where({
    tenant_id: params.tenantId,
    user_id: params.userId,
    is_active: 1,
  });

  if (params.token && params.token.trim()) {
    query = query.where({ token: params.token.trim() });
  }

  return query.update({
    is_active: 0,
    updated_at: nowIso,
  });
}

async function defaultExpoPushTransport(
  messages: Array<{
    to: string;
    title: string;
    body: string;
    sound: "default" | null;
    channelId: string;
    data: Record<string, unknown>;
  }>,
  headers: Record<string, string>,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as {
      data?: Array<{ status?: string; details?: { error?: string } }>;
    } | null;
    const tickets = Array.isArray(json?.data) ? json.data : [];
    return { ok: res.ok, status: res.status, tickets };
  } finally {
    clearTimeout(timer);
  }
}

export async function dispatchExpoPushNotifications(params: {
  tenantId: string;
  items: MobilePushMessageItem[];
}): Promise<ExpoPushSendResult> {
  if (!params.tenantId || params.items.length === 0) {
    return { attempted: 0, sent: 0, deactivatedTokens: 0, skippedReason: "empty" };
  }

  if (process.env.DISABLE_EXPO_PUSH === "true") {
    return { attempted: 0, sent: 0, deactivatedTokens: 0, skippedReason: "disabled_by_env" };
  }

  // Skip real network dispatch automatically in Vitest unless a mock transport is installed
  if (process.env.VITEST && !customTransportForTests) {
    return { attempted: 0, sent: 0, deactivatedTokens: 0, skippedReason: "test_env" };
  }

  await applyMultiTenantSchema(db);

  const settingsRow = await db("settings")
    .where({ tenant_id: params.tenantId })
    .select("notification_push")
    .first()
    .catch(() => null);

  if (settingsRow && !parseBoolFlag(settingsRow.notification_push, true)) {
    return { attempted: 0, sent: 0, deactivatedTokens: 0, skippedReason: "push_disabled" };
  }

  const userIds = Array.from(
    new Set(params.items.map((item) => item.userId).filter(Boolean)),
  );
  if (userIds.length === 0) {
    return { attempted: 0, sent: 0, deactivatedTokens: 0, skippedReason: "no_users" };
  }

  const tokenRows = await db("mobile_push_tokens")
    .where({ tenant_id: params.tenantId, is_active: 1 })
    .whereIn("user_id", userIds)
    .select("user_id", "token");

  if (tokenRows.length === 0) {
    return { attempted: 0, sent: 0, deactivatedTokens: 0, skippedReason: "no_tokens" };
  }

  const tokensByUser = new Map<string, string[]>();
  for (const row of tokenRows) {
    const uid = String(row.user_id);
    const tok = String(row.token || "").trim();
    if (!isValidExpoPushToken(tok)) continue;
    const list = tokensByUser.get(uid) ?? [];
    if (!list.includes(tok)) {
      list.push(tok);
      tokensByUser.set(uid, list);
    }
  }

  const messages: Array<{
    to: string;
    title: string;
    body: string;
    sound: "default" | null;
    channelId: string;
    data: Record<string, unknown>;
  }> = [];

  for (const item of params.items) {
    const userTokens = tokensByUser.get(item.userId) ?? [];
    for (const token of userTokens) {
      messages.push({
        to: token,
        title: String(item.title || "Inventory Pro").slice(0, 120),
        body: String(item.body || item.title || "").slice(0, 280),
        sound: item.sound === null ? null : "default",
        channelId: "alerts",
        data: item.data ?? {},
      });
    }
  }

  if (messages.length === 0) {
    return { attempted: 0, sent: 0, deactivatedTokens: 0, skippedReason: "no_valid_tokens" };
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  const expoAccessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (expoAccessToken) {
    headers.Authorization = `Bearer ${expoAccessToken}`;
  }

  const transport = customTransportForTests ?? defaultExpoPushTransport;
  let sent = 0;
  const tokensToDeactivate: string[] = [];

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const response = await transport(chunk, headers);
      if (response.ok) {
        if (response.tickets.length === 0) {
          sent += chunk.length;
        } else {
          response.tickets.forEach((ticket, idx) => {
            if (ticket?.status === "error") {
              if (ticket.details?.error === "DeviceNotRegistered") {
                tokensToDeactivate.push(chunk[idx].to);
              }
            } else {
              sent += 1;
            }
          });
        }
      }
    } catch {
      // Non-blocking: transient Expo Push API failures must never disrupt POS flows
    }
  }

  let deactivatedTokens = 0;
  if (tokensToDeactivate.length > 0) {
    deactivatedTokens = await db("mobile_push_tokens")
      .where({ tenant_id: params.tenantId })
      .whereIn("token", tokensToDeactivate)
      .update({
        is_active: 0,
        updated_at: new Date().toISOString(),
      })
      .catch(() => 0);
  }

  return {
    attempted: messages.length,
    sent,
    deactivatedTokens,
  };
}
