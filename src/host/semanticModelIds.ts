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

const DEPRECATED_SEMANTIC_MODEL_IDS = new Set<string>(["Xenova/paraphrase-multilingual-MiniLM-L12-v2"]);

export function normalizeSemanticModelId(raw: string): SemanticSearchModelId {
  const trimmed = raw.trim();
  if (!trimmed || DEPRECATED_SEMANTIC_MODEL_IDS.has(trimmed)) return DEFAULT_SEMANTIC_MODEL_ID;
  for (const id of SEMANTIC_SEARCH_MODEL_IDS) {
    if (id === trimmed) return id;
  }
  return DEFAULT_SEMANTIC_MODEL_ID;
}

export function semanticModelHubUrl(modelId: string): string {
  const normalized = normalizeSemanticModelId(modelId);
  return SEMANTIC_MODEL_HUB_URLS[normalized];
}
