import { NextResponse } from "next/server";
import db from "@/db/knex";
import { mapProductRow, withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ barcode: string }> },
) {
  const { barcode } = await context.params;
  return withMobileAuth(req, async ({ tenantId }) => {
    const clean = decodeURIComponent(barcode).trim();
    if (!clean) {
      return NextResponse.json({ error: "Barcode not found." }, { status: 404 });
    }

    const row = await db("v_product_catalog")
      .where("tenant_id", tenantId)
      .whereRaw("LOWER(barcode) = ?", [clean.toLowerCase()])
      .first();

    if (!row) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    return NextResponse.json(mapProductRow(row));
  });
}
