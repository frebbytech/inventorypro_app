import { authenticateRequest, unauthorizedResponse } from "@/server/auth";
import { listCategories } from "@/server/queries";

export async function GET(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const categories = listCategories(auth.db);
  return Response.json(categories);
}
