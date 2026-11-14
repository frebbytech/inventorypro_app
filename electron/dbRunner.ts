// src/main/dbRunner.ts
import { app } from "electron";
import fs from "fs";
import path from "path";
import knex from "knex";
import config from "./knexFile.electron";

export async function initDatabase(): Promise<void> {
  const dbDir = path.dirname((config?.connection as any)?.filename);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = knex(config);

  db.raw("PRAGMA foreign_keys = ON").catch((err) => {
    console.error("Failed to enable foreign_keys pragma:", err);
  });

  const migrationsDir = app.isPackaged
    ? path.join(process.resourcesPath, "migrations")
    : path.join(__dirname, "migrations");

  try {
    console.log("Running pending migrations...");
    const completed = await db.migrate.list({ directory: migrationsDir });
    console.log("Migration status:", completed);

    const [batchNo, log] = await db.migrate.latest({
      directory: migrationsDir,
    });
    if (log.length === 0) {
      console.log("Database already up to date");
    } else {
      console.log(`Batch ${batchNo} ran: ${log.length} migrations`);
    }
  } catch (error) {
    console.error("Database migration failed:", error);
    throw error;
  }
}
