import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["eval/semantic/prepareModelCache.test.ts"],
    // Model downloads can take a long time on release runners.
    hookTimeout: 0,
    testTimeout: 0,
  },
});
