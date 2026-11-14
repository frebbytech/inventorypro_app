import {
  authenticateRequest,
  jsonError,
  unauthorizedResponse,
} from "@/server/auth";
import { findProductByBarcode } from "@/server/queries";

export async function GET(
  request: Request,
  params: Record<string, string>,
) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const code = params.code ? decodeURIComponent(params.code) : "";
  if (!code.trim()) {
    return jsonError("Barcode is required.", 400);
  }

  const product = findProductByBarcode(auth.db, code);
  if (!product) {
    return jsonError("No product matched that barcode.", 404);
  }

  return Response.json(product);
}
