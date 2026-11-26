import { NextResponse } from "next/server";
import { getRecipientsForGroup } from "@/actions/messages";
import { sanitizeServerMessage, withMobileAuth } from "@/lib/mobile-api";
import type { RecipientGroup } from "@/types/globals";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(
    req,
    async () => {
      const url = new URL(req.url);
      const groupParam = url.searchParams.get("group") || "employees";
      const group = (
        ["employees", "customers", "suppliers"].includes(groupParam)
          ? groupParam
          : "employees"
      ) as RecipientGroup;

      const res = await getRecipientsForGroup(group);
      if (!res.success || !res.data) {
        return NextResponse.json(
          {
            error: sanitizeServerMessage(
              res.message,
              "Unable to load message recipients right now.",
            ),
          },
          { status: 400 },
        );
      }

      return NextResponse.json(
        res.data.map((r: any) => ({
          id: String(r.id),
          name: String(r.name),
          email: r.email ?? null,
          phonenumber: r.phonenumber ?? null,
          subtitle: r.company_name || r.role || null,
          hasValidEmail: Boolean(r.hasValidEmail),
          hasValidPhone: Boolean(r.hasValidPhone),
          canReceiveInApp: Boolean(r.canReceiveInApp),
        })),
      );
    },
    { requireAdmin: true },
  );
}
