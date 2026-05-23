import { performance } from "node:perf_hooks";

export interface ProgressReporter {
  update(current: number, extra?: string): void;
  done(extra?: string): void;
}

const BAR_WIDTH = 24;

export function logSemanticEvalProgress(message: string): void {
  console.log(`[semantic-eval] ${message}`);
}

export function createProgressReporter(options: {
  label: string;
  total: number;
  minIntervalMs?: number;
}): ProgressReporter {
  const startedAt = performance.now();
  const minIntervalMs = options.minIntervalMs ?? 1000;
  let lastPrintedAt = 0;
  let lastLength = 0;
  let completed = false;

  const print = (current: number, extra: string | undefined, force: boolean): void => {
    if (completed) return;
    const now = performance.now();
    if (!force && now - lastPrintedAt < minIntervalMs) return;
    lastPrintedAt = now;

    const safeTotal = Math.max(1, options.total);
    const safeCurrent = Math.min(Math.max(0, current), safeTotal);
    const ratio = safeCurrent / safeTotal;
    const filled = Math.round(ratio * BAR_WIDTH);
    const bar = `${"=".repeat(filled)}${filled < BAR_WIDTH ? ">" : ""}${".".repeat(Math.max(0, BAR_WIDTH - filled - 1))}`;
    const elapsedMs = now - startedAt;
    const rate = safeCurrent > 0 ? safeCurrent / (elapsedMs / 1000) : 0;
    const remaining = safeCurrent > 0 ? (safeTotal - safeCurrent) / rate : Number.POSITIVE_INFINITY;
    const line = [
      `[semantic-eval] ${options.label}`,
      `[${bar}]`,
      `${safeCurrent}/${safeTotal}`,
      `${(ratio * 100).toFixed(1)}%`,
      `elapsed ${formatDuration(elapsedMs / 1000)}`,
      `rate ${rate.toFixed(2)}/s`,
      `eta ${Number.isFinite(remaining) ? formatDuration(remaining) : "--"}`,
      extra,
    ].filter(Boolean).join(" ");

    if (process.stdout.isTTY) {
      const padding = lastLength > line.length ? " ".repeat(lastLength - line.length) : "";
      process.stdout.write(`\r${line}${padding}`);
      lastLength = line.length;
    } else {
      console.log(line);
    }
  };

  return {
    update(current: number, extra?: string): void {
      print(current, extra, false);
    },
    done(extra?: string): void {
      print(options.total, extra, true);
      completed = true;
      if (process.stdout.isTTY) process.stdout.write("\n");
    },
  };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m${String(rest).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  const minuteRest = minutes % 60;
  return `${hours}h${String(minuteRest).padStart(2, "0")}m`;
}
