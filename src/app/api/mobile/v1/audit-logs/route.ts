import { NextResponse } from "next/server";
import db from "@/db/knex";
import { withMobileAuth } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMobileAuth(
    req,
    async ({ tenantId }) => {
      const url = new URL(req.url);
      const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
      const action = url.searchParams.get("action")?.trim() || "all";
      const limit = Math.min(
        200,
        Math.max(1, Number(url.searchParams.get("limit") || 100)),
      );

      let query = db("audit_logs as al")
        .leftJoin("users as u", "al.user_id", "u.id")
        .where("al.tenant_id", tenantId)
        .select(
          "al.*",
          "u.username",
          "u.firstname",
          "u.lastname",
        )
        .orderBy("al.created_at", "desc")
        .limit(limit);

      if (action && action !== "all") {
        query = query.where("al.action", action);
      }

      const rows = await query;
      const mapped = rows
        .map((r: any) => {
          const fullName =
            `${r.firstname || ""} ${r.lastname || ""}`.trim() ||
            String(r.username || "System");
          return {
            id: String(r.id),
            userId: r.user_id ? String(r.user_id) : null,
            username: String(r.username || "system"),
            userFullName: fullName,
            entityType: String(r.entity_type || ""),
            entityId: String(r.entity_id || ""),
            action: String(r.action || ""),
            oldValues: r.old_values ? String(r.old_values) : null,
            newValues: r.new_values ? String(r.new_values) : null,
            createdAt: String(r.created_at || new Date().toISOString()),
          };
        })
        .filter((log) =>
          q
            ? log.entityType.toLowerCase().includes(q) ||
              log.action.toLowerCase().includes(q) ||
              log.userFullName.toLowerCase().includes(q) ||
              log.entityId.toLowerCase().includes(q)
            : true,
        );

      return NextResponse.json(mapped);
    },
    { requireAdmin: true },
  );
}
