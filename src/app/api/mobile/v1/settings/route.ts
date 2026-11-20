import { NextResponse } from "next/server";
import { getTenantStoreProfile, withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const store = await getTenantStoreProfile(tenantId, session);
    return NextResponse.json(store);
  });
}
