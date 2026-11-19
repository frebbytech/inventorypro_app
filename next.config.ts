import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
    allowedDevOrigins: ['192.168.0.155','ais-dev-bu3qf3rlrnpndvycqxd7z2-304734861811.europe-west1.run.app'],
  serverExternalPackages: [
    "knex",
    "@libsql/knex-libsql",
    "@libsql/sqlite3",
    "@libsql/client",
    "@libsql/isomorphic-fetch",
    "@libsql/hrana-client",
    "node-fetch",
    "sqlite3",
    "better-sqlite3",
    "mysql2",
    "bcryptjs",
  ],
};

export default nextConfig;
