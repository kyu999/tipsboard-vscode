/**
 * Client-side hints for Shift+drop. Host re-validates (`src/host/vault.ts`).
 * Keep extension sets in sync with `IMG_EXT` / `BLOCKED_ATTACHMENT_EXTS` there.
 */

export const ATTACHMENT_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export const ATTACHMENT_BLOCKED_EXTS = new Set([
  ".app",
  ".bash",
  ".bat",
  ".cmd",
  ".com",
  ".dmg",
  ".exe",
  ".jar",
  ".msi",
  ".pkg",
  ".ps1",
  ".scr",
  ".sh",
  ".zsh",
]);

export const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function attachmentFileExtensionLower(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function isAttachmentImageFile(file: File): boolean {
  if (IMAGE_MIME_TYPES.has(file.type)) return true;
  return ATTACHMENT_IMAGE_EXTS.has(attachmentFileExtensionLower(file.name));
}

export function isClientBlockedAttachment(file: File): boolean {
  const ext = attachmentFileExtensionLower(file.name);
  if (!ext) return false;
  return ATTACHMENT_BLOCKED_EXTS.has(ext);
}
