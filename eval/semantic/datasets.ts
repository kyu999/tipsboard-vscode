export type SemanticEvalDatasetId = "jmteb-lite-mldr" | "beir-scifact";

export interface SemanticEvalDatasetDefinition {
  id: SemanticEvalDatasetId;
  name: string;
  sourceUrl: string;
  description: string;
}

export interface SemanticEvalDocument {
  id: string;
  title: string;
  text: string;
}

export interface SemanticEvalQuery {
  id: string;
  text: string;
  relevant: Record<string, number>;
}

export interface SemanticEvalDataset {
  definition: SemanticEvalDatasetDefinition;
  documents: SemanticEvalDocument[];
  queries: SemanticEvalQuery[];
}

export const SEMANTIC_EVAL_DATASETS: Record<SemanticEvalDatasetId, SemanticEvalDatasetDefinition> = {
  "jmteb-lite-mldr": {
    id: "jmteb-lite-mldr",
    name: "JMTEB-lite MLDR-Retrieval",
    sourceUrl: "https://huggingface.co/datasets/sbintuitions/JMTEB-lite",
    description: "Japanese long-document retrieval dataset (10,000 corpus docs; eval fetch defaults to 5,000 for HF API stability).",
  },
  "beir-scifact": {
    id: "beir-scifact",
    name: "BEIR SciFact",
    sourceUrl: "https://huggingface.co/datasets/BeIR/scifact",
    description: "Small English scientific claim retrieval dataset using the BEIR corpus/query/qrels layout.",
  },
};

export function readSemanticEvalDatasetId(raw: string | undefined): SemanticEvalDatasetId {
  if (!raw) return "jmteb-lite-mldr";
  if (raw === "jmteb-lite-mldr" || raw === "beir-scifact") return raw;
  const allowed = Object.keys(SEMANTIC_EVAL_DATASETS).join(", ");
  throw new Error(`Unknown semantic eval dataset "${raw}". Expected one of: ${allowed}`);
}
