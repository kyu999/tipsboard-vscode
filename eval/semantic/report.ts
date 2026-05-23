import { promises as fs } from "node:fs";
import path from "node:path";

import type { SemanticEvalDatasetId } from "./datasets.js";

export const SEMANTIC_EVAL_REPORT_SCHEMA_VERSION = 1;

export interface SemanticEvalQueryResult {
  id: string;
  text: string;
  relevantDocIds: string[];
  rankedDocIds: string[];
  ndcg: number;
  recall: number;
  reciprocalRank: number;
  latencyMs: number;
}

export interface SemanticEvalMetricSummary {
  ndcgAtK: number;
  recallAtK: number;
  mrrAtK: number;
  averageQueryLatencyMs: number;
  p95QueryLatencyMs: number;
}

export interface SemanticEvalReport {
  schemaVersion: typeof SEMANTIC_EVAL_REPORT_SCHEMA_VERSION;
  createdAt: string;
  datasetId: SemanticEvalDatasetId;
  datasetName: string;
  modelId: string;
  topK: number;
  searchMode: string;
  denseWeight: number;
  bm25Weight: number;
  reranker?: string;
  documentCount: number;
  queryCount: number;
  indexedChunkCount: number;
  indexBuildMs: number;
  vaultPath?: string;
  summary: SemanticEvalMetricSummary;
  queries: SemanticEvalQueryResult[];
}

export interface WriteSemanticEvalReportResult {
  reportPath: string;
  latestPath: string;
}

export async function writeSemanticEvalReport(
  reportsDir: string,
  report: SemanticEvalReport,
): Promise<WriteSemanticEvalReportResult> {
  await fs.mkdir(reportsDir, { recursive: true });

  const timestamp = report.createdAt.replace(/[:.]/g, "-");
  const defaultFileName = `semantic-eval-${report.datasetId}-${timestamp}.json`;
  const reportPath = process.env.TIPSBOARD_SEMANTIC_EVAL_REPORT_PATH
    ? path.resolve(process.env.TIPSBOARD_SEMANTIC_EVAL_REPORT_PATH)
    : path.join(reportsDir, safeReportFileName(defaultFileName));
  const latestPath = path.join(reportsDir, "latest.json");
  const payload = `${JSON.stringify(report, null, 2)}\n`;

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, payload, "utf8");
  await fs.writeFile(latestPath, payload, "utf8");

  return { reportPath, latestPath };
}

function safeReportFileName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]+/g, "-");
}
