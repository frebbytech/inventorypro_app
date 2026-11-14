import {
  authenticateRequest,
  jsonError,
  unauthorizedResponse,
} from "@/server/auth";
import { adjustProductStock } from "@/server/queries";
import type { AdjustStockInput } from "@/types/domain";

export async function PATCH(
  request: Request,
  params: Record<string, string>,
) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const productId = params.id ? decodeURIComponent(params.id) : "";
  if (!productId) {
    return jsonError("Product ID is required.", 400);
  }

  let body: AdjustStockInput;
  try {
    body = (await request.json()) as AdjustStockInput;
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  try {
    const updated = adjustProductStock(auth.db, {
      productId,
      userId: auth.user.id,
      delta: body.delta,
      setQuantity: body.setQuantity,
      reason: body.reason,
    });
    return Response.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update stock";
    if (msg === "PRODUCT_NOT_FOUND") {
      return jsonError("Product not found.", 404);
    }
    if (msg === "NEGATIVE_STOCK") {
      return jsonError("Stock quantity cannot drop below zero.", 400);
    }
    if (msg === "INVALID_ADJUSTMENT") {
      return jsonError("Provide either delta or setQuantity.", 400);
    }
    return jsonError(msg, 500);
  }
}
