import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, vi } from "vitest";

const tempDbPath = path.join(
  os.tmpdir(),
  `inventorypro-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
);

process.env.DATABASE_URL = tempDbPath;
process.env.DATABASE_AUTH_TOKEN = "";
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "inventorypro-vitest-secret-key-2026";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "inventorypro-vitest-enc-key-32bytes!";

const cookieJar = new Map<string, string>();

export function getTestCookieJar(): Map<string, string> {
  return cookieJar;
}

export function clearTestCookieJar(): void {
  cookieJar.clear();
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
    getAll: () =>
      Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
    has: (name: string) => cookieJar.has(name),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

beforeEach(() => {
  cookieJar.clear();
});

function removeTempDbFiles() {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const target = `${tempDbPath}${suffix}`;
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    } catch {
      // ignore cleanup errors on temp files
    }
  }
}

afterAll(async () => {
  try {
    const knexMod = await import("@/db/knex");
    await knexMod.default.destroy();
  } catch {
    // ignore if knex was not loaded in a pure unit test file
  }
  removeTempDbFiles();
});
