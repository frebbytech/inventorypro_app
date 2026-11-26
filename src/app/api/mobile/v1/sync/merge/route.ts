import { NextResponse } from "next/server";
import db from "@/db/knex";
import {
  insertSyncEvent,
  publishSyncEvent,
  runWithIdempotency,
  type SyncEventRecord,
} from "@/lib/sync-bus";
import {
  extractClientMutationId,
  resolveDefaultSupplierIdForTenant,
  withMobileAuth,
} from "@/lib/mobile-api";
import { notifyAdminsOfMemberSale } from "@/lib/member-sale-alerts";
import { generateId } from "@/utils/generator";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId, clientMutationId }) => {
    const body = await req.json().catch(() => ({}));
    const mutationId = extractClientMutationId(req, body) || clientMutationId;

    const result = await runWithIdempotency({
      tenantId,
      clientMutationId: mutationId,
      endpoint: "POST:/api/mobile/v1/sync/merge",
      handler: async () => {
        const categoriesInput: any[] = Array.isArray(body.categories)
          ? body.categories
          : [];
        const customersInput: any[] = Array.isArray(body.customers)
          ? body.customers
          : [];
        const suppliersInput: any[] = Array.isArray(body.suppliers)
          ? body.suppliers
          : [];
        const productsInput: any[] = Array.isArray(body.products)
          ? body.products
          : [];
        const restocksInput: any[] = Array.isArray(body.restocks)
          ? body.restocks
          : [];
        const salesInput: any[] = Array.isArray(body.sales) ? body.sales : [];

        const eventsToPublish: SyncEventRecord[] = [];
        const mergedMemberSales: Array<{
          saleId: string;
          receiptNumber: string;
          totalAmount: number;
          itemCount: number;
          paymentMode: string;
          customerName: string;
        }> = [];
        const nowIso = new Date().toISOString();

        const counts = {
          categories: 0,
          customers: 0,
          suppliers: 0,
          products: 0,
          restocks: 0,
          sales: 0,
        };

        const trx = await db.transaction();
        try {
          const categoryMap = new Map<string, string>();
          const existingCats = await trx("product_categories")
            .where("tenant_id", tenantId)
            .select("id", "name");
          for (const c of existingCats) {
            categoryMap.set(String(c.id), String(c.id));
            categoryMap.set(`name:${String(c.name).trim().toLowerCase()}`, String(c.id));
          }

          for (const c of categoriesInput) {
            const name = String(c.name || "").trim();
            if (!name) continue;
            const byName = categoryMap.get(`name:${name.toLowerCase()}`);
            if (byName) {
              if (c.id) categoryMap.set(String(c.id), byName);
              continue;
            }
            const existingId =
              c.id && categoryMap.has(String(c.id))
                ? String(c.id)
                : generateId();
            await trx("product_categories").insert({
              id: existingId,
              tenant_id: tenantId,
              user_id: session.id,
              name,
              description: c.description ? String(c.description) : null,
              is_active: c.isActive === false ? 0 : 1,
              created_at: nowIso,
              updated_at: nowIso,
            });
            categoryMap.set(existingId, existingId);
            if (c.id) categoryMap.set(String(c.id), existingId);
            categoryMap.set(`name:${name.toLowerCase()}`, existingId);
            counts.categories += 1;
          }

          // Ensure fallback General category
          let generalCatId = categoryMap.get("name:general");
          if (!generalCatId) {
            generalCatId = generateId();
            await trx("product_categories").insert({
              id: generalCatId,
              tenant_id: tenantId,
              user_id: session.id,
              name: "General",
              description: "Default category",
              is_active: 1,
              created_at: nowIso,
              updated_at: nowIso,
            });
            categoryMap.set("name:general", generalCatId);
          }

          const customerMap = new Map<string, string>();
          const existingCustomers = await trx("customers")
            .where("tenant_id", tenantId)
            .select("id", "name", "phonenumber");
          for (const cust of existingCustomers) {
            customerMap.set(String(cust.id), String(cust.id));
            const key = `np:${String(cust.name).trim().toLowerCase()}|${String(cust.phonenumber || "").trim()}`;
            customerMap.set(key, String(cust.id));
          }

          for (const c of customersInput) {
            const name = String(c.name || "").trim();
            if (!name) continue;
            const phone = String(c.phonenumber || "").trim();
            const npKey = `np:${name.toLowerCase()}|${phone}`;
            const found =
              (c.id && customerMap.get(String(c.id))) || customerMap.get(npKey);
            if (found) {
              if (c.id) customerMap.set(String(c.id), found);
              continue;
            }
            const id = generateId();
            await trx("customers").insert({
              id,
              tenant_id: tenantId,
              user_id: session.id,
              name,
              email: c.email ? String(c.email).trim() : null,
              phonenumber: phone || null,
              address: c.address ? String(c.address).trim() : null,
              created_at: nowIso,
              updated_at: nowIso,
            });
            if (c.id) customerMap.set(String(c.id), id);
            customerMap.set(npKey, id);
            counts.customers += 1;
          }

          const supplierMap = new Map<string, string>();
          const existingSuppliers = await trx("suppliers")
            .where("tenant_id", tenantId)
            .select("id", "name", "company_name");
          for (const sup of existingSuppliers) {
            supplierMap.set(String(sup.id), String(sup.id));
            supplierMap.set(`name:${String(sup.name).trim().toLowerCase()}`, String(sup.id));
          }

          for (const s of suppliersInput) {
            const name = String(s.name || "").trim();
            if (!name) continue;
            const found =
              (s.id && supplierMap.get(String(s.id))) ||
              supplierMap.get(`name:${name.toLowerCase()}`);
            if (found) {
              if (s.id) supplierMap.set(String(s.id), found);
              continue;
            }
            const id = generateId();
            await trx("suppliers").insert({
              id,
              tenant_id: tenantId,
              user_id: session.id,
              name,
              company_name: s.companyName ? String(s.companyName).trim() : name,
              email: s.email ? String(s.email).trim() : null,
              phonenumber: s.phonenumber ? String(s.phonenumber).trim() : null,
              address: s.address ? String(s.address).trim() : null,
              is_active: s.isActive === false ? 0 : 1,
              created_at: nowIso,
              updated_at: nowIso,
            });
            if (s.id) supplierMap.set(String(s.id), id);
            supplierMap.set(`name:${name.toLowerCase()}`, id);
            counts.suppliers += 1;
          }

          const productMap = new Map<string, string>();
          const existingProducts = await trx("products")
            .where("tenant_id", tenantId)
            .select("id", "name", "barcode", "category_id");
          const productByBarcode = new Map<string, string>();
          const productByName = new Map<string, string>();
          const productCategoryById = new Map<string, string>();

          for (const p of existingProducts) {
            const pid = String(p.id);
            productMap.set(pid, pid);
            productCategoryById.set(pid, String(p.category_id));
            if (p.barcode && String(p.barcode).trim()) {
              productByBarcode.set(String(p.barcode).trim().toLowerCase(), pid);
            }
            productByName.set(String(p.name).trim().toLowerCase(), pid);
          }

          for (const p of productsInput) {
            const name = String(p.name || "").trim();
            if (!name) continue;
            const barcode = String(p.barcode || "").trim();
            const matchedId =
              (p.id && productMap.get(String(p.id))) ||
              (barcode ? productByBarcode.get(barcode.toLowerCase()) : undefined) ||
              productByName.get(name.toLowerCase());

            if (matchedId) {
              if (p.id) productMap.set(String(p.id), matchedId);
              continue;
            }

            const catNameKey = p.categoryName
              ? `name:${String(p.categoryName).trim().toLowerCase()}`
              : "";
            const resolvedCatId =
              (p.categoryId && categoryMap.get(String(p.categoryId))) ||
              (catNameKey && categoryMap.get(catNameKey)) ||
              generalCatId;

            const id = generateId();
            const qty = Math.max(0, Math.trunc(Number(p.stockQuantity ?? 0)));
            await trx("products").insert({
              id,
              tenant_id: tenantId,
              user_id: session.id,
              category_id: resolvedCatId,
              name,
              description: String(p.description || ""),
              barcode: barcode || "",
              photo_url: p.photoUrl ? String(p.photoUrl).trim() : null,
              cost_price: Math.max(0, Number(p.costPrice ?? 0)),
              unit_price: Math.max(0, Number(p.unitPrice ?? 0)),
              stock_quantity: qty,
              low_stock_threshold: Math.max(1, Math.trunc(Number(p.lowStockThreshold ?? 5))),
              version: 1,
              is_active: p.active === false ? 0 : 1,
              created_at: nowIso,
              updated_at: nowIso,
            });
            if (p.id) productMap.set(String(p.id), id);
            if (barcode) productByBarcode.set(barcode.toLowerCase(), id);
            productByName.set(name.toLowerCase(), id);
            productCategoryById.set(id, resolvedCatId);
            counts.products += 1;
          }

          const defaultSupplierId = await resolveDefaultSupplierIdForTenant(
            trx as any,
            tenantId,
            session.id,
          );

          for (const r of restocksInput) {
            const targetProductId =
              productMap.get(String(r.productId || "")) ||
              (r.productName
                ? productByName.get(String(r.productName).trim().toLowerCase())
                : undefined);
            const qty = Math.trunc(Number(r.quantity ?? 0));
            if (!targetProductId || qty <= 0) continue;
            const catId =
              productCategoryById.get(targetProductId) || generalCatId;

            await trx("inventory").insert({
              id: generateId(),
              tenant_id: tenantId,
              user_id: session.id,
              supplier_id: defaultSupplierId,
              product_category_id: catId,
              product_id: targetProductId,
              quantity: qty,
              restock_date: r.restockDate || nowIso.slice(0, 10),
              created_at: r.createdAt || nowIso,
              updated_at: nowIso,
            });
            counts.restocks += 1;
          }

          const existingReceipts = new Set(
            (
              await trx("sales")
                .where("tenant_id", tenantId)
                .select("receipt_number")
            ).map((row: any) => String(row.receipt_number || "")),
          );

          for (const s of salesInput) {
            const receiptNo = String(s.receiptNo || s.receipt_number || "").trim();
            if (receiptNo && existingReceipts.has(receiptNo)) continue;
            const items: any[] = Array.isArray(s.items) ? s.items : [];
            if (items.length === 0) continue;

            const custName = String(s.customerName || "Walk-in Customer").trim();
            const custPhone = String(s.customerPhone || "").trim();
            const custKey = `np:${custName.toLowerCase()}|${custPhone}`;
            let resolvedCustId =
              (s.customerId && customerMap.get(String(s.customerId))) ||
              customerMap.get(custKey);

            if (!resolvedCustId) {
              resolvedCustId = generateId();
              await trx("customers").insert({
                id: resolvedCustId,
                tenant_id: tenantId,
                user_id: session.id,
                name: custName,
                phonenumber: custPhone || null,
                created_at: nowIso,
                updated_at: nowIso,
              });
              customerMap.set(custKey, resolvedCustId);
            }

            const saleId = generateId();
            const isRefunded = s.status === "refunded";
            const detailsPayload = {
              subtotal: Number(s.subtotal ?? s.totalAmount ?? 0),
              taxRate: Number(s.taxRate ?? 0),
              taxAmount: Number(s.taxAmount ?? 0),
              discountAmount: Number(s.discountAmount ?? 0),
              amountPaid: Number(s.amountPaid ?? s.totalAmount ?? 0),
              notes: s.notes || "",
              refunded: isRefunded,
            };

            await trx("sales").insert({
              id: saleId,
              tenant_id: tenantId,
              customer_id: resolvedCustId,
              user_id: session.id,
              receipt_number: receiptNo || `MOB-${Date.now()}`,
              date: s.saleDate || nowIso,
              details: JSON.stringify(detailsPayload),
              total_amount: Math.max(0, Number(s.totalAmount ?? 0)),
              payment_mode: ["cash", "momo", "bank", "cheque"].includes(
                s.paymentMode,
              )
                ? s.paymentMode
                : "cash",
              status: isRefunded
                ? "failed"
                : s.status === "pending"
                  ? "pending"
                  : "completed",
              created_at: s.saleDate || nowIso,
              updated_at: nowIso,
            });
            if (receiptNo) existingReceipts.add(receiptNo);

            for (const it of items) {
              const prodId =
                productMap.get(String(it.productId || "")) ||
                (it.productName
                  ? productByName.get(String(it.productName).trim().toLowerCase())
                  : undefined);
              if (!prodId) continue;
              await trx("sale_items").insert({
                id: generateId(),
                tenant_id: tenantId,
                sales_id: saleId,
                product_id: prodId,
                quantity: Math.max(1, Math.trunc(Number(it.quantity ?? 1))),
                unit_price: Math.max(0, Number(it.unitPrice ?? 0)),
                created_at: s.saleDate || nowIso,
                updated_at: nowIso,
              });
            }
            if (!isRefunded) {
              mergedMemberSales.push({
                saleId,
                receiptNumber: receiptNo || `MOB-${Date.now()}`,
                totalAmount: Math.max(0, Number(s.totalAmount ?? 0)),
                itemCount: items.reduce(
                  (sum, it) => sum + Math.max(1, Math.trunc(Number(it.quantity ?? 1))),
                  0,
                ),
                paymentMode: ["cash", "momo", "bank", "cheque"].includes(
                  s.paymentMode,
                )
                  ? s.paymentMode
                  : "cash",
                customerName: custName,
              });
            }
            counts.sales += 1;
          }

          eventsToPublish.push(
            await insertSyncEvent(trx, {
              tenantId,
              entityType: "product",
              entityId: "merge",
              action: "refresh",
              payload: counts,
              actorUserId: session.id,
            }),
          );
          eventsToPublish.push(
            await insertSyncEvent(trx, {
              tenantId,
              entityType: "sale",
              entityId: "merge",
              action: "refresh",
              payload: counts,
              actorUserId: session.id,
            }),
          );

          await trx.commit();
        } catch (err) {
          await trx.rollback();
          throw err;
        }

        for (const evt of eventsToPublish) {
          publishSyncEvent(evt);
        }

        const memberFullname =
          [session.firstname, session.lastname]
            .filter(Boolean)
            .join(" ")
            .trim() || session.username;
        for (const ms of mergedMemberSales) {
          await notifyAdminsOfMemberSale({
            tenantId,
            saleId: ms.saleId,
            receiptNumber: ms.receiptNumber,
            totalAmount: ms.totalAmount,
            itemCount: ms.itemCount,
            paymentMode: ms.paymentMode,
            customerName: ms.customerName,
            member: {
              id: session.id,
              role: session.role,
              fullname: memberFullname,
              username: session.username,
            },
          });
        }

        const latestCursor =
          eventsToPublish[eventsToPublish.length - 1]?.cursor ?? 0;

        return {
          statusCode: 200,
          body: {
            ok: true,
            merged: counts,
            latestCursor,
          },
        };
      },
    });

    return NextResponse.json(result.body, { status: result.statusCode });
  });
}
