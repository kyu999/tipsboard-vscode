/** Must match `ATTACHMENT_TOO_LARGE_ERROR` in `src/host/vault.ts`. */
export const ATTACHMENT_TOO_LARGE_ERROR = "TIPSBOARD_ATTACHMENT_TOO_LARGE";

/** Default 10 MiB — aligned with `DEFAULT_ATTACHMENT_MAX_BYTES` in extension host settings. */
export const DEFAULT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export function formatAttachmentLimitMiB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (!Number.isFinite(mb) || mb <= 0) return "0";
  const s = Number.isInteger(mb) ? String(mb) : mb.toFixed(2);
  const trimmed = s.replace(/\.?0+$/, "");
  return trimmed.length > 0 ? trimmed : "0";
}
