import { promises as fs } from "node:fs";
import path from "node:path";

import {
  SEMANTIC_SEARCH_MODEL_IDS,
  type SemanticSearchModelId,
} from "./semanticModelIds.js";
import { semanticRuntimeTarget } from "./semanticPlatform.js";

export const SEMANTIC_OFFLINE_PACK_KIND = "tipsboard-semantic-offline-pack";
export const SEMANTIC_OFFLINE_RUNTIME_DIR = "runtime";
export const SEMANTIC_OFFLINE_MODEL_CACHE_DIR = "semantic-model-cache";

export interface SemanticOfflinePackManifest {
  schemaVersion: number;
  kind?: string;
  packVersion?: string;
  target?: string;
  runtimeVersion?: string;
  bundledModelIds?: string[];
  transformersVersion?: string;
  createdAt?: string;
}

export function parseSemanticOfflinePackManifest(raw: string): SemanticOfflinePackManifest {
  return JSON.parse(raw) as SemanticOfflinePackManifest;
}

export function validateSemanticOfflinePackManifest(
  manifest: SemanticOfflinePackManifest,
  target: string = semanticRuntimeTarget(),
): void {
  if (manifest.schemaVersion !== 1) {
    throw new Error("Semantic offline pack manifest has an unsupported schema version.");
  }
  if (manifest.kind !== SEMANTIC_OFFLINE_PACK_KIND) {
    throw new Error("Selected file is not a Tipsboard semantic offline pack.");
  }
  if (manifest.target && manifest.target !== target) {
    throw new Error(`Semantic offline pack target mismatch: expected ${target}, got ${manifest.target}.`);
  }
}

export function normalizeBundledModelIds(raw: string[] | undefined): SemanticSearchModelId[] {
  const ids = (raw?.length ? raw : [...SEMANTIC_SEARCH_MODEL_IDS]).filter((id): id is SemanticSearchModelId =>
    SEMANTIC_SEARCH_MODEL_IDS.includes(id as SemanticSearchModelId),
  );
  if (ids.length === 0) {
    throw new Error("Semantic offline pack does not include any supported embedding models.");
  }
  return ids;
}

export async function validateSemanticOfflinePackLayout(packRoot: string): Promise<SemanticOfflinePackManifest> {
  const manifest = parseSemanticOfflinePackManifest(
    await fs.readFile(path.join(packRoot, "manifest.json"), "utf8"),
  );
  validateSemanticOfflinePackManifest(manifest);

  const runtimeDir = path.join(packRoot, SEMANTIC_OFFLINE_RUNTIME_DIR);
  const modelCacheDir = path.join(packRoot, SEMANTIC_OFFLINE_MODEL_CACHE_DIR);
  await fs.access(path.join(runtimeDir, "manifest.json"));
  await fs.access(
    path.join(runtimeDir, "node_modules", "@huggingface", "transformers", "package.json"),
  );
  await fs.access(path.join(runtimeDir, "node_modules", "onnxruntime-node", "package.json"));
  await fs.access(path.join(modelCacheDir, "Xenova"));

  const bundledModelIds = normalizeBundledModelIds(manifest.bundledModelIds);
  for (const modelId of bundledModelIds) {
    const [, repoName] = modelId.split("/");
    if (!repoName) {
      throw new Error(`Invalid bundled model id in offline pack manifest: ${modelId}`);
    }
    await fs.access(path.join(modelCacheDir, "Xenova", repoName, "config.json"));
  }

  return { ...manifest, bundledModelIds };
}

export async function findSemanticOfflinePackRoot(root: string, depth: number = 3): Promise<string | undefined> {
  const manifestPath = path.join(root, "manifest.json");
  if (await fileExists(manifestPath)) {
    try {
      const manifest = parseSemanticOfflinePackManifest(await fs.readFile(manifestPath, "utf8"));
      if (manifest.kind === SEMANTIC_OFFLINE_PACK_KIND) {
        return root;
      }
    } catch {
      // continue searching nested folders
    }
  }
  if (depth <= 0) return undefined;

  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "__MACOSX") continue;
    const found = await findSemanticOfflinePackRoot(path.join(root, entry.name), depth - 1);
    if (found) return found;
  }
  return undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
