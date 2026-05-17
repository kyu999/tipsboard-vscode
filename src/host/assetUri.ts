import * as vscode from "vscode";
import path from "node:path";

/** Validate vault-relative asset path to match Editor rules (narrowed to assets/). */
export function assetPathAllowed(relativePath: string): boolean {
  if (!relativePath) return false;
  if (path.isAbsolute(relativePath)) return false;
  const normalized = path.normalize(relativePath).replace(/\\/g, "/");
  if (normalized === ".." || normalized.startsWith("../")) return false;
  if (normalized.includes("/../")) return false;
  return normalized.startsWith("assets/images/") || normalized.startsWith("assets/files/");
}

/** Paths allowed for OS-open via RPC (`assets/files/` only). */
export function vaultFileAttachmentOpenAllowed(relativePath: string): boolean {
  if (!relativePath || path.isAbsolute(relativePath)) return false;
  const normalized = path.normalize(relativePath).replace(/\\/g, "/");
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) return false;
  return normalized.startsWith("assets/files/");
}

export function toAssetWebviewUri(webview: vscode.Webview, vaultRoot: vscode.Uri, relativePath: string): vscode.Uri | null {
  const disk = toAssetDiskUri(vaultRoot, relativePath);
  if (!disk) return null;
  return webview.asWebviewUri(disk);
}

export function toAssetDiskUri(vaultRoot: vscode.Uri, relativePath: string): vscode.Uri | null {
  if (!assetPathAllowed(relativePath)) return null;
  const posix = relativePath.replace(/\\/g, "/").split("/");
  return vscode.Uri.joinPath(vaultRoot, ...posix);
}
