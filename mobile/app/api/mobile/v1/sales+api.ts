import {
  authenticateRequest,
  jsonError,
  unauthorizedResponse,
} from "@/server/auth";
import { createSale, listSales } from "@/server/queries";
import type { CreateSaleInput, PaymentMode } from "@/types/domain";

export async function GET(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? undefined;
  const paymentMode =
    (url.searchParams.get("paymentMode") as "all" | PaymentMode | null) ?? undefined;

  const sales = listSales(auth.db, { query, paymentMode });
  return Response.json(sales);
}

export async function POST(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  let body: CreateSaleInput;
  try {
    body = (await request.json()) as CreateSaleInput;
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  try {
    const receipt = createSale(auth.db, {
      ...body,
      userId: auth.user.id,
    });
    return Response.json(receipt, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to record sale";
    if (msg === "EMPTY_ITEMS") {
      return jsonError("Add at least one item to record a sale.", 400);
    }
    if (msg === "INVALID_ITEM_QUANTITY") {
      return jsonError("Each line item must have a positive quantity.", 400);
    }
    if (msg.startsWith("PRODUCT_NOT_FOUND:")) {
      return jsonError("One or more selected products were not found.", 404);
    }
    if (msg.startsWith("INSUFFICIENT_STOCK:")) {
      const [, name, available] = msg.split(":");
      return jsonError(
        `Insufficient stock for ${name} (available: ${available}).`,
        409,
      );
    }
    return jsonError(msg, 500);
  }
}
