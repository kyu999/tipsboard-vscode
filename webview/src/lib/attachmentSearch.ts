import type { VaultAttachmentSummary } from "@/types";

export function searchAttachments(
  attachments: VaultAttachmentSummary[],
  query: string,
): VaultAttachmentSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return attachments;
  return attachments.filter((attachment) => {
    const refs = attachment.references
      .map((ref) => `${ref.noteTitle} ${ref.noteFilename} ${ref.label}`)
      .join(" ");
    const haystack = [
      attachment.filename,
      attachment.basename,
      attachment.extension,
      attachment.relativePath,
      refs,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}
