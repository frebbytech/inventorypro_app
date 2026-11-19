import { NextResponse } from "next/server";
import {
  getTenantStoreProfile,
  mapSessionUserToMobile,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const store = await getTenantStoreProfile(tenantId, session);
    const mobileUser = mapSessionUserToMobile(session);
    return NextResponse.json({
      user: mobileUser,
      store,
      tenant: {
        id: mobileUser.tenantId,
        name: mobileUser.tenantName,
        slug: mobileUser.tenantSlug,
      },
    });
  });
}
