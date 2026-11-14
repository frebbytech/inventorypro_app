import { authenticateRequest, unauthorizedResponse } from "@/server/auth";
import { getTodayDashboard } from "@/server/queries";

export async function GET(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const data = getTodayDashboard(auth.db);
  return Response.json(data);
}
