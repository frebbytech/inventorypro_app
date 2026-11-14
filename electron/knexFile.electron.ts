// electron/knexfile.ts
import path from "path";
import type { Knex } from "knex";

function getDbPath(): string {
  try {
    // Only works when actually running inside Electron
    const { app } = require("electron");
    return path.join(app.getPath("userData"), "inventory_pro.db");
  } catch {
    // Fallback for Knex CLI / non-Electron context
    return path.join(__dirname, "inventory_pro.db");
  }
}

function isPackaged(): boolean {
  try {
    const { app } = require("electron");
    return app.isPackaged;
  } catch {
    return false;
  }
}



const config: Knex.Config = {
  client: "sqlite3",
  useNullAsDefault: true,
  connection: { filename: getDbPath() },
  pool: { min: 1, max: 1 },
  migrations: {
    directory: isPackaged()
      ? path.join(process.resourcesPath, "migrations")
      : path.join(__dirname, "migrations"),
    loadExtensions: [".js", ".ts"],
    extension: isPackaged() ? "js" : "ts",
  },
};

export default config;

// import type { Knex } from "knex";
// import path from "path";
// import { app } from "electron";

// const isProd = process.env.NODE_ENV === "production";
// const dbName = "test.sqlite3";
// /**
//  * Resolves the path to the local database file safely.
//  * - In Development: Writes to 'inventorypro.sqlite3' inside your working project folder.
//  * - In Production: Writes to 'C:\Users\username\AppData\Roaming\InventoryPro\inventorypro.sqlite3'
//  */
// const isPackaged = app ? app.isPackaged : isProd;

// const getDatabasePath = (): string => {
//   if (isProd) {
//     // Process env parameters or look up user AppData folder strings
//     const appDataFolder =
//       process.env.APPDATA ||
//       path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
//     return path.join(appDataFolder, "InventoryPro", dbName);
//   }
//   return path.resolve(`./${dbName}`);
// };

// const config: Knex.Config = {
//   client: "sqlite3",
//   connection: {
//     filename: getDatabasePath(),
//   } as Knex.Sqlite3ConnectionConfig,
//   useNullAsDefault: true,

//   // migrations: {
//   //   directory: isProd
//   //     ? path.join(__dirname, "migrations")
//   //     : path.resolve("./src/db/migrations"),
//   // },
//   migrations: {
//     directory: isPackaged
//       ? path.join(process.resourcesPath, "migrations")
//       : path.join(__dirname, "migrations"),
//   },
// };

// export default config;
