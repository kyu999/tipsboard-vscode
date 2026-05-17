import * as vscode from "vscode";

/** Default 10 MiB — aligned with prior hard-coded image drop limit */
export const DEFAULT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const ABS_MAX_BYTES = 1024 * 1024 * 1024;

/**
 * Reads `tipsboard-vscode.maxAttachmentBytes` from VS Code configuration.
 * Values are clamped to [1, 1GiB].
 */
export function readAttachmentMaxBytes(): number {
  const cfg = vscode.workspace.getConfiguration("tipsboard-vscode");
  const raw = cfg.get<number>("maxAttachmentBytes");
  const n =
    typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_ATTACHMENT_MAX_BYTES;
  return Math.min(Math.max(n, 1), ABS_MAX_BYTES);
}
