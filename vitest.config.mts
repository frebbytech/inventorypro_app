import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(
        import.meta.dirname,
        "tests/mocks/server-only.ts",
      ),
      "expo-constants": path.resolve(
        import.meta.dirname,
        "tests/mocks/expo-constants.ts",
      ),
      "react-native": path.resolve(
        import.meta.dirname,
        "tests/mocks/react-native.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
