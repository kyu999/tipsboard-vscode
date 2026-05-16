import * as vscode from "vscode";
import path from "node:path";

/** Validate vault-relative asset path to match Editor rules (narrowed to assets/). */
export function assetPathAllowed(relativePath: string): boolean {
  if (!relativePath) return false;
  if (path.isAbsolute(relativePath)) return false;
  const normalized = path.normalize(relativePath).replace(/\\/g, "/");
  if (normalized === ".." || normalized.startsWith("../")) return false;
  return normalized.startsWith("assets/images/");
}

export function toAssetWebviewUri(webview: vscode.Webview, vaultRoot: vscode.Uri, relativePath: string): vscode.Uri | null {
  if (!assetPathAllowed(relativePath)) return null;
  const posix = relativePath.replace(/\\/g, "/").split("/");
  const disk = vscode.Uri.joinPath(vaultRoot, ...posix);
  return webview.asWebviewUri(disk);
}
