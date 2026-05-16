import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const PINS_SEG = `.tipsboard/pins.json`;

function pinsAbs(vaultPath: string): string {
  return path.join(vaultPath, ...PINS_SEG.split("/"));
}

export interface PinsState {
  version: 1;
  /** Pinned paths (pages/…) in display order — first appears first on the grid. */
  paths: string[];
}

function emptyPins(): PinsState {
  return { version: 1, paths: [] };
}

export async function loadPinsState(vaultPath: string): Promise<PinsState> {
  const abs = pinsAbs(vaultPath);
  let raw = "";
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch {
    return emptyPins();
  }
  try {
    const parsed = JSON.parse(raw) as { version?: number; paths?: unknown };
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.paths)) return emptyPins();
    const paths = parsed.paths.filter((x): x is string => typeof x === "string");
    return { version: 1, paths: paths.map((p) => p.replace(/\\/g, "/")) };
  } catch {
    return emptyPins();
  }
}

export async function savePinsState(vaultPath: string, state: PinsState): Promise<void> {
  const dir = path.join(vaultPath, ".tipsboard");
  await fs.mkdir(dir, { recursive: true });
  const target = pinsAbs(vaultPath);
  const tmp = `${target}.${randomUUID()}.tmp`;
  const json = `${JSON.stringify({ version: 1, paths: state.paths }, null, 2)}\n`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, target);
}

function normPath(rel: string): string {
  return rel.replace(/\\/g, "/");
}

export function prunePinsToValidPaths(state: PinsState, validPaths: ReadonlySet<string>): PinsState {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const raw of state.paths) {
    const p = normPath(raw);
    if (!validPaths.has(p) || seen.has(p)) continue;
    seen.add(p);
    paths.push(p);
  }
  return { version: 1, paths };
}

export function cleanupPinsAfterNoteDelete(state: PinsState, deletedRelative: string): PinsState {
  const del = normPath(deletedRelative);
  return {
    ...state,
    paths: state.paths.filter((p) => normPath(p) !== del),
  };
}

export async function patchPinsNotePaths(vaultPath: string, oldRelative: string, newRelative: string): Promise<void> {
  const oldN = normPath(oldRelative);
  const newN = normPath(newRelative);
  if (oldN === newN) return;
  const state = await loadPinsState(vaultPath);
  const next: PinsState = {
    version: 1,
    paths: state.paths.map((p) => (normPath(p) === oldN ? newN : p)),
  };
  await savePinsState(vaultPath, next);
}

export async function persistNotePinned(vaultPath: string, noteRelativePath: string, pinned: boolean): Promise<void> {
  const norm = normPath(noteRelativePath);
  const state = await loadPinsState(vaultPath);
  let paths = state.paths.map(normPath);
  paths = paths.filter((p) => p !== norm);
  if (pinned) paths.unshift(norm);
  await savePinsState(vaultPath, { version: 1, paths });
}
