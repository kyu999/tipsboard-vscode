import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(root, "webview/src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["eval/performance/**/*.test.ts"],
    hookTimeout: 0,
    testTimeout: 0,
  },
});
