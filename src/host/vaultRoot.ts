import * as vscode from "vscode";
import path from "node:path";

export type VaultResolutionStatus = "ready" | "no-workspace" | "multi-root";

export interface VaultResolution {
  status: VaultResolutionStatus;
  fsPath?: string;
}

export function resolveVault(): VaultResolution {
  const folders = vscode.workspace.workspaceFolders;
  const named = (vscode.workspace.getConfiguration("tipsboard-vscode").get<string>("vaultFolder") ?? "").trim();

  if (folders?.length === 1) {
    return { status: "ready", fsPath: folders[0]!.uri.fsPath };
  }

  if (folders && folders.length > 1) {
    if (named) {
      if (path.isAbsolute(named)) {
        return { status: "ready", fsPath: named };
      }
      const hit = folders.find((f) => f.name === named || f.uri.fsPath === named);
      if (hit) {
        return { status: "ready", fsPath: hit.uri.fsPath };
      }
    }
    return { status: "multi-root" };
  }

  return { status: "no-workspace" };
}

export function resolveVaultFsPath(): string | undefined {
  const resolution = resolveVault();
  return resolution.status === "ready" ? resolution.fsPath : undefined;
}
