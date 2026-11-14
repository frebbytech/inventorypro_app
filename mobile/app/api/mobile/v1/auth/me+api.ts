import { authenticateRequest, unauthorizedResponse } from "@/server/auth";
import { getStoreProfile } from "@/server/queries";

export async function GET(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const store = getStoreProfile(auth.db);
  return Response.json({
    user: auth.user,
    store,
  });
}
