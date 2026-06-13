import { promises as fs } from "node:fs";
import path from "node:path";

import type { PerfScenarioId } from "./thresholds.js";

export const PERF_EVAL_REPORT_SCHEMA_VERSION = 1;

export interface PerfEvalResultEntry {
  scenario: PerfScenarioId;
  noteCount: number;
  iterations: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  thresholdMs?: number;
  passed: boolean;
}

export interface PerfEvalReport {
  schemaVersion: typeof PERF_EVAL_REPORT_SCHEMA_VERSION;
  createdAt: string;
  noteCounts: number[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  results: PerfEvalResultEntry[];
}

export interface WritePerfEvalReportResult {
  reportPath: string;
  latestPath: string;
}

export async function writePerfEvalReport(
  reportsDir: string,
  report: PerfEvalReport,
): Promise<WritePerfEvalReportResult> {
  await fs.mkdir(reportsDir, { recursive: true });

  const timestamp = report.createdAt.replace(/[:.]/g, "-");
  const reportPath = process.env.TIPSBOARD_PERF_EVAL_REPORT_PATH
    ? path.resolve(process.env.TIPSBOARD_PERF_EVAL_REPORT_PATH)
    : path.join(reportsDir, `perf-eval-${timestamp}.json`);
  const latestPath = path.join(reportsDir, "perf-eval-latest.json");
  const payload = `${JSON.stringify(report, null, 2)}\n`;

  await fs.writeFile(reportPath, payload, "utf8");
  await fs.writeFile(latestPath, payload, "utf8");

  return { reportPath, latestPath };
}
