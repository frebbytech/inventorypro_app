import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  DELETE as pushTokenDelete,
  POST as pushTokenPost,
} from "@/app/api/mobile/v1/notifications/push-token/route";
import { PATCH as businessSettingsPatch } from "@/app/api/mobile/v1/settings/business/route";
import db from "@/db/knex";
import {
  createJWT,
  ensureAuthSchema,
  registerWorkspaceAccount,
} from "@/lib/auth";
import { normalizePaperSize } from "@/lib/mobile-api";
import {
  dispatchExpoPushNotifications,
  isValidExpoPushToken,
  setExpoPushTransportForTests,
} from "@/lib/pushNotifications";
import { ensureSecuritySchema } from "@/lib/security";
import { generateId } from "@/utils/generator";

describe("Mobile Push Notifications & Thermal Receipt Settings", () => {
  let tenantAId = "";
  let userA1Id = "";
  let tokenA1 = "";
  let userA2Id = "";
  let tokenA2 = "";
  let tenantBId = "";
  let tokenB1 = "";

  beforeAll(async () => {
    await ensureAuthSchema();
    await ensureSecuritySchema();

    const suffix = generateId("push").slice(-8);
    const regA = await registerWorkspaceAccount({
      storeName: `Push Store A ${suffix}`,
      slug: `push-a-${suffix}`,
      username: `push_a_${suffix}`,
      email: `push_a_${suffix}@example.com`,
      password: "Password123!",
    });
    const regB = await registerWorkspaceAccount({
      storeName: `Push Store B ${suffix}`,
      slug: `push-b-${suffix}`,
      username: `push_b_${suffix}`,
      email: `push_b_${suffix}@example.com`,
      password: "Password123!",
    });

    tenantAId = regA.tenant.id;
    userA1Id = regA.user.id;
    tenantBId = regB.tenant.id;

    // Add a second staff member in Tenant A
    userA2Id = generateId("usr");
    const nowIso = new Date().toISOString();
    await db("users").insert({
      id: userA2Id,
      tenant_id: tenantAId,
      username: `cashier_${suffix}`,
      email: `cashier_${suffix}@example.com`,
      firstname: "Cashier",
      lastname: "Two",
      password_hash: regA.user.id,
      role: "member",
      created_at: nowIso,
      updated_at: nowIso,
    });

    tokenA1 = await createJWT({
      userId: userA1Id,
      tenantId: tenantAId,
      tenantSlug: regA.tenant.slug,
      username: regA.user.username,
      role: "admin",
    });
    tokenA2 = await createJWT({
      userId: userA2Id,
      tenantId: tenantAId,
      tenantSlug: regA.tenant.slug,
      username: `cashier_${suffix}`,
      role: "member",
    });
    tokenB1 = await createJWT({
      userId: regB.user.id,
      tenantId: tenantBId,
      tenantSlug: regB.tenant.slug,
      username: regB.user.username,
      role: "admin",
    });
  });

  afterEach(() => {
    setExpoPushTransportForTests(null);
  });

  it("validates Expo push token format strictly", () => {
    expect(isValidExpoPushToken("ExponentPushToken[AbCdEf123456_xyz]")).toBe(
      true,
    );
    expect(isValidExpoPushToken("ExpoPushToken[12345678-abc]")).toBe(true);
    expect(isValidExpoPushToken("https://evil.example.com/token")).toBe(false);
    expect(isValidExpoPushToken("ExponentPushToken[short]")).toBe(false);
    expect(isValidExpoPushToken("")).toBe(false);
  });

  it("requires auth, rejects invalid tokens, registers tokens, and reassigns shared device tokens safely", async () => {
    const unauthRes = await pushTokenPost(
      new Request("http://localhost/api/mobile/v1/notifications/push-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "ExponentPushToken[validDeviceToken12345]",
        }),
      }),
    );
    expect(unauthRes.status).toBe(401);

    const badTokenRes = await pushTokenPost(
      new Request("http://localhost/api/mobile/v1/notifications/push-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA1}`,
        },
        body: JSON.stringify({ token: "not-an-expo-token", platform: "ios" }),
      }),
    );
    expect(badTokenRes.status).toBe(400);

    const sharedDeviceToken = "ExponentPushToken[sharedHandsetToken_001]";

    const regRes1 = await pushTokenPost(
      new Request("http://localhost/api/mobile/v1/notifications/push-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA1}`,
        },
        body: JSON.stringify({
          token: sharedDeviceToken,
          platform: "android",
          deviceName: "Counter POS 1",
        }),
      }),
    );
    expect(regRes1.status).toBe(200);

    // Same hardware device signs in as User A2 -> previous User A1 row becomes inactive
    const regRes2 = await pushTokenPost(
      new Request("http://localhost/api/mobile/v1/notifications/push-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA2}`,
        },
        body: JSON.stringify({
          token: sharedDeviceToken,
          platform: "android",
          deviceName: "Counter POS 1",
        }),
      }),
    );
    expect(regRes2.status).toBe(200);

    const rowUser1 = await db("mobile_push_tokens")
      .where({ user_id: userA1Id, token: sharedDeviceToken })
      .first("is_active");
    const rowUser2 = await db("mobile_push_tokens")
      .where({ user_id: userA2Id, token: sharedDeviceToken })
      .first("is_active");

    expect(Number(rowUser1?.is_active)).toBe(0);
    expect(Number(rowUser2?.is_active)).toBe(1);

    // Tenant B cannot deactivate Tenant A's token
    const crossDeleteRes = await pushTokenDelete(
      new Request("http://localhost/api/mobile/v1/notifications/push-token", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenB1}`,
        },
        body: JSON.stringify({ token: sharedDeviceToken }),
      }),
    );
    expect(crossDeleteRes.status).toBe(200);
    const crossDeleteBody = (await crossDeleteRes.json()) as {
      deactivatedCount: number;
    };
    expect(crossDeleteBody.deactivatedCount).toBe(0);

    // User A2 unregisters on sign-out
    const deleteRes = await pushTokenDelete(
      new Request("http://localhost/api/mobile/v1/notifications/push-token", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA2}`,
        },
        body: JSON.stringify({ token: sharedDeviceToken }),
      }),
    );
    expect(deleteRes.status).toBe(200);
    const deleteBody = (await deleteRes.json()) as {
      deactivatedCount: number;
    };
    expect(deleteBody.deactivatedCount).toBe(1);
  });

  it("dispatches pushes via transport, respects notification_push flag, and deactivates DeviceNotRegistered tokens", async () => {
    const activeToken = "ExponentPushToken[activeDispatchToken_101]";
    const deadToken = "ExponentPushToken[staleDispatchToken_202]";

    await pushTokenPost(
      new Request("http://localhost/api/mobile/v1/notifications/push-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA1}`,
        },
        body: JSON.stringify({ token: activeToken, platform: "ios" }),
      }),
    );
    await pushTokenPost(
      new Request("http://localhost/api/mobile/v1/notifications/push-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA2}`,
        },
        body: JSON.stringify({ token: deadToken, platform: "android" }),
      }),
    );

    const capturedBatches: Array<Array<{ to: string; title: string }>> = [];
    setExpoPushTransportForTests(async (messages) => {
      capturedBatches.push(
        messages.map((m) => ({ to: m.to, title: m.title })),
      );
      return {
        ok: true,
        status: 200,
        tickets: messages.map((m) =>
          m.to === deadToken
            ? { status: "error", details: { error: "DeviceNotRegistered" } }
            : { status: "ok" },
        ),
      };
    });

    await db("settings")
      .where({ tenant_id: tenantAId })
      .update({ notification_push: 1 });

    const result = await dispatchExpoPushNotifications({
      tenantId: tenantAId,
      items: [
        {
          userId: userA1Id,
          title: "Low Stock Alert",
          body: "Paracetamol dropped to 2 left.",
          data: { referenceType: "product", referenceId: "prd_1" },
        },
        {
          userId: userA2Id,
          title: "Low Stock Alert",
          body: "Paracetamol dropped to 2 left.",
          data: { referenceType: "product", referenceId: "prd_1" },
        },
      ],
    });

    expect(result.attempted).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.deactivatedTokens).toBe(1);
    expect(capturedBatches).toHaveLength(1);

    const staleRow = await db("mobile_push_tokens")
      .where({ user_id: userA2Id, token: deadToken })
      .first("is_active");
    expect(Number(staleRow?.is_active)).toBe(0);

    // When workspace disables notification_push, dispatch is skipped
    await db("settings")
      .where({ tenant_id: tenantAId })
      .update({ notification_push: 0 });

    const skipped = await dispatchExpoPushNotifications({
      tenantId: tenantAId,
      items: [{ userId: userA1Id, title: "Should Skip" }],
    });
    expect(skipped.skippedReason).toBe("push_disabled");
    expect(skipped.attempted).toBe(0);
  });

  it("normalizes and persists thermal_58mm, thermal_80mm, and a4 receipt formats", async () => {
    expect(normalizePaperSize("thermal_58mm")).toBe("thermal_58mm");
    expect(normalizePaperSize("thermal_80mm")).toBe("thermal_80mm");
    expect(normalizePaperSize("a4")).toBe("a4");
    expect(normalizePaperSize("unknown")).toBe("thermal_80mm");

    const patchRes = await businessSettingsPatch(
      new Request("http://localhost/api/mobile/v1/settings/business", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA1}`,
        },
        body: JSON.stringify({
          storeName: "Push Store A Updated",
          storeAddress: "Kumasi Central",
          taxRate: 0.05,
          printAfterSale: true,
          paperSize: "thermal_58mm",
        }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()) as {
      paperSize: string;
      printAfterSale: boolean;
    };
    expect(updated.paperSize).toBe("thermal_58mm");
    expect(updated.printAfterSale).toBe(true);
  });
});
