import fs from "node:fs";
import path from "node:path";

const E2E_DIR = path.resolve(process.cwd(), "e2e");

export function cleanupE2EDatabaseFiles() {
  if (!fs.existsSync(E2E_DIR)) return;
  for (const entry of fs.readdirSync(E2E_DIR)) {
    if (entry.startsWith(".e2e_test.db")) {
      fs.rmSync(path.join(E2E_DIR, entry), { force: true });
    }
  }
}

export default async function globalSetup() {
  cleanupE2EDatabaseFiles();
}
