/** Join vault root (host path) and vault-relative POSIX path for display / clipboard. */
export function joinVaultAbsolutePath(vaultPath: string, relativePath: string): string {
  const base = vaultPath.replace(/[/\\]+$/, "");
  const rel = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const useBackslash = /\\/.test(base) || /^[A-Za-z]:[^/]/.test(base);
  const sep = useBackslash ? "\\" : "/";
  const parts = rel.split("/").filter(Boolean);
  return parts.length === 0 ? base : `${base}${sep}${parts.join(sep)}`;
}
