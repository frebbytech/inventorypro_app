import {
  authenticateRequest,
  jsonError,
  unauthorizedResponse,
} from "@/server/auth";
import { getProductDetail } from "@/server/queries";

export async function GET(
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

  const detail = getProductDetail(auth.db, productId);
  if (!detail) {
    return jsonError("Product not found.", 404);
  }

  return Response.json(detail);
}
