import { NextResponse } from "next/server";
import db from "@/db/knex";
import { withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(req, async ({ tenantId }) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

    const rows = await db("product_categories as pc")
      .leftJoin("products as p", function () {
        this.on("pc.id", "=", "p.category_id").andOn(
          "p.tenant_id",
          "=",
          "pc.tenant_id",
        );
      })
      .where("pc.tenant_id", tenantId)
      .groupBy(
        "pc.id",
        "pc.name",
        "pc.description",
        "pc.is_active",
        "pc.updated_at",
        "pc.created_at",
      )
      .select(
        "pc.id",
        "pc.name",
        "pc.description",
        "pc.is_active",
        "pc.updated_at",
        "pc.created_at",
        db.raw("COUNT(p.id) as product_count"),
        db.raw("COALESCE(SUM(p.stock_quantity), 0) as total_units"),
      )
      .orderBy("pc.name", "asc");

    const mapped = rows
      .filter((r: any) =>
        q
          ? String(r.name || "").toLowerCase().includes(q) ||
            String(r.description || "").toLowerCase().includes(q)
          : true,
      )
      .map((r: any) => ({
        id: String(r.id),
        name: String(r.name),
        description: String(r.description || ""),
        isActive: Boolean(Number(r.is_active ?? 1)),
        productCount: Number(r.product_count ?? 0),
        totalUnits: Number(r.total_units ?? 0),
        updatedAt: String(r.updated_at || r.created_at || new Date().toISOString()),
      }));

    return NextResponse.json(mapped);
  });
}
