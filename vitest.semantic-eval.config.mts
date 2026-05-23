import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["eval/semantic/**/*.test.ts"],
    exclude: ["eval/semantic/prepareModelCache.test.ts"],
    // MLDR eval (5k docs + embedding + ~200 queries) often exceeds 10 minutes.
    hookTimeout: 0,
    testTimeout: 0,
  },
});
