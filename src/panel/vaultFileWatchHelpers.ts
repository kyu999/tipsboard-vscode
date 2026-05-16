import path from "node:path";

export function normalizeVaultRelativePath(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^\.\//, "");
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
  return [...pendingPaths].filter((p) => !isPathSelfMasked(p, selfWrittenUntil, now));
}
