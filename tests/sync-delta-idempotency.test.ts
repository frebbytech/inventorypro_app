import { beforeAll, describe, expect, it } from "vitest";
import { GET as syncDeltaGet } from "@/app/api/mobile/v1/sync/delta/route";
import { POST as syncMergePost } from "@/app/api/mobile/v1/sync/merge/route";
import db from "@/db/knex";
import {
  createJWT,
  ensureAuthSchema,
  hashPassword,
  registerWorkspaceAccount,
} from "@/lib/auth";
import { ensureSecuritySchema } from "@/lib/security";
import { emitSyncEvent } from "@/lib/sync-bus";
import { generateId } from "@/utils/generator";

describe("Incremental Delta Sync, Role Scoping & Offline Merge", () => {
  let tenantAId = "";
  let tenantBId = "";
  let adminAToken = "";
  let memberAToken = "";
  let adminBToken = "";
  let adminAUserId = "";
  let adminBUserId = "";
  let memberAUserId = "";

  beforeAll(async () => {
    await ensureAuthSchema();
    await ensureSecuritySchema();

    const suffix = generateId("sync").slice(-8);
    const regA = await registerWorkspaceAccount({
      storeName: `Sync Store A ${suffix}`,
      slug: `sync-a-${suffix}`,
      username: `syncadmin_a_${suffix}`,
      email: `syncadmin_a_${suffix}@example.com`,
      password: "Password123!",
    });
    const regB = await registerWorkspaceAccount({
      storeName: `Sync Store B ${suffix}`,
      slug: `sync-b-${suffix}`,
      username: `syncadmin_b_${suffix}`,
      email: `syncadmin_b_${suffix}@example.com`,
      password: "Password123!",
    });

    tenantAId = regA.tenant.id;
    tenantBId = regB.tenant.id;
    adminAUserId = regA.user.id;
    adminBUserId = regB.user.id;

    // Add a regular member inside Tenant A to test role & user-scoped delta filtering
    memberAUserId = generateId("usr");
    await db("users").insert({
      id: memberAUserId,
      tenant_id: tenantAId,
      username: `cashier_a_${suffix}`,
      email: `cashier_a_${suffix}@example.com`,
      firstname: "Kofi",
      lastname: "Cashier",
      role: "member",
      password_hash: await hashPassword("Password123!"),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    adminAToken = await createJWT({
      userId: adminAUserId,
      tenantId: tenantAId,
      tenantSlug: regA.tenant.slug,
      username: regA.user.username,
      role: "admin",
    });
    memberAToken = await createJWT({
      userId: memberAUserId,
      tenantId: tenantAId,
      tenantSlug: regA.tenant.slug,
      username: `cashier_a_${suffix}`,
      role: "member",
    });
    adminBToken = await createJWT({
      userId: regB.user.id,
      tenantId: tenantBId,
      tenantSlug: regB.tenant.slug,
      username: regB.user.username,
      role: "admin",
    });
  });

  it("enriches tenant-scoped delta events, isolates tenants, and filters private events for members", async () => {
    const nowIso = new Date().toISOString();

    // Seed category & product in Tenant A
    const catId = generateId("cat");
    await db("product_categories").insert({
      id: catId,
      tenant_id: tenantAId,
      user_id: adminAUserId,
      name: "Beverages",
      is_active: 1,
      created_at: nowIso,
      updated_at: nowIso,
    });
    const prodId = generateId("prd");
    await db("products").insert({
      id: prodId,
      tenant_id: tenantAId,
      user_id: adminAUserId,
      category_id: catId,
      name: "Sparkling Water",
      cost_price: 2,
      unit_price: 5,
      stock_quantity: 24,
      low_stock_threshold: 5,
      is_active: 1,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Seed admin-private notification vs member-targeted notification in Tenant A
    const adminNotifId = generateId("ntf");
    const memberNotifId = generateId("ntf");
    await db("notifications").insert([
      {
        id: adminNotifId,
        tenant_id: tenantAId,
        user_id: adminAUserId,
        title: "Admin Alert",
        message: "Only admin should see this",
        type: "system",
        is_read: 0,
        created_at: nowIso,
      },
      {
        id: memberNotifId,
        tenant_id: tenantAId,
        user_id: memberAUserId,
        title: "Cashier Alert",
        message: "Target cashier notification",
        type: "system",
        is_read: 0,
        created_at: nowIso,
      },
    ]);

    // Seed Tenant B product & event that must never leak into Tenant A delta
    const catBId = generateId("cat");
    await db("product_categories").insert({
      id: catBId,
      tenant_id: tenantBId,
      user_id: adminBUserId,
      name: "Tenant B Cat",
      is_active: 1,
      created_at: nowIso,
      updated_at: nowIso,
    });
    const tenantBProdId = generateId("prd");
    await db("products").insert({
      id: tenantBProdId,
      tenant_id: tenantBId,
      user_id: adminBUserId,
      category_id: catBId,
      name: "Secret Tenant B Item",
      cost_price: 10,
      unit_price: 20,
      stock_quantity: 5,
      low_stock_threshold: 2,
      is_active: 1,
      created_at: nowIso,
      updated_at: nowIso,
    });

    await emitSyncEvent({
      tenantId: tenantAId,
      entityType: "product",
      entityId: prodId,
      action: "upsert",
      actorUserId: adminAUserId,
    });
    await emitSyncEvent({
      tenantId: tenantAId,
      entityType: "notification",
      entityId: adminNotifId,
      action: "upsert",
      payload: { userId: adminAUserId },
      actorUserId: adminAUserId,
    });
    await emitSyncEvent({
      tenantId: tenantAId,
      entityType: "notification",
      entityId: memberNotifId,
      action: "upsert",
      payload: { userId: memberAUserId },
      actorUserId: adminAUserId,
    });
    await emitSyncEvent({
      tenantId: tenantAId,
      entityType: "employee",
      entityId: adminAUserId,
      action: "upsert",
      actorUserId: adminAUserId,
    });
    await emitSyncEvent({
      tenantId: tenantBId,
      entityType: "product",
      entityId: tenantBProdId,
      action: "upsert",
    });

    // Admin A sees Tenant A product, notifications, and employee update — never Tenant B
    const adminDeltaRes = await syncDeltaGet(
      new Request("http://localhost/api/mobile/v1/sync/delta?cursor=0", {
        headers: { Authorization: `Bearer ${adminAToken}` },
      }),
    );
    expect(adminDeltaRes.status).toBe(200);
    const adminDelta = (await adminDeltaRes.json()) as {
      events: Array<{
        entityType: string;
        entityId: string;
        payload: Record<string, unknown> | null;
      }>;
      latestCursor: number;
      resetRequired: boolean;
    };

    expect(adminDelta.resetRequired).toBe(false);
    expect(
      adminDelta.events.some(
        (e) => e.entityType === "product" && e.entityId === prodId,
      ),
    ).toBe(true);
    expect(
      adminDelta.events.some((e) => e.entityId === tenantBProdId),
    ).toBe(false);

    // Enriched product record is attached
    const prodEvent = adminDelta.events.find(
      (e) => e.entityType === "product" && e.entityId === prodId,
    );
    expect(
      (prodEvent?.payload?.record as { name?: string } | undefined)?.name,
    ).toBe("Sparkling Water");

    // Member A receives product & own notification, NOT admin-only notification or other user's employee record
    const memberDeltaRes = await syncDeltaGet(
      new Request("http://localhost/api/mobile/v1/sync/delta?cursor=0", {
        headers: { Authorization: `Bearer ${memberAToken}` },
      }),
    );
    expect(memberDeltaRes.status).toBe(200);
    const memberDelta = (await memberDeltaRes.json()) as {
      events: Array<{ entityType: string; entityId: string }>;
    };
    expect(
      memberDelta.events.some(
        (e) => e.entityType === "product" && e.entityId === prodId,
      ),
    ).toBe(true);
    expect(
      memberDelta.events.some(
        (e) => e.entityType === "notification" && e.entityId === memberNotifId,
      ),
    ).toBe(true);
    expect(
      memberDelta.events.some(
        (e) => e.entityType === "notification" && e.entityId === adminNotifId,
      ),
    ).toBe(false);
    expect(
      memberDelta.events.some(
        (e) => e.entityType === "employee" && e.entityId === adminAUserId,
      ),
    ).toBe(false);

    // Tenant B sees only Tenant B events
    const tenantBDeltaRes = await syncDeltaGet(
      new Request("http://localhost/api/mobile/v1/sync/delta?cursor=0", {
        headers: { Authorization: `Bearer ${adminBToken}` },
      }),
    );
    const tenantBDelta = (await tenantBDeltaRes.json()) as {
      events: Array<{ entityId: string }>;
    };
    expect(tenantBDelta.events.every((e) => e.entityId === tenantBProdId)).toBe(
      true,
    );
  });

  it("signals resetRequired when a mobile cursor lags behind pruned sync history", async () => {
    const suffix = generateId("prune").slice(-8);
    const reg = await registerWorkspaceAccount({
      storeName: `Pruned Store ${suffix}`,
      slug: `pruned-${suffix}`,
      username: `pruned_${suffix}`,
      email: `pruned_${suffix}@example.com`,
      password: "Password123!",
    });
    const token = await createJWT({
      userId: reg.user.id,
      tenantId: reg.tenant.id,
      tenantSlug: reg.tenant.slug,
      username: reg.user.username,
      role: "admin",
    });

    const e1 = await emitSyncEvent({
      tenantId: reg.tenant.id,
      entityType: "settings",
      entityId: reg.tenant.id,
      action: "upsert",
    });
    const e2 = await emitSyncEvent({
      tenantId: reg.tenant.id,
      entityType: "settings",
      entityId: reg.tenant.id,
      action: "upsert",
    });
    const e3 = await emitSyncEvent({
      tenantId: reg.tenant.id,
      entityType: "settings",
      entityId: reg.tenant.id,
      action: "upsert",
    });

    expect(e1 && e2 && e3).toBeTruthy();

    // Simulate retention pruning of cursors <= e2.cursor
    await db("sync_events")
      .where("tenant_id", reg.tenant.id)
      .andWhere("cursor", "<=", e2!.cursor)
      .del();

    const deltaRes = await syncDeltaGet(
      new Request(
        `http://localhost/api/mobile/v1/sync/delta?cursor=${e1!.cursor}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
    );
    const json = (await deltaRes.json()) as {
      resetRequired: boolean;
      oldestAvailableCursor: number;
      latestCursor: number;
    };
    expect(json.resetRequired).toBe(true);
    expect(json.oldestAvailableCursor).toBe(e3!.cursor);
    expect(json.latestCursor).toBe(e3!.cursor);
  });

  it("merges offline local SQLite snapshots idempotently via /api/mobile/v1/sync/merge", async () => {
    const mergeKey = generateId("merge_key");
    const payload = {
      categories: [{ id: "local-cat-1", name: "Offline Snacks" }],
      products: [
        {
          id: "local-prod-1",
          name: "Plantain Chips",
          categoryName: "Offline Snacks",
          costPrice: 3,
          unitPrice: 6,
          stockQuantity: 15,
          lowStockThreshold: 3,
        },
      ],
      customers: [{ id: "local-cust-1", name: "Offline Walk-in" }],
      sales: [
        {
          receiptNo: `MOB-TEST-${mergeKey.slice(-6)}`,
          customerName: "Offline Walk-in",
          totalAmount: 12,
          paymentMode: "cash",
          status: "completed",
          items: [
            {
              productId: "local-prod-1",
              productName: "Plantain Chips",
              quantity: 2,
              unitPrice: 6,
            },
          ],
        },
      ],
    };

    const mergeRes1 = await syncMergePost(
      new Request("http://localhost/api/mobile/v1/sync/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminAToken}`,
          "X-Client-Mutation-Id": mergeKey,
        },
        body: JSON.stringify(payload),
      }),
    );
    expect(mergeRes1.status).toBe(200);
    const body1 = (await mergeRes1.json()) as {
      ok: boolean;
      merged: { categories: number; products: number; sales: number };
    };
    expect(body1.ok).toBe(true);
    expect(body1.merged.products).toBe(1);
    expect(body1.merged.sales).toBe(1);

    // Replay same merge mutation ID — should not duplicate products or sales
    const mergeRes2 = await syncMergePost(
      new Request("http://localhost/api/mobile/v1/sync/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminAToken}`,
          "X-Client-Mutation-Id": mergeKey,
        },
        body: JSON.stringify(payload),
      }),
    );
    expect(mergeRes2.status).toBe(200);

    const chipRows = await db("products")
      .where({ tenant_id: tenantAId, name: "Plantain Chips" })
      .select("id");
    expect(chipRows).toHaveLength(1);
  });
});
