export interface SemanticRerankerCandidate {
  id: string;
  notes: string;
}

export const SEMANTIC_RERANKER_CANDIDATES: SemanticRerankerCandidate[] = [
  {
    id: "BAAI/bge-reranker-v2-m3",
    notes: "Strong multilingual reranker candidate, but local Transformers.js/ONNX compatibility must be validated before product use.",
  },
  {
    id: "cross-encoder/ms-marco-MiniLM-L-6-v2",
    notes: "Lightweight English-biased baseline for reranking experiments; not a good default for Japanese wiki search.",
  },
];

export function readSemanticEvalReranker(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value || value === "off") return undefined;
  return value;
}
