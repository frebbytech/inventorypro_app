// import type { Knex } from "knex";
// import fs from "fs";
// import path from "path";

// const appData =
//   process.env.APPDATA ??
//   path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");

// const dataDir = path.join(appData, "InventoryPro");

// if (!fs.existsSync(dataDir)) {
//   fs.mkdirSync(dataDir, { recursive: true });
// }

// const dbPath = path.join(dataDir, "inventory_pro.db");

// const migrationDir =
//     process.env.NODE_ENV === "development"
//         ? path.join(process.cwd(), "electron", "migrations")
//         : path.join(process.resourcesPath ?? process.cwd(), "migrations"); 
// // const migrationDir = path.join(process.cwd(), "electron", "migrations");

// const config: Knex.Config = {
//   client: "sqlite3",
//   useNullAsDefault: true,
//   connection: {
//     filename: dbPath,

//   },

//   pool: {
//       min: 1,
//     max: 1, // Crucial for SQLite to prevent file-locking conflicts
//     acquireTimeoutMillis: 60000,
//     // Runs every time Knex opens a new connection to ensure stability
//     afterCreate: (conn: any, cb: (err: any, connection: any) => void) => {
//       conn.run("PRAGMA journal_mode=WAL;", (err: any) => {
//         if (err) return cb(err, conn);
//         conn.run("PRAGMA busy_timeout=5000;", (err2: any) => {
//           cb(err2, conn);
//         });
//       });
//     },
//   },

//   migrations: {
//     directory: migrationDir,
//   },
// };

// export default config;


import { Knex } from "knex";
import path from "path";
import Client_Libsql from "@libsql/knex-libsql";

export const resolveDatabasePath = (): string => {
  const rawUrl = process.env.DATABASE_URL || "";

  const authToken = process.env.DATABASE_AUTH_TOKEN || "";

  let finalUrl = rawUrl.trim();

  // If no custom URL/path is provided, default to local project SQLite/LibSQL database
  if (!finalUrl) {
    const localDbPath = path.resolve("./inventory_pro.db");
    return `file:${localDbPath}`;
  }

  // Check if it's already a valid protocol scheme
  const isProtocolUri =
    finalUrl.startsWith("libsql://") ||
    finalUrl.startsWith("https://") ||
    finalUrl.startsWith("http://") ||
    finalUrl.startsWith("wss://") ||
    finalUrl.startsWith("ws://") ||
    finalUrl.startsWith("file:") ||
    finalUrl === ":memory:";

  if (!isProtocolUri) {
    // Normalize relative or absolute system filesystem paths to file: URI
    const resolvedPath = path.resolve(finalUrl);
    finalUrl = `file:${resolvedPath}`;
  }

  // Inject authToken if provided and not already present in the connection string
  if (authToken && !finalUrl.includes("authToken=")) {
    const separator = finalUrl.includes("?") ? "&" : "?";
    finalUrl = `${finalUrl}${separator}authToken=${encodeURIComponent(authToken)}`;
  }

  return finalUrl;
};

// Helper function to recursively find and convert Date objects to strings
const formatDates = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;

  // Convert JS Date object to plain ISO string
  if (obj instanceof Date) return obj.toISOString();

  // If it's an array of database rows
  if (Array.isArray(obj)) return obj.map(formatDates);

  // If it's a single database row object
  if (typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, val]) => [key, formatDates(val)]),
    );
  }

  return obj;
};

const config: Knex.Config = {
  client: Client_Libsql as any,
  connection: {
    filename: resolveDatabasePath(),
  },
  useNullAsDefault: true,
  pool: {
    min: 1,
    max: 1,
    idleTimeoutMillis: 30000,
  },
  postProcessResponse: (result: any) => {
    return formatDates(result);
  },
};

export default config;
