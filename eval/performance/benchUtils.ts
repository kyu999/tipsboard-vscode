import { performance } from "node:perf_hooks";

export function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedMs.length) - 1;
  const index = Math.min(Math.max(rank, 0), sortedMs.length - 1);
  return sortedMs[index]!;
}

export async function measureMs(fn: () => void | Promise<void>): Promise<number> {
  const started = performance.now();
  await fn();
  return performance.now() - started;
}

export async function benchmarkIterations(options: {
  warmup: number;
  iterations: number;
  fn: () => void | Promise<void>;
}): Promise<{ samplesMs: number[]; p50Ms: number; p95Ms: number; minMs: number; maxMs: number }> {
  for (let i = 0; i < options.warmup; i += 1) {
    await options.fn();
  }

  const samplesMs: number[] = [];
  for (let i = 0; i < options.iterations; i += 1) {
    samplesMs.push(await measureMs(options.fn));
  }

  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    samplesMs,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}
