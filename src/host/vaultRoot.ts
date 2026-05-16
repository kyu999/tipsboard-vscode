import * as vscode from "vscode";
import path from "node:path";

export function resolveVaultFsPath(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  const cfg = vscode.workspace.getConfiguration("tipsboard-vscode");
  const manual = (cfg.get<string>("manualVaultPath") ?? "").trim();
  const named = (cfg.get<string>("vaultFolder") ?? "").trim();

  // Explicit path from "Select Vault Folder" or settings — must win even when the
  // workspace is a single root, otherwise vault change appears to do nothing.
  if (manual) {
    return manual;
  }

  if (folders?.length === 1) {
    return folders[0]!.uri.fsPath;
  }

  if (folders && folders.length > 0 && named) {
    if (path.isAbsolute(named)) return named;
    const hit = folders.find((f) => f.name === named || f.uri.fsPath === named);
    if (hit) return hit.uri.fsPath;
  }

  return undefined;
}

export async function persistManualVaultPath(fsPath: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("tipsboard-vscode");
  await cfg.update("manualVaultPath", fsPath, vscode.ConfigurationTarget.Global);
}

export async function pickVaultFolder(): Promise<string | undefined> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Open vault",
  });
  const uri = uris?.[0];
  if (!uri) return undefined;
  const fsPath = uri.fsPath;
  await persistManualVaultPath(fsPath);
  return fsPath;
}
