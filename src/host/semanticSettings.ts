import path from "node:path";
import * as vscode from "vscode";

export type SemanticProviderKind = "off" | "bundled";
export type SemanticSearchMode = "dense" | "hybrid";

export interface SemanticSettings {
  provider: SemanticProviderKind;
  modelId: string;
  mode: SemanticSearchMode;
  denseWeight: number;
  bm25Weight: number;
  importedPath: string;
  runtimeDownloadBaseUrl: string;
  /** When false, Transformers.js will not fetch models from Hugging Face Hub. */
  allowRemoteModels: boolean;
  /** Optional override for Transformers.js model cache directory. */
  modelCachePath: string;
}

export const SEMANTIC_SEARCH_MODEL_IDS = [
  "Xenova/multilingual-e5-base",
  "Xenova/bge-m3",
] as const;

export type SemanticSearchModelId = (typeof SEMANTIC_SEARCH_MODEL_IDS)[number];

export const DEFAULT_SEMANTIC_MODEL_ID: SemanticSearchModelId = "Xenova/multilingual-e5-base";

/** Public Hugging Face pages for manual model download (Transformers.js / ONNX). */
export const SEMANTIC_MODEL_HUB_URLS: Record<SemanticSearchModelId, string> = {
  "Xenova/multilingual-e5-base": "https://huggingface.co/Xenova/multilingual-e5-base",
  "Xenova/bge-m3": "https://huggingface.co/Xenova/bge-m3",
};

export function semanticModelHubUrl(modelId: string): string {
  const normalized = normalizeSemanticModelId(modelId);
  return SEMANTIC_MODEL_HUB_URLS[normalized];
}

const DEPRECATED_SEMANTIC_MODEL_IDS = new Set<string>(["Xenova/paraphrase-multilingual-MiniLM-L12-v2"]);

export function normalizeSemanticModelId(raw: string): SemanticSearchModelId {
  const trimmed = raw.trim();
  if (!trimmed || DEPRECATED_SEMANTIC_MODEL_IDS.has(trimmed)) return DEFAULT_SEMANTIC_MODEL_ID;
  for (const id of SEMANTIC_SEARCH_MODEL_IDS) {
    if (id === trimmed) return id;
  }
  return DEFAULT_SEMANTIC_MODEL_ID;
}
/** Default: download embedding models from Hugging Face Hub when missing locally. Set false for closed networks. */
export const DEFAULT_SEMANTIC_ALLOW_REMOTE_MODELS = true;
export const DEFAULT_SEMANTIC_RUNTIME_DOWNLOAD_BASE_URL =
  "https://github.com/kyu999/tipsboard-vscode/releases/latest/download";

export function semanticConfigurationPrefix(): string {
  return "tipsboard-vscode.semanticSearch";
}

export function readSemanticSettings(): SemanticSettings {
  const config = vscode.workspace.getConfiguration("tipsboard-vscode.semanticSearch");
  const providerRaw = config.get<string>("provider", "bundled");
  const provider: SemanticProviderKind = providerRaw === "bundled" ? "bundled" : "off";
  return {
    provider,
    modelId: normalizeSemanticModelId(config.get<string>("modelId", DEFAULT_SEMANTIC_MODEL_ID)),
    mode: readSemanticSearchMode(config.get<string>("mode", "hybrid")),
    denseWeight: readWeight(config.get<number>("denseWeight", 0.75), 0.75),
    bm25Weight: readWeight(config.get<number>("bm25Weight", 0.25), 0.25),
    importedPath: normalizeOptionalAbsolutePath(config.get<string>("importedPath", "")),
    runtimeDownloadBaseUrl:
      config.get<string>("runtimeDownloadBaseUrl", DEFAULT_SEMANTIC_RUNTIME_DOWNLOAD_BASE_URL).trim() ||
      DEFAULT_SEMANTIC_RUNTIME_DOWNLOAD_BASE_URL,
    allowRemoteModels: config.get<boolean>("allowRemoteModels", DEFAULT_SEMANTIC_ALLOW_REMOTE_MODELS),
    modelCachePath: normalizeOptionalAbsolutePath(config.get<string>("modelCachePath", "")),
  };
}

export function resolveSemanticModelCacheDir(settings: SemanticSettings, defaultCacheDir: string): string {
  return settings.modelCachePath || defaultCacheDir;
}

function readSemanticSearchMode(raw: string): SemanticSearchMode {
  return raw === "dense" ? "dense" : "hybrid";
}

function readWeight(raw: number, fallback: number): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.min(1, raw));
}

function normalizeOptionalAbsolutePath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return path.resolve(trimmed);
}
