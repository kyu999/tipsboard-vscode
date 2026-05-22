import path from "node:path";
import * as vscode from "vscode";

export type SemanticProviderKind = "off" | "bundled";

export interface SemanticSettings {
  provider: SemanticProviderKind;
  modelId: string;
  importedPath: string;
  runtimeDownloadBaseUrl: string;
}

export const DEFAULT_SEMANTIC_MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
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
    modelId: config.get<string>("modelId", DEFAULT_SEMANTIC_MODEL_ID).trim() || DEFAULT_SEMANTIC_MODEL_ID,
    importedPath: normalizeOptionalAbsolutePath(config.get<string>("importedPath", "")),
    runtimeDownloadBaseUrl:
      config.get<string>("runtimeDownloadBaseUrl", DEFAULT_SEMANTIC_RUNTIME_DOWNLOAD_BASE_URL).trim() ||
      DEFAULT_SEMANTIC_RUNTIME_DOWNLOAD_BASE_URL,
  };
}

function normalizeOptionalAbsolutePath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return path.resolve(trimmed);
}
