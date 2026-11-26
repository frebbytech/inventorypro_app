import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PATCH as notificationsSettingsPatch } from "@/app/api/mobile/v1/settings/notifications/route";
import { POST as mobileProductsPost } from "@/app/api/mobile/v1/products/route";
import { POST as mobileSalesPost } from "@/app/api/mobile/v1/sales/route";
import { POST as syncMergePost } from "@/app/api/mobile/v1/sync/merge/route";
import db from "@/db/knex";
import {
  createJWT,
  ensureAuthSchema,
  hashPassword,
  registerWorkspaceAccount,
} from "@/lib/auth";
import * as emailMod from "@/lib/email";
import { notifyAdminsOfMemberSale } from "@/lib/member-sale-alerts";
import { getTenantStoreProfile } from "@/lib/mobile-api";
import { setExpoPushTransportForTests } from "@/lib/pushNotifications";
import { ensureSecuritySchema } from "@/lib/security";
import * as smsMod from "@/lib/sms";
import { generateId } from "@/utils/generator";

describe("Member Sale Alerts Settings & Multi-Channel Admin Dispatch", () => {
  let tenantId = "";
  let tenantSlug = "";
  let adminId = "";
  let adminToken = "";
  let memberId = "";
  let memberToken = "";
  let productId = "";

  beforeAll(async () => {
    await ensureAuthSchema();
    await ensureSecuritySchema();

    const suffix = generateId("msa").slice(-8);
    const reg = await registerWorkspaceAccount({
      storeName: `Alert Shop ${suffix}`,
      slug: `alert-shop-${suffix}`,
      username: `admin_${suffix}`,
      email: `admin_${suffix}@example.com`,
      phonenumber: "+233244000111",
      password: "Password123!",
    });

    tenantId = reg.tenant.id;
    tenantSlug = reg.tenant.slug;
    adminId = reg.user.id;

    memberId = generateId("usr");
    const nowIso = new Date().toISOString();
    await db("users").insert({
      id: memberId,
      tenant_id: tenantId,
      username: `cashier_${suffix}`,
      email: `cashier_${suffix}@example.com`,
      firstname: "Kofi",
      lastname: "Cashier",
      phonenumber: "+233244000222",
      password_hash: await hashPassword("Password123!"),
      role: "member",
      created_at: nowIso,
      updated_at: nowIso,
    });

    adminToken = await createJWT({
      userId: adminId,
      tenantId,
      tenantSlug,
      username: reg.user.username,
      role: "admin",
    });

    memberToken = await createJWT({
      userId: memberId,
      tenantId,
      tenantSlug,
      username: `cashier_${suffix}`,
      role: "member",
    });

    const prodRes = await mobileProductsPost(
      new Request("http://localhost/api/mobile/v1/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Paracetamol 500mg Box",
          categoryName: "Pharmacy",
          costPrice: 10,
          unitPrice: 25,
          stockQuantity: 100,
          lowStockThreshold: 5,
        }),
      }),
    );
    expect(prodRes.status).toBe(201);
    const prod = (await prodRes.json()) as { id: string };
    productId = prod.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setExpoPushTransportForTests(null);
  });

  it("validates & persists memberSaleAlertEnabled and channels via notifications settings API", async () => {
    // Non-admin cannot change notification settings
    const memberDenied = await notificationsSettingsPatch(
      new Request("http://localhost/api/mobile/v1/settings/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          memberSaleAlertEnabled: true,
          memberSaleAlertChannels: ["in_app"],
        }),
      }),
    );
    expect(memberDenied.status).toBe(403);

    // Enabling with empty channels is rejected with 400
    const emptyChannelsRes = await notificationsSettingsPatch(
      new Request("http://localhost/api/mobile/v1/settings/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          memberSaleAlertEnabled: true,
          memberSaleAlertChannels: [],
        }),
      }),
    );
    expect(emptyChannelsRes.status).toBe(400);

    // Enabling with multiple channels persists cleanly
    const validRes = await notificationsSettingsPatch(
      new Request("http://localhost/api/mobile/v1/settings/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          memberSaleAlertEnabled: true,
          memberSaleAlertChannels: ["email", "sms", "in_app"],
        }),
      }),
    );
    expect(validRes.status).toBe(200);
    const body = (await validRes.json()) as {
      memberSaleAlertEnabled: boolean;
      memberSaleAlertChannels: string[];
    };
    expect(body.memberSaleAlertEnabled).toBe(true);
    expect(body.memberSaleAlertChannels).toEqual(["in_app", "email", "sms"]);

    const profile = await getTenantStoreProfile(tenantId);
    expect(profile.memberSaleAlertEnabled).toBe(true);
    expect(profile.memberSaleAlertChannels).toEqual(["in_app", "email", "sms"]);
  });

  it("respects toggle & selected channels, skips admin actors, and escapes HTML in email", async () => {
    const emailSpy = vi
      .spyOn(emailMod, "sendBulkEmail")
      .mockResolvedValue({ success: true, sentCount: 1, failedCount: 0, results: [] });
    const smsSpy = vi
      .spyOn(smsMod, "sendBulkSms")
      .mockResolvedValue({ success: true });

    // Disabled -> skips dispatch
    await db("settings")
      .where({ tenant_id: tenantId })
      .update({
        member_sale_alert_enabled: 0,
        member_sale_alert_channels: JSON.stringify(["in_app", "email", "sms"]),
      });

    const disabledRes = await notifyAdminsOfMemberSale({
      tenantId,
      saleId: "sale_disabled_1",
      receiptNumber: "RCP-001",
      totalAmount: 50,
      itemCount: 2,
      paymentMode: "cash",
      customerName: "Walk-in",
      member: { id: memberId, role: "member", fullname: "Kofi Cashier" },
    });
    expect(disabledRes.dispatched).toBe(false);
    expect(disabledRes.skippedReason).toBe("disabled");
    expect(emailSpy).not.toHaveBeenCalled();
    expect(smsSpy).not.toHaveBeenCalled();

    // Enabled for Email + SMS only, actor = admin -> skips
    await db("settings")
      .where({ tenant_id: tenantId })
      .update({
        member_sale_alert_enabled: 1,
        member_sale_alert_channels: JSON.stringify(["email", "sms"]),
      });

    const adminSkipRes = await notifyAdminsOfMemberSale({
      tenantId,
      saleId: "sale_admin_1",
      receiptNumber: "RCP-002",
      totalAmount: 50,
      itemCount: 1,
      paymentMode: "momo",
      customerName: "Ama",
      member: { id: adminId, role: "admin", fullname: "Admin User" },
    });
    expect(adminSkipRes.dispatched).toBe(false);
    expect(adminSkipRes.skippedReason).toBe("actor_is_admin");

    // Enabled for Email only with potentially unsafe customer string -> escapes HTML and skips SMS/in-app
    await db("settings")
      .where({ tenant_id: tenantId })
      .update({
        member_sale_alert_enabled: 1,
        member_sale_alert_channels: JSON.stringify(["email"]),
      });

    const beforeNotifs = await db("notifications")
      .where({ tenant_id: tenantId, user_id: adminId })
      .count("* as cnt")
      .first();

    const emailOnlyRes = await notifyAdminsOfMemberSale({
      tenantId,
      saleId: "sale_email_only",
      receiptNumber: "RCP-003",
      totalAmount: 75,
      itemCount: 3,
      paymentMode: "bank",
      customerName: "<script>alert(1)</script>",
      member: { id: memberId, role: "member", fullname: "Kofi <Team>" },
    });

    expect(emailOnlyRes.dispatched).toBe(true);
    expect(emailOnlyRes.inAppRecipients).toBe(0);
    expect(emailOnlyRes.smsSent).toBe(0);
    expect(emailOnlyRes.emailSent).toBe(1);
    expect(smsSpy).not.toHaveBeenCalled();
    expect(emailSpy).toHaveBeenCalledTimes(1);

    const [recipients, , content, opts] = emailSpy.mock.calls[0];
    expect(recipients.length).toBeGreaterThan(0);
    expect(content.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(content.html).not.toContain("<script>alert(1)</script>");
    expect(opts?.tenantId).toBe(tenantId);

    const afterNotifs = await db("notifications")
      .where({ tenant_id: tenantId, user_id: adminId })
      .count("* as cnt")
      .first();
    expect(Number(afterNotifs?.cnt)).toBe(Number(beforeNotifs?.cnt));
  });

  it("triggers selected admin alerts when a member makes a POS sale or offline sync merge, without blocking failures", async () => {
    await notificationsSettingsPatch(
      new Request("http://localhost/api/mobile/v1/settings/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          memberSaleAlertEnabled: true,
          memberSaleAlertChannels: ["in_app", "email", "sms"],
        }),
      }),
    );

    // Simulate SMS failure + Email success to confirm checkout stays non-blocking
    const emailSpy = vi
      .spyOn(emailMod, "sendBulkEmail")
      .mockResolvedValue({ success: true, sentCount: 1, failedCount: 0, results: [] });
    const smsSpy = vi
      .spyOn(smsMod, "sendBulkSms")
      .mockRejectedValue(new Error("Simulated SMS timeout"));

    // 1. Online mobile POS checkout by member
    const memberSaleRes = await mobileSalesPost(
      new Request("http://localhost/api/mobile/v1/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          customerName: "Yaw Customer",
          items: [{ productId, quantity: 2 }],
          paymentMode: "cash",
        }),
      }),
    );
    expect(memberSaleRes.status).toBe(201);
    const createdSale = (await memberSaleRes.json()) as { id: string };

    const adminNotif = await db("notifications")
      .where({
        tenant_id: tenantId,
        user_id: adminId,
        reference_type: "sale",
        reference_id: createdSale.id,
      })
      .first();
    expect(adminNotif).toBeTruthy();
    expect(adminNotif?.type).toBe("sale");
    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect(smsSpy).toHaveBeenCalledTimes(1);

    // Member who created the sale should NOT get a self-alert from member-sale-alerts
    const memberSelfAlert = await db("notifications")
      .where({
        tenant_id: tenantId,
        user_id: memberId,
        reference_type: "sale",
        reference_id: createdSale.id,
      })
      .first();
    expect(memberSelfAlert).toBeFalsy();

    // 2. Offline sync merge sale by member
    const mergeSaleId = generateId("sale");
    const mergeReceiptNo = `RCP-OFF-${mergeSaleId.slice(-5)}`;
    const mergeRes = await syncMergePost(
      new Request("http://localhost/api/mobile/v1/sync/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          categories: [],
          customers: [],
          suppliers: [],
          products: [],
          restocks: [],
          sales: [
            {
              id: mergeSaleId,
              receiptNo: mergeReceiptNo,
              customerName: "Offline Buyer",
              saleDate: new Date().toISOString(),
              subtotal: 25,
              taxRate: 0,
              taxAmount: 0,
              discountAmount: 0,
              totalAmount: 25,
              amountPaid: 25,
              paymentMode: "momo",
              status: "completed",
              items: [
                {
                  productId,
                  productName: "Paracetamol 500mg Box",
                  quantity: 1,
                  unitPrice: 25,
                },
              ],
            },
          ],
        }),
      }),
    );
    expect(mergeRes.status).toBe(200);

    const mergedSaleRow = await db("sales")
      .where({ tenant_id: tenantId, receipt_number: mergeReceiptNo })
      .first("id");
    expect(mergedSaleRow?.id).toBeTruthy();

    const mergeAdminNotif = await db("notifications")
      .where({
        tenant_id: tenantId,
        user_id: adminId,
        reference_type: "sale",
        reference_id: mergedSaleRow!.id,
      })
      .first();
    expect(mergeAdminNotif).toBeTruthy();
    expect(emailSpy).toHaveBeenCalledTimes(2);
    expect(smsSpy).toHaveBeenCalledTimes(2);
  });
});
