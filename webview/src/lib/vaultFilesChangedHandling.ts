export type VaultFilesChangedAction = "refresh" | "banner";

/**
 * Decide WebView handling for Host `vault-files-changed` (matches `App.tsx` policy).
 */
export function resolveVaultFilesChangedAction(input: {
  paths?: string[];
  selectedPath: string | null;
  hasUnsavedChanges: boolean;
}): VaultFilesChangedAction {
  const { paths, selectedPath, hasUnsavedChanges } = input;

  if (paths !== undefined) {
    const normalizedSelected = selectedPath?.replace(/\\/g, "/") ?? null;
    const normalizedPaths = new Set(paths.map((p) => p.replace(/\\/g, "/")));
    const touchesSelectedNote = Boolean(
      normalizedSelected && normalizedPaths.has(normalizedSelected),
    );
    if (!touchesSelectedNote) {
      return "refresh";
    }
  }

  return hasUnsavedChanges ? "banner" : "refresh";
}
