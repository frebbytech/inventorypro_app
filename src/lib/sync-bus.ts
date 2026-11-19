import "server-only";
import { EventEmitter } from "node:events";
import type { Knex } from "knex";
import db from "@/db/knex";
import { generateId } from "@/utils/generator";
import { ensureMultiTenantSchema } from "@/lib/tenant";

export type SyncEntityType =
  | "product"
  | "category"
  | "sale"
  | "inventory"
  | "customer"
  | "supplier"
  | "supplier_transaction"
  | "notification"
  | "message"
  | "settings"
  | "employee";

export type SyncActionType = "upsert" | "delete" | "stock_delta" | "refresh";

export interface SyncEventRecord {
  cursor: number;
  tenant_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  action: SyncActionType;
  payload: Record<string, unknown> | null;
  actor_user_id: string | null;
  created_at: string;
}

const globalForSyncBus = globalThis as typeof globalThis & {
  __inventoryProSyncBus?: EventEmitter;
};

const syncEmitter: EventEmitter =
  globalForSyncBus.__inventoryProSyncBus ||
  (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(500);
    return emitter;
  })();

if (!globalForSyncBus.__inventoryProSyncBus) {
  globalForSyncBus.__inventoryProSyncBus = syncEmitter;
}

function channelForTenant(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export function publishSyncEvent(event: SyncEventRecord): void {
  syncEmitter.emit(channelForTenant(event.tenant_id), event);
}

export function subscribeTenantSync(
  tenantId: string,
  listener: (event: SyncEventRecord) => void,
): () => void {
  const channel = channelForTenant(tenantId);
  syncEmitter.on(channel, listener);
  return () => {
    syncEmitter.off(channel, listener);
  };
}

export async function insertSyncEvent(
  knexOrTrx: Knex | Knex.Transaction,
  input: {
    tenantId: string;
    entityType: SyncEntityType;
    entityId: string;
    action: SyncActionType;
    payload?: Record<string, unknown> | null;
    actorUserId?: string | null;
  },
): Promise<SyncEventRecord> {
  const createdAt = new Date().toISOString();
  const payloadJson = input.payload ? JSON.stringify(input.payload) : null;

  const inserted = await knexOrTrx("sync_events")
    .insert({
      tenant_id: input.tenantId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      payload_json: payloadJson,
      actor_user_id: input.actorUserId ?? null,
      created_at: createdAt,
    })
    .returning("cursor")
    .catch(async () => {
      const fallback = await knexOrTrx("sync_events").insert({
        tenant_id: input.tenantId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        action: input.action,
        payload_json: payloadJson,
        actor_user_id: input.actorUserId ?? null,
        created_at: createdAt,
      });
      return fallback;
    });

  let cursor = 0;
  if (Array.isArray(inserted) && inserted.length > 0) {
    const first = inserted[0] as any;
    cursor = Number(typeof first === "object" ? first?.cursor : first) || 0;
  }

  if (!cursor) {
    const maxRow = await knexOrTrx("sync_events")
      .where("tenant_id", input.tenantId)
      .max("cursor as maxCursor")
      .first();
    cursor = Number(maxRow?.maxCursor) || 0;
  }

  return {
    cursor,
    tenant_id: input.tenantId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    payload: input.payload ?? null,
    actor_user_id: input.actorUserId ?? null,
    created_at: createdAt,
  };
}

/**
 * Convenience helper: persists a sync_event and immediately fans out over SSE.
 * For multi-statement DB transactions, prefer insertSyncEvent(trx, ...) inside the tx
 * and publishSyncEvent(event) right after trx.commit().
 */
export async function emitSyncEvent(input: {
  tenantId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncActionType;
  payload?: Record<string, unknown> | null;
  actorUserId?: string | null;
}): Promise<SyncEventRecord | null> {
  try {
    await ensureMultiTenantSchema();
    const record = await insertSyncEvent(db, input);
    publishSyncEvent(record);
    return record;
  } catch (err) {
    console.warn("Failed to emit sync event:", err);
    return null;
  }
}

export async function readSyncEventsSince(
  tenantId: string,
  sinceCursor: number,
  limit: number = 500,
): Promise<{
  events: SyncEventRecord[];
  latestCursor: number;
  oldestAvailableCursor: number;
}> {
  await ensureMultiTenantSchema();

  const bounds = await db("sync_events")
    .where("tenant_id", tenantId)
    .select(
      db.raw("COALESCE(MIN(cursor), 0) as minCursor"),
      db.raw("COALESCE(MAX(cursor), 0) as maxCursor"),
    )
    .first();

  const rows = await db("sync_events")
    .where("tenant_id", tenantId)
    .andWhere("cursor", ">", Math.max(0, Math.floor(sinceCursor)))
    .orderBy("cursor", "asc")
    .limit(limit);

  const events: SyncEventRecord[] = rows.map((row: any) => {
    let parsedPayload: Record<string, unknown> | null = null;
    if (row.payload_json) {
      try {
        parsedPayload = JSON.parse(row.payload_json);
      } catch {
        parsedPayload = null;
      }
    }
    return {
      cursor: Number(row.cursor),
      tenant_id: String(row.tenant_id),
      entity_type: row.entity_type,
      entity_id: String(row.entity_id),
      action: row.action,
      payload: parsedPayload,
      actor_user_id: row.actor_user_id ? String(row.actor_user_id) : null,
      created_at: String(row.created_at),
    };
  });

  return {
    events,
    latestCursor: Number(bounds?.maxCursor) || 0,
    oldestAvailableCursor: Number(bounds?.minCursor) || 0,
  };
}

export async function getLatestTenantCursor(tenantId: string): Promise<number> {
  await ensureMultiTenantSchema();
  const row = await db("sync_events")
    .where("tenant_id", tenantId)
    .max("cursor as maxCursor")
    .first();
  return Number(row?.maxCursor) || 0;
}

export async function runWithIdempotency<T>(opts: {
  tenantId: string;
  clientMutationId?: string | null;
  endpoint: string;
  handler: () => Promise<{ statusCode?: number; body: T }>;
}): Promise<{ replay: boolean; statusCode: number; body: T }> {
  const key = opts.clientMutationId?.trim();
  if (!key) {
    const res = await opts.handler();
    return { replay: false, statusCode: res.statusCode ?? 200, body: res.body };
  }

  await ensureMultiTenantSchema();

  const existing = await db("idempotency_keys")
    .where({ tenant_id: opts.tenantId, client_mutation_id: key })
    .first();

  if (existing) {
    try {
      return {
        replay: true,
        statusCode: Number(existing.status_code) || 200,
        body: JSON.parse(existing.response_json) as T,
      };
    } catch {
      // Fall through if corrupted
    }
  }

  const result = await opts.handler();
  const statusCode = result.statusCode ?? 200;

  if (statusCode >= 200 && statusCode < 300) {
    await db("idempotency_keys")
      .insert({
        id: generateId(),
        tenant_id: opts.tenantId,
        client_mutation_id: key,
        endpoint: opts.endpoint,
        status_code: statusCode,
        response_json: JSON.stringify(result.body),
        created_at: new Date().toISOString(),
      })
      .onConflict(["tenant_id", "client_mutation_id"])
      .ignore()
      .catch(() => {});
  }

  return { replay: false, statusCode, body: result.body };
}
