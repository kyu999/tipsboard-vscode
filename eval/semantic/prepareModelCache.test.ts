import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createTransformersEmbeddingProvider } from "../../src/host/semantic.js";
import { SEMANTIC_SEARCH_MODEL_IDS } from "../../src/host/semanticSettings.js";

/**
 * Build-time helper (not CI): warms Transformers.js model cache for closed-network deployment.
 * Requires network on the machine running this script.
 */
describe("prepare semantic model cache for deployment", () => {
  it("downloads embedding weights into dist/semantic-model-cache", { timeout: 0 }, async () => {
      const root = process.cwd();
      const cacheDir =
        process.env.TIPSBOARD_SEMANTIC_MODEL_CACHE_OUT?.trim() ||
        path.join(root, "dist", "semantic-model-cache");
      const resolverBasePath =
        process.env.TIPSBOARD_SEMANTIC_RESOLVER_BASE_PATH?.trim() ||
        path.join(root, "dist", "extension", "extension.js");
      const modelIds = (process.env.TIPSBOARD_SEMANTIC_MODEL_IDS ?? SEMANTIC_SEARCH_MODEL_IDS.join(","))
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      await fs.mkdir(cacheDir, { recursive: true });

      for (const modelId of modelIds) {
        console.log(`[prepare-model-cache] warming ${modelId}`);
        const provider = createTransformersEmbeddingProvider({
          cacheDir,
          resolverBasePath,
          modelId,
          allowRemoteModels: true,
        });
        const [vector] = await provider.embed(["cache warmup"]);
        expect(vector.length).toBeGreaterThan(0);
      }

      console.log(`[prepare-model-cache] done: ${cacheDir}`);
  });
});
