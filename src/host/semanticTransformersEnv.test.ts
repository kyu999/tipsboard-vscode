import { describe, expect, it } from "vitest";

import { applySemanticTransformersEnv, offlineSemanticModelHint } from "./semanticTransformersEnv.js";

describe("applySemanticTransformersEnv", () => {
  it("sets cacheDir and disables remote models for offline mode", () => {
    const env: Record<string, unknown> = { allowRemoteModels: true };
    applySemanticTransformersEnv(env, {
      cacheDir: "/cache/semantic-models",
      allowRemoteModels: false,
      localModelPath: "",
    });
    expect(env.cacheDir).toBe("/cache/semantic-models");
    expect(env.allowRemoteModels).toBe(false);
    expect(env.localModelPath).toBeUndefined();
  });

  it("sets localModelPath and allowLocalModels when provided", () => {
    const env: Record<string, unknown> = {};
    applySemanticTransformersEnv(env, {
      cacheDir: "/cache",
      allowRemoteModels: false,
      localModelPath: "/models",
    });
    expect(env.localModelPath).toBe("/models");
    expect(env.allowLocalModels).toBe(true);
  });
});

describe("offlineSemanticModelHint", () => {
  it("includes cache path and model id", () => {
    const hint = offlineSemanticModelHint("/data/cache", "Xenova/bge-m3");
    expect(hint).toContain("/data/cache");
    expect(hint).toContain("Xenova/bge-m3");
  });
});
