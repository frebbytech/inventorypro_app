import { NextResponse } from "next/server";
import {
  getTenantStoreProfile,
  getUserTwoFactorFlags,
  mapSessionUserToMobile,
  withMobileAuth,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const [store, twoFactor] = await Promise.all([
      getTenantStoreProfile(tenantId, session),
      getUserTwoFactorFlags(session.id),
    ]);
    const mobileUser = mapSessionUserToMobile(session, twoFactor);
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
