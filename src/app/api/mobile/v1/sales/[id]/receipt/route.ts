import { NextResponse } from "next/server";
import { getSaleReceiptDetailDto, withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withMobileAuth(req, async ({ session, tenantId }) => {
    const receipt = await getSaleReceiptDetailDto(tenantId, id, session);
    if (!receipt) {
      return NextResponse.json({ error: "Sale not found." }, { status: 404 });
    }
    return NextResponse.json(receipt);
  });
}
