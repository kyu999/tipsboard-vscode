import path from "node:path";

/** Paths written via Tipsboard RPC are masked from conflict detection briefly (watcher can lag). */
export const SELF_WRITE_MASK_MS = 3000;
/** Extra mask after save completes to absorb delayed watcher events on network shares. */
export const SELF_WRITE_WATCHER_LAG_BUFFER_MS = 2000;

export function computePostSaveSelfWriteMaskMs(saveDurationMs: number): number {
  return Math.max(SELF_WRITE_MASK_MS, saveDurationMs + SELF_WRITE_WATCHER_LAG_BUFFER_MS);
}

export function normalizeVaultRelativePath(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^\.\//, "");
}

const EXCLUDED_WORKSPACE_DIRS = new Set([".tipsboard", ".git", "node_modules", "dist", "build", "out"]);

export function isExcludedWorkspaceRelativePath(rel: string): boolean {
  const normalized = normalizeVaultRelativePath(rel);
  return normalized.split("/").some((part) => EXCLUDED_WORKSPACE_DIRS.has(part));
}

export function isWatchedMarkdownPath(rel: string): boolean {
  const normalized = normalizeVaultRelativePath(rel);
  return normalized.toLowerCase().endsWith(".md") && !isExcludedWorkspaceRelativePath(normalized);
}

export function isWatchedVaultMetadataPath(rel: string): boolean {
  const normalized = normalizeVaultRelativePath(rel);
  if (normalized === ".tipsboard/kanban.json" || normalized === ".tipsboard/pins.json") return true;
  return normalized.startsWith(".tipsboard/canvas/") && normalized.endsWith(".canvas");
}

export function isWatchedVaultPath(rel: string): boolean {
  return isWatchedMarkdownPath(rel) || isWatchedVaultMetadataPath(rel);
}

/** Resolved absolute vault root and file path → vault-relative posix path, or null if outside vault. */
export function fsPathToVaultRelative(vaultFsPath: string, fileFsPath: string): string | null {
  const vault = path.resolve(vaultFsPath);
  const file = path.resolve(fileFsPath);
  const rel = path.relative(vault, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return normalizeVaultRelativePath(rel);
}

export function pruneExpiredSelfWrites(selfWrittenUntil: Map<string, number>, now: number): void {
  for (const [p, exp] of selfWrittenUntil) {
    if (exp <= now) selfWrittenUntil.delete(p);
  }
}

export function isPathSelfMasked(
  rel: string,
  selfWrittenUntil: ReadonlyMap<string, number>,
  now: number,
): boolean {
  const exp = selfWrittenUntil.get(rel);
  return exp !== undefined && exp > now;
}

/**
 * Drop paths still covered by an active self-write mask (after pruning expired entries).
 */
export function filterExternalChangePaths(
  pendingPaths: Iterable<string>,
  selfWrittenUntil: Map<string, number>,
  now: number,
): string[] {
  pruneExpiredSelfWrites(selfWrittenUntil, now);
  return [...pendingPaths]
    .map(normalizeVaultRelativePath)
    .filter((p) => isWatchedVaultPath(p) && !isPathSelfMasked(p, selfWrittenUntil, now));
}
