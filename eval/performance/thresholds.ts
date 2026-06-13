export type PerfScenarioId =
  | "saveNote_bodyOnly"
  | "saveNote_titleRename"
  | "readVault_full"
  | "readVaultAttachmentSummaries"
  | "buildNoteIndex_full"
  | "upsertSavedNote_then_buildNoteIndex"
  | "buildNoteIndex_incremental";

export interface PerfThreshold {
  scenario: PerfScenarioId;
  p95Ms: number;
}

/** Local SSD SLO targets from the performance plan. */
export const PERF_THRESHOLDS: PerfThreshold[] = [
  { scenario: "saveNote_bodyOnly", p95Ms: 300 },
  { scenario: "saveNote_titleRename", p95Ms: 1_500 },
  { scenario: "readVault_full", p95Ms: 5_000 },
  { scenario: "readVaultAttachmentSummaries", p95Ms: 5_000 },
  { scenario: "buildNoteIndex_full", p95Ms: 1_000 },
  { scenario: "upsertSavedNote_then_buildNoteIndex", p95Ms: 1_000 },
  { scenario: "buildNoteIndex_incremental", p95Ms: 200 },
];

export function thresholdForScenario(scenario: PerfScenarioId): number | undefined {
  return PERF_THRESHOLDS.find((item) => item.scenario === scenario)?.p95Ms;
}
