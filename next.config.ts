import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
    allowedDevOrigins: ['192.168.0.155','ais-dev-bu3qf3rlrnpndvycqxd7z2-304734861811.europe-west1.run.app'],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },
  serverExternalPackages: [
    "firebase-admin",
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
