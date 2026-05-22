import { promises as fs } from "node:fs";
import path from "node:path";

import { createTransformersEmbeddingProvider, type EmbeddingProvider } from "./semantic.js";
import { ensureSemanticRuntime } from "./semanticRuntime.js";
import { readSemanticSettings } from "./semanticSettings.js";

const providerCache = new Map<string, EmbeddingProvider>();

export function clearSemanticProviderCache(): void {
  providerCache.clear();
}

export async function createSemanticProviderForExtension(options: {
  cacheDir: string;
  extensionPath: string;
  extensionVersion: string;
  globalStoragePath: string;
}): Promise<EmbeddingProvider> {
  const settings = readSemanticSettings();
  if (settings.provider === "off") {
    throw new Error("Semantic search is disabled. Enable Tipsboard: Semantic Search Provider in settings.");
  }

  const resolverBasePath = settings.importedPath
    ? await semanticPackResolverBasePath(settings.importedPath)
    : await semanticRuntimeResolverBasePath(options, settings.runtimeDownloadBaseUrl);

  const cacheKey = `${resolverBasePath}\0${options.cacheDir}\0${settings.modelId}`;
  let provider = providerCache.get(cacheKey);
  if (!provider) {
    provider = createTransformersEmbeddingProvider(options.cacheDir, resolverBasePath, settings.modelId);
    providerCache.set(cacheKey, provider);
  }
  return provider;
}

async function bundledResolverBasePath(extensionPath: string): Promise<string> {
  const entryPath = path.join(extensionPath, "dist", "extension", "extension.js");
  const transformersPath = path.join(
    extensionPath,
    "dist",
    "extension",
    "node_modules",
    "@huggingface",
    "transformers",
    "package.json",
  );
  try {
    await fs.access(transformersPath);
  } catch {
    throw new Error(
      "Semantic search runtime is not included in this VSIX. Use a bundled build, or set Tipsboard: Semantic Search Imported Path to a prepared semantic pack.",
    );
  }
  return entryPath;
}

async function semanticRuntimeResolverBasePath(
  options: {
    extensionPath: string;
    extensionVersion: string;
    globalStoragePath: string;
  },
  runtimeDownloadBaseUrl: string,
): Promise<string> {
  try {
    return await bundledResolverBasePath(options.extensionPath);
  } catch {
    return ensureSemanticRuntime({
      extensionVersion: options.extensionVersion,
      globalStoragePath: options.globalStoragePath,
      runtimeDownloadBaseUrl,
    });
  }
}

async function semanticPackResolverBasePath(importedPath: string): Promise<string> {
  const manifestPath = path.join(importedPath, "manifest.json");
  const transformersPath = path.join(importedPath, "node_modules", "@huggingface", "transformers", "package.json");
  try {
    await fs.access(manifestPath);
    await fs.access(transformersPath);
  } catch {
    throw new Error(
      "Semantic search imported path is invalid. Select a folder containing manifest.json and node_modules/@huggingface/transformers.",
    );
  }
  return manifestPath;
}
