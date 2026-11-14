import { authenticateRequest, unauthorizedResponse } from "@/server/auth";
import { listProducts } from "@/server/queries";
import type { StockStatusFilter } from "@/types/domain";

export async function GET(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const stock = (url.searchParams.get("stock") as StockStatusFilter | null) ?? undefined;

  const products = listProducts(auth.db, {
    query,
    category,
    stockStatus: stock,
  });

  return Response.json(products);
}
