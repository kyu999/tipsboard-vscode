import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(root, "webview/src"),
      "@tipsboard/shared": path.join(root, "src/shared"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "webview/src/**/*.test.ts"],
  },
});
