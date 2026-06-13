import path from "node:path";
import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { logPerfEvalProgress } from "./progress.js";
import { type PerfEvalReport, writePerfEvalReport } from "./report.js";
import { runHostBench } from "./hostBench.js";
import { runWebviewBench } from "./webviewBench.js";

function readSizes(): number[] {
  const raw = process.env.TIPSBOARD_PERF_EVAL_SIZES?.trim();
  if (!raw) return [100, 1_000, 5_000, 10_000];
  return raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

describe("performance evaluation", () => {
  it("benchmarks vault save and webview index paths", { timeout: 0 }, async () => {
    const root = process.cwd();
    const cacheDir = path.join(root, "eval", ".cache");
    const reportsDir = path.join(cacheDir, "reports");
    const sizes = readSizes();
    const refresh = process.env.TIPSBOARD_PERF_EVAL_REFRESH === "1";
    const startedAt = performance.now();
    const results = [];

    logPerfEvalProgress(`Starting performance evaluation for sizes: ${sizes.join(", ")}`);

    for (const noteCount of sizes) {
      logPerfEvalProgress(`Host benchmarks (${noteCount} notes)`);
      results.push(...(await runHostBench({ cacheDir, noteCount, refresh })));
      logPerfEvalProgress(`WebView benchmarks (${noteCount} notes)`);
      results.push(...(await runWebviewBench(noteCount)));
    }

    const report: PerfEvalReport = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      noteCounts: sizes,
      summary: {
        total: results.length,
        passed: results.filter((result) => result.passed).length,
        failed: results.filter((result) => !result.passed).length,
      },
      results,
    };

    const written = await writePerfEvalReport(reportsDir, report);
    logPerfEvalProgress(`Report: ${written.reportPath}`);
    logPerfEvalProgress(`Elapsed: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);

    for (const result of results) {
      expect(
        result.passed,
        `${result.scenario} @ ${result.noteCount} notes: p95=${result.p95Ms.toFixed(1)}ms (threshold ${result.thresholdMs ?? "n/a"}ms)`,
      ).toBe(true);
    }
  });
});
