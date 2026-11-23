import { beforeAll, describe, expect, it } from "vitest";
import {
  GET as mobileProductsGet,
  POST as mobileProductsPost,
} from "@/app/api/mobile/v1/products/route";
import {
  GET as mobileSalesGet,
  POST as mobileSalesPost,
} from "@/app/api/mobile/v1/sales/route";
import db from "@/db/knex";
import {
  createJWT,
  ensureAuthSchema,
  registerWorkspaceAccount,
} from "@/lib/auth";
import { ensureSecuritySchema } from "@/lib/security";
import { generateId } from "@/utils/generator";

describe("Tenant Isolation & Atomic POS Checkout", () => {
  let tokenA = "";
  let tokenB = "";
  let tenantAId = "";
  let tenantBId = "";

  beforeAll(async () => {
    await ensureAuthSchema();
    await ensureSecuritySchema();

    const suffix = generateId("pos").slice(-8);
    const regA = await registerWorkspaceAccount({
      storeName: `Store Alpha ${suffix}`,
      slug: `alpha-${suffix}`,
      username: `alpha_${suffix}`,
      email: `alpha_${suffix}@example.com`,
      password: "Password123!",
    });
    const regB = await registerWorkspaceAccount({
      storeName: `Store Beta ${suffix}`,
      slug: `beta-${suffix}`,
      username: `beta_${suffix}`,
      email: `beta_${suffix}@example.com`,
      password: "Password123!",
    });

    tenantAId = regA.tenant.id;
    tenantBId = regB.tenant.id;

    tokenA = await createJWT({
      userId: regA.user.id,
      tenantId: tenantAId,
      tenantSlug: regA.tenant.slug,
      username: regA.user.username,
      role: "admin",
    });
    tokenB = await createJWT({
      userId: regB.user.id,
      tenantId: tenantBId,
      tenantSlug: regB.tenant.slug,
      username: regB.user.username,
      role: "admin",
    });
  });

  it("isolates catalog & sales strictly per tenant and enforces atomic stock + idempotent checkout", async () => {
    // Tenant A creates a product with 10 units
    const createProdRes = await mobileProductsPost(
      new Request("http://localhost/api/mobile/v1/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          name: "Amoxicillin 500mg",
          categoryName: "Pharmacy",
          costPrice: 12,
          unitPrice: 20,
          stockQuantity: 10,
          lowStockThreshold: 4,
          barcode: "8800112233",
        }),
      }),
    );
    expect(createProdRes.status).toBe(201);
    const prodA = (await createProdRes.json()) as {
      id: string;
      stockQuantity: number;
    };
    expect(prodA.stockQuantity).toBe(10);

    // Tenant B must not see Tenant A's product
    const listBRes = await mobileProductsGet(
      new Request("http://localhost/api/mobile/v1/products", {
        headers: { Authorization: `Bearer ${tokenB}` },
      }),
    );
    expect(listBRes.status).toBe(200);
    const listB = (await listBRes.json()) as Array<{ id: string }>;
    expect(listB.some((p) => p.id === prodA.id)).toBe(false);

    // Tenant B attempting to sell Tenant A's product must fail 404 without altering Tenant A stock
    const crossSaleRes = await mobileSalesPost(
      new Request("http://localhost/api/mobile/v1/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({
          items: [{ productId: prodA.id, quantity: 1 }],
          paymentMode: "cash",
        }),
      }),
    );
    expect(crossSaleRes.status).toBe(404);

    // Tenant A sells 3 units with an idempotency key
    const mutationId = generateId("sale_mut");
    const saleRes1 = await mobileSalesPost(
      new Request("http://localhost/api/mobile/v1/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
          "X-Client-Mutation-Id": mutationId,
        },
        body: JSON.stringify({
          customerName: "Ama Mensah",
          customerPhone: "+233201112233",
          items: [{ productId: prodA.id, quantity: 3 }],
          paymentMode: "momo",
          discountAmount: 5,
        }),
      }),
    );
    expect(saleRes1.status).toBe(201);
    const receipt1 = (await saleRes1.json()) as {
      id: string;
      totalAmount: number;
    };
    expect(receipt1.totalAmount).toBe(55); // (3 * 20) - 5

    // Replaying the exact same X-Client-Mutation-Id must return the original receipt without deducting stock again
    const saleResReplay = await mobileSalesPost(
      new Request("http://localhost/api/mobile/v1/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
          "X-Client-Mutation-Id": mutationId,
        },
        body: JSON.stringify({
          customerName: "Ama Mensah",
          items: [{ productId: prodA.id, quantity: 3 }],
          paymentMode: "momo",
          discountAmount: 5,
        }),
      }),
    );
    expect(saleResReplay.status).toBe(201);
    const receiptReplay = (await saleResReplay.json()) as { id: string };
    expect(receiptReplay.id).toBe(receipt1.id);

    const dbProdAfterReplay = await db("products")
      .where({ id: prodA.id, tenant_id: tenantAId })
      .first("stock_quantity");
    expect(Number(dbProdAfterReplay?.stock_quantity)).toBe(7);

    // Attempting to buy 8 units when 7 remain must fail 409 and preserve stock = 7
    const oversellRes = await mobileSalesPost(
      new Request("http://localhost/api/mobile/v1/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          items: [{ productId: prodA.id, quantity: 8 }],
          paymentMode: "cash",
        }),
      }),
    );
    expect(oversellRes.status).toBe(409);

    const dbProdAfterOversell = await db("products")
      .where({ id: prodA.id, tenant_id: tenantAId })
      .first("stock_quantity");
    expect(Number(dbProdAfterOversell?.stock_quantity)).toBe(7);

    // Sales list is strictly scoped per tenant
    const salesARes = await mobileSalesGet(
      new Request("http://localhost/api/mobile/v1/sales", {
        headers: { Authorization: `Bearer ${tokenA}` },
      }),
    );
    const salesBRes = await mobileSalesGet(
      new Request("http://localhost/api/mobile/v1/sales", {
        headers: { Authorization: `Bearer ${tokenB}` },
      }),
    );
    const salesA = (await salesARes.json()) as Array<{ id: string }>;
    const salesB = (await salesBRes.json()) as Array<{ id: string }>;
    expect(salesA.some((s) => s.id === receipt1.id)).toBe(true);
    expect(salesB).toHaveLength(0);
  });
});
