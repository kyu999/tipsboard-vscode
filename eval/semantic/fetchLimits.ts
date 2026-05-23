import type { SemanticEvalDataset, SemanticEvalDatasetId, SemanticEvalQuery } from "./datasets.js";

export interface SemanticEvalFetchLimits {
  maxDocuments?: number;
  maxQueries?: number;
}

/** Default HF fetch cap for large corpora (avoids ~100 sequential API pages). */
export const DEFAULT_MLDR_MAX_DOCUMENTS = 5000;

export function readSemanticEvalFetchLimits(datasetId: SemanticEvalDatasetId): SemanticEvalFetchLimits {
  if (process.env.TIPSBOARD_SEMANTIC_EVAL_FULL_DATASET === "1") {
    return {};
  }

  const maxDocuments = readOptionalPositiveInt("TIPSBOARD_SEMANTIC_EVAL_MAX_DOCS");
  const maxQueries = readOptionalPositiveInt("TIPSBOARD_SEMANTIC_EVAL_MAX_QUERIES");
  if (maxDocuments !== undefined || maxQueries !== undefined) {
    return { maxDocuments, maxQueries };
  }

  if (datasetId === "jmteb-lite-mldr") {
    return { maxDocuments: DEFAULT_MLDR_MAX_DOCUMENTS };
  }
  return {};
}

function readOptionalPositiveInt(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

/** True when an on-disk cache is large enough for the requested limits (smaller cache triggers re-fetch). */
export function cacheSatisfiesFetchLimits(
  dataset: Pick<SemanticEvalDataset, "documents" | "queries">,
  limits: SemanticEvalFetchLimits,
): boolean {
  if (limits.maxDocuments !== undefined && dataset.documents.length < limits.maxDocuments) {
    return false;
  }
  if (limits.maxQueries !== undefined && dataset.queries.length < limits.maxQueries) {
    return false;
  }
  return true;
}

/** Trim a dataset (typically loaded from cache) to match CLI/env fetch limits. */
export function applySemanticEvalFetchLimits(
  dataset: SemanticEvalDataset,
  limits: SemanticEvalFetchLimits,
): SemanticEvalDataset {
  let documents = dataset.documents;
  if (limits.maxDocuments !== undefined && documents.length > limits.maxDocuments) {
    documents = documents.slice(0, limits.maxDocuments);
  }

  const docIds = new Set(documents.map((doc) => doc.id));
  let queries = dataset.queries;
  if (limits.maxQueries !== undefined && queries.length > limits.maxQueries) {
    queries = queries.slice(0, limits.maxQueries);
  }
  queries = filterQueriesForDocumentSet(queries, docIds);

  return { ...dataset, documents, queries };
}

function filterQueriesForDocumentSet(queries: SemanticEvalQuery[], docIds: Set<string>): SemanticEvalQuery[] {
  return queries.filter((query) => {
    const relevantIds = Object.entries(query.relevant)
      .filter(([, score]) => score > 0)
      .map(([docId]) => docId);
    return relevantIds.length > 0 && relevantIds.every((docId) => docIds.has(docId));
  });
}
