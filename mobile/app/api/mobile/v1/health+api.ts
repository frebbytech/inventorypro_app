import { getDb } from "@/server/db";

export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT 1 AS ok").get() as { ok: number };
    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM products) AS products,
          (SELECT COUNT(*) FROM sales) AS sales,
          (SELECT COUNT(*) FROM users) AS users`,
      )
      .get() as { products: number; sales: number; users: number };

    return Response.json({
      ok: row?.ok === 1,
      engine: "better-sqlite3",
      counts,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SQLite health check failed";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
