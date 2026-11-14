import {
  authenticateRequest,
  jsonError,
  unauthorizedResponse,
} from "@/server/auth";
import { getSaleReceipt } from "@/server/queries";

export async function GET(
  request: Request,
  params: Record<string, string>,
) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const saleId = params.id ? decodeURIComponent(params.id) : "";
  if (!saleId) {
    return jsonError("Sale ID is required.", 400);
  }

  const receipt = getSaleReceipt(auth.db, saleId);
  if (!receipt) {
    return jsonError("Receipt not found.", 404);
  }

  return Response.json(receipt);
}
