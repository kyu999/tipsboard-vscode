import type { NoteSummary } from "../../src/types/editor.js";
import { buildPreview, extractTitle, normalizeTitle } from "../../src/host/vault.js";
import { benchmarkIterations } from "./benchUtils.js";
import { perfNoteBody } from "./fixtures.js";
import { readVault, readVaultAttachmentSummaries, saveNote, seedPerfVault } from "./seedVault.js";
import type { PerfScenarioId } from "./thresholds.js";
import { thresholdForScenario } from "./thresholds.js";

export interface HostBenchResult {
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

export async function runHostBench(options: {
  cacheDir: string;
  noteCount: number;
  refresh?: boolean;
}): Promise<HostBenchResult[]> {
  const seeded = await seedPerfVault({
    cacheDir: options.cacheDir,
    noteCount: options.noteCount,
    refresh: options.refresh,
  });

  const results: HostBenchResult[] = [];

  const bodyOnly = await benchmarkIterations({
    warmup: 3,
    iterations: 20,
    fn: async () => {
      await saveNote(
        seeded.vaultPath,
        seeded.targetPath,
        `${perfNoteBody({ index: 0, linkTargetIndex: 1 })}\nEdited ${Date.now()}`,
      );
    },
  });
  results.push(toHostResult("saveNote_bodyOnly", options.noteCount, bodyOnly));

  const titleRename = await benchmarkIterations({
    warmup: 2,
    iterations: 10,
    fn: async () => {
      let currentPath = seeded.targetPath;
      const renamed = await saveNote(
        seeded.vaultPath,
        currentPath,
        `Perf Renamed ${Date.now()}\n${perfNoteBody({ index: 0, linkTargetIndex: 1 }).split("\n").slice(2).join("\n")}`,
      );
      currentPath = renamed.path;
      const restored = await saveNote(
        seeded.vaultPath,
        currentPath,
        perfNoteBody({ index: 0, linkTargetIndex: 1 }),
      );
      void restored;
    },
  });
  results.push(toHostResult("saveNote_titleRename", options.noteCount, titleRename));

  const readVaultBench = await benchmarkIterations({
    warmup: 1,
    iterations: 5,
    fn: async () => {
      await readVault(seeded.vaultPath);
    },
  });
  results.push(toHostResult("readVault_full", options.noteCount, readVaultBench));

  const attachmentBench = await benchmarkIterations({
    warmup: 1,
    iterations: 5,
    fn: async () => {
      await readVaultAttachmentSummaries(seeded.vaultPath);
    },
  });
  results.push(toHostResult("readVaultAttachmentSummaries", options.noteCount, attachmentBench));

  return results;
}

function toHostResult(
  scenario: PerfScenarioId,
  noteCount: number,
  bench: Awaited<ReturnType<typeof benchmarkIterations>>,
): HostBenchResult {
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

export function buildPerfNoteSummaries(noteCount: number): NoteSummary[] {
  const notes: NoteSummary[] = [];
  for (let i = 0; i < noteCount; i += 1) {
    const body = perfNoteBody({
      index: i,
      linkTargetIndex: i > 0 ? i - 1 : undefined,
    });
    const title = extractTitle(body);
    notes.push({
      path: `pages/perf-${String(i).padStart(5, "0")}.md`,
      filename: `perf-${String(i).padStart(5, "0")}.md`,
      title,
      normalizedTitle: normalizeTitle(title),
      body,
      preview: buildPreview(body),
      updatedAt: i,
      createdAt: i,
    });
  }
  return notes;
}
