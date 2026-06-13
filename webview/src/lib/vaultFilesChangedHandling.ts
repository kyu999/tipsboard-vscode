export type VaultFilesChangedAction = "refresh" | "ignore";

/**
 * Decide WebView handling for Host `vault-files-changed` (matches `App.tsx` policy).
 * When the selected note has unsaved edits, skip refresh to avoid overwriting the editor.
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

  return hasUnsavedChanges ? "ignore" : "refresh";
}
