import { buildNoteIndex, patchNoteIndex } from "../../webview/src/lib/noteIndex.js";
import type { NoteSummary } from "../../src/types/editor.js";
import { benchmarkIterations } from "./benchUtils.js";
import { buildPerfNoteSummaries } from "./hostBench.js";
import type { PerfScenarioId } from "./thresholds.js";
import { thresholdForScenario } from "./thresholds.js";

export interface WebviewBenchResult {
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

function upsertSavedNote(notes: NoteSummary[], previousPath: string, savedNote: NoteSummary): NoteSummary[] {
  return [
    ...notes.filter((note) => note.path !== previousPath && note.path !== savedNote.path),
    savedNote,
  ].sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
}

export async function runWebviewBench(noteCount: number): Promise<WebviewBenchResult[]> {
  const notes = buildPerfNoteSummaries(noteCount);
  const target = notes[0]!;
  const results: WebviewBenchResult[] = [];

  const fullIndex = await benchmarkIterations({
    warmup: 2,
    iterations: 10,
    fn: () => {
      buildNoteIndex(notes);
    },
  });
  results.push(toWebviewResult("buildNoteIndex_full", noteCount, fullIndex));

  const upsertFull = await benchmarkIterations({
    warmup: 2,
    iterations: 10,
    fn: () => {
      const saved = {
        ...target,
        body: `${target.body}\nEdited`,
        updatedAt: Date.now(),
      };
      const merged = upsertSavedNote(notes, target.path, saved);
      buildNoteIndex(merged);
    },
  });
  results.push(toWebviewResult("upsertSavedNote_then_buildNoteIndex", noteCount, upsertFull));

  const incremental = await benchmarkIterations({
    warmup: 2,
    iterations: 20,
    fn: () => {
      const saved = {
        ...target,
        body: `${target.body}\nEdited ${Math.random()}`,
        updatedAt: Date.now(),
      };
      const merged = upsertSavedNote(notes, target.path, saved);
      const baseIndex = buildNoteIndex(notes);
      patchNoteIndex(baseIndex, merged, target, saved);
    },
  });
  results.push(toWebviewResult("buildNoteIndex_incremental", noteCount, incremental));

  return results;
}

function toWebviewResult(
  scenario: PerfScenarioId,
  noteCount: number,
  bench: Awaited<ReturnType<typeof benchmarkIterations>>,
): WebviewBenchResult {
  const thresholdMs = thresholdForScenario(scenario);
  return {
    scenario,
    noteCount,
    iterations: bench.samplesMs.length,
    p50Ms: bench.p50Ms,
    p95Ms: bench.p95Ms,
    minMs: bench.minMs,
    maxMs: bench.maxMs,
    thresholdMs,
    passed: thresholdMs === undefined ? true : bench.p95Ms <= thresholdMs,
  };
}
