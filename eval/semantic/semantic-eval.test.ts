import path from "node:path";
import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { createTransformersEmbeddingProvider, rebuildSemanticIndex, semanticSearch } from "../../src/host/semantic.js";
import { readSemanticEvalDatasetId, type SemanticEvalQuery } from "./datasets.js";
import { createProgressReporter, logSemanticEvalProgress } from "./progress.js";
import {
  type SemanticEvalMetricSummary,
  type SemanticEvalQueryResult,
  writeSemanticEvalReport,
} from "./report.js";
import { readSemanticEvalReranker } from "./reranker.js";
import { seedSemanticEvalVault } from "./seedVault.js";

interface QueryEvaluation extends SemanticEvalQueryResult {}

const TOP_K = readPositiveInteger("TIPSBOARD_SEMANTIC_EVAL_TOP_K", 10);

describe("semantic search evaluation", () => {
  it(
    "retrieves public dataset qrels from a seeded Tipsboard vault",
    async () => {
    const root = process.cwd();
    const datasetId = readSemanticEvalDatasetId(process.env.TIPSBOARD_SEMANTIC_EVAL_DATASET);
    const cacheDir = path.join(root, "eval", ".cache");
    const modelId = process.env.TIPSBOARD_SEMANTIC_EVAL_MODEL_ID;
    const searchMode = readSearchMode(process.env.TIPSBOARD_SEMANTIC_EVAL_MODE);
    const denseWeight = readNumber("TIPSBOARD_SEMANTIC_EVAL_DENSE_WEIGHT", 0.75);
    const bm25Weight = readNumber("TIPSBOARD_SEMANTIC_EVAL_BM25_WEIGHT", 0.25);
    const reranker = readSemanticEvalReranker(process.env.TIPSBOARD_SEMANTIC_EVAL_RERANKER);
    const resolverBasePath = process.env.TIPSBOARD_SEMANTIC_EVAL_RESOLVER_BASE_PATH || path.join(root, "package.json");
    const modelCacheDir =
      process.env.TIPSBOARD_SEMANTIC_EVAL_MODEL_CACHE_DIR?.trim() || path.join(cacheDir, "models");
    const provider = createTransformersEmbeddingProvider({
      cacheDir: modelCacheDir,
      resolverBasePath,
      modelId,
      allowRemoteModels: process.env.TIPSBOARD_SEMANTIC_EVAL_ALLOW_REMOTE_MODELS !== "0",
    });

    logSemanticEvalProgress(`Starting evaluation: dataset=${datasetId}, mode=${searchMode}, topK=${TOP_K}`);
    logSemanticEvalProgress(
      "This run has no Vitest timeout; MLDR with thousands of documents can take well over an hour on CPU.",
    );
    if (reranker) {
      logSemanticEvalProgress(`External reranker spike requested (${reranker}), but only built-in heuristic reranking is enabled in the product path`);
    }
    const seeded = await seedSemanticEvalVault({ datasetId, cacheDir });
    try {
      logSemanticEvalProgress(`Building semantic index for ${seeded.documentCount} documents`);
      logSemanticEvalProgress("Loading embedding model and embedding index chunks; first batch can take longer if the model cache is cold");
      let indexProgress: ReturnType<typeof createProgressReporter> | undefined;
      const indexStarted = performance.now();
      const manifest = await rebuildSemanticIndex(seeded.vaultPath, provider, {
        onEmbeddingProgress: (progress) => {
          indexProgress ??= createProgressReporter({
            label: "embed index chunks",
            total: progress.total,
            minIntervalMs: 500,
          });
          indexProgress.update(progress.completed, "chunks");
        },
      });
      const indexBuildMs = performance.now() - indexStarted;
      indexProgress?.done("done");
      logSemanticEvalProgress(`Built semantic index: ${manifest.chunkCount} chunks in ${formatMs(indexBuildMs)}`);

      const evaluations: QueryEvaluation[] = [];
      const progress = createProgressReporter({
        label: "evaluate queries",
        total: seeded.queries.length,
        minIntervalMs: 500,
      });
      for (const [index, query] of seeded.queries.entries()) {
        const queryStarted = performance.now();
        const response = await semanticSearch(seeded.vaultPath, query.text, provider, {
          limit: TOP_K,
          mode: searchMode,
          denseWeight,
          bm25Weight,
        });
        const latencyMs = performance.now() - queryStarted;
        const rankedDocIds = rankedDocIdsFromPaths(response.results.map((result) => result.path), seeded.docIdByPath);
        evaluations.push(evaluateQuery(query, rankedDocIds, latencyMs));
        const partial = summarizeEvaluations(evaluations);
        progress.update(
          index + 1,
          `nDCG@${TOP_K}=${partial.ndcgAtK.toFixed(4)} Recall@${TOP_K}=${partial.recallAtK.toFixed(4)} MRR@${TOP_K}=${partial.mrrAtK.toFixed(4)} p95=${formatMs(partial.p95QueryLatencyMs)}`,
        );
      }
      progress.done("done");

      const summary = summarizeEvaluations(evaluations);
      const { reportPath, latestPath } = await writeSemanticEvalReport(path.join(cacheDir, "reports"), {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        datasetId,
        datasetName: seeded.datasetName,
        modelId: provider.modelId,
        topK: TOP_K,
        searchMode,
        denseWeight,
        bm25Weight,
        reranker,
        documentCount: seeded.documentCount,
        queryCount: seeded.queryCount,
        indexedChunkCount: manifest.chunkCount,
        indexBuildMs,
        vaultPath: seeded.vaultPath,
        summary,
        queries: evaluations,
      });
      printReport({
        datasetName: seeded.datasetName,
        modelId: provider.modelId,
        searchMode,
        reranker,
        vaultPath: seeded.vaultPath,
        documentCount: seeded.documentCount,
        queryCount: seeded.queryCount,
        indexedChunkCount: manifest.chunkCount,
        indexBuildMs,
        summary,
        reportPath,
        latestPath,
      });

      expect(seeded.documentCount).toBeGreaterThan(0);
      expect(seeded.queryCount).toBeGreaterThan(0);
      expect(manifest.chunkCount).toBeGreaterThan(0);
      expect(summary.ndcgAtK).toBeGreaterThanOrEqual(readNumber("TIPSBOARD_SEMANTIC_EVAL_MIN_NDCG10", 0));
      expect(summary.recallAtK).toBeGreaterThanOrEqual(readNumber("TIPSBOARD_SEMANTIC_EVAL_MIN_RECALL10", 0));
      expect(summary.mrrAtK).toBeGreaterThanOrEqual(readNumber("TIPSBOARD_SEMANTIC_EVAL_MIN_MRR10", 0));
    } finally {
      await seeded.cleanup();
    }
    },
    { timeout: 0 },
  );
});

function evaluateQuery(query: SemanticEvalQuery, rankedDocIds: string[], latencyMs: number): QueryEvaluation {
  const relevantDocs = Object.entries(query.relevant).filter(([, score]) => score > 0);
  const relevantSet = new Set(relevantDocs.map(([docId]) => docId));
  const limited = rankedDocIds.slice(0, TOP_K);
  const retrievedRelevant = limited.filter((docId) => relevantSet.has(docId));

  return {
    id: query.id,
    text: query.text,
    relevantDocIds: relevantDocs.map(([docId]) => docId),
    rankedDocIds: limited,
    ndcg: dcg(limited.map((docId) => query.relevant[docId] ?? 0)) / idealDcg(relevantDocs.map(([, score]) => score), TOP_K),
    recall: relevantDocs.length === 0 ? 0 : retrievedRelevant.length / relevantDocs.length,
    reciprocalRank: reciprocalRank(limited, relevantSet),
    latencyMs,
  };
}

function rankedDocIdsFromPaths(paths: string[], docIdByPath: Map<string, string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const resultPath of paths) {
    const docId = docIdByPath.get(resultPath);
    if (!docId || seen.has(docId)) continue;
    seen.add(docId);
    out.push(docId);
  }
  return out;
}

function summarizeEvaluations(evaluations: QueryEvaluation[]): SemanticEvalMetricSummary {
  return {
    ndcgAtK: mean(evaluations.map((evaluation) => evaluation.ndcg)),
    recallAtK: mean(evaluations.map((evaluation) => evaluation.recall)),
    mrrAtK: mean(evaluations.map((evaluation) => evaluation.reciprocalRank)),
    averageQueryLatencyMs: mean(evaluations.map((evaluation) => evaluation.latencyMs)),
    p95QueryLatencyMs: percentile(evaluations.map((evaluation) => evaluation.latencyMs), 0.95),
  };
}

function dcg(relevances: number[]): number {
  return relevances.reduce((sum, relevance, index) => {
    const rank = index + 1;
    return sum + ((2 ** relevance) - 1) / Math.log2(rank + 1);
  }, 0);
}

function idealDcg(relevances: number[], limit: number): number {
  const score = dcg([...relevances].sort((a, b) => b - a).slice(0, limit));
  return score > 0 ? score : 1;
}

function reciprocalRank(rankedDocs: string[], relevantSet: Set<string>): number {
  const index = rankedDocs.findIndex((docId) => relevantSet.has(docId));
  return index >= 0 ? 1 / (index + 1) : 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? 0;
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = readNumber(name, fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readSearchMode(raw: string | undefined): "dense" | "hybrid" {
  return raw === "dense" ? "dense" : "hybrid";
}

function printReport(report: {
  datasetName: string;
  modelId: string;
  searchMode: string;
  reranker: string | undefined;
  vaultPath: string;
  documentCount: number;
  queryCount: number;
  indexedChunkCount: number;
  indexBuildMs: number;
  summary: SemanticEvalMetricSummary;
  reportPath: string;
  latestPath: string;
}): void {
  const lines = [
    "",
    "Semantic search evaluation",
    `Dataset: ${report.datasetName}`,
    `Model: ${report.modelId}`,
    `Mode: ${report.searchMode}`,
    `Reranker: ${report.reranker ?? "off"}`,
    `Documents: ${report.documentCount}`,
    `Queries: ${report.queryCount}`,
    `Indexed chunks: ${report.indexedChunkCount}`,
    `Index build: ${formatMs(report.indexBuildMs)}`,
    `nDCG@${TOP_K}: ${report.summary.ndcgAtK.toFixed(4)}`,
    `Recall@${TOP_K}: ${report.summary.recallAtK.toFixed(4)}`,
    `MRR@${TOP_K}: ${report.summary.mrrAtK.toFixed(4)}`,
    `Query latency avg: ${formatMs(report.summary.averageQueryLatencyMs)}`,
    `Query latency p95: ${formatMs(report.summary.p95QueryLatencyMs)}`,
  ];
  lines.push(`Tipsboard vault: ${report.vaultPath}`);
  lines.push("Open this folder in Tipsboard (Select Vault Folder) to try semantic search.");
  lines.push(`Report: ${report.reportPath}`);
  lines.push(`Latest: ${report.latestPath}`);
  console.log(lines.join("\n"));
}

function formatMs(value: number): string {
  return `${value.toFixed(1)} ms`;
}
