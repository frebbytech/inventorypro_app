import { cleanupE2EDatabaseFiles } from "./global-setup";

export default async function globalTeardown() {
  cleanupE2EDatabaseFiles();
}
