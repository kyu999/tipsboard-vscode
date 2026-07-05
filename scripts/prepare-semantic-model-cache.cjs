#!/usr/bin/env node
/**
 * Build-environment only (needs Hugging Face Hub). Writes dist/semantic-model-cache/
 * for USB/deploy to closed networks. End users can disable Hub access and point
 * `modelCachePath` at this folder.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cacheOut = path.join(root, "dist", "semantic-model-cache");
const resolverBasePath = path.join(root, "dist", "extension", "extension.js");

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("[prepare-model-cache] Building extension with Transformers.js...");
run("node", ["scripts/build-extension.cjs"], {
  ...process.env,
  TIPSBOARD_BUNDLE_SEMANTIC: "1",
  TIPSBOARD_SKIP_SEMANTIC_COPY: "",
});

console.log("[prepare-model-cache] Downloading model weights (Hub access required on this machine)...");
run(
  "npx",
  ["vitest", "run", "--config", "vitest.semantic-prepare.config.mts"],
  {
    ...process.env,
    TIPSBOARD_SEMANTIC_MODEL_CACHE_OUT: cacheOut,
    TIPSBOARD_SEMANTIC_RESOLVER_BASE_PATH: resolverBasePath,
  },
);

console.log(`[prepare-model-cache] Deploy this folder to clients (modelCachePath): ${cacheOut}`);
