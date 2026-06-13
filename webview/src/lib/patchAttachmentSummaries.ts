import type { NoteSummary, VaultAttachmentReference, VaultAttachmentSummary } from "@/types";
import {
  extractVaultFileAttachmentLinks,
  noteBodyReferencesVaultFiles,
} from "../../../src/shared/vaultFileAttachmentLinks";

function normalizePath(notePath: string): string {
  return notePath.replace(/\\/g, "/");
}

export function patchAttachmentSummariesForSavedNote(
  attachments: VaultAttachmentSummary[],
  savedNote: NoteSummary,
  previousPath: string,
): VaultAttachmentSummary[] {
  const notePath = normalizePath(savedNote.path);
  const prevPath = normalizePath(previousPath);

  const stripped = attachments.map((attachment) => {
    const references = attachment.references.filter((reference) => {
      const refPath = normalizePath(reference.notePath);
      return refPath !== notePath && refPath !== prevPath;
    });
    return {
      ...attachment,
      references,
      referenced: references.length > 0,
    };
  });

  const byPath = new Map(stripped.map((attachment) => [attachment.relativePath, attachment]));
  for (const link of extractVaultFileAttachmentLinks(savedNote.body)) {
    const reference: VaultAttachmentReference = {
      notePath: savedNote.path,
      noteTitle: savedNote.title,
      noteFilename: savedNote.filename,
      label: link.label,
    };
    const existing = byPath.get(link.relativePath);
    if (existing) {
      const references = [...existing.references, reference];
      byPath.set(link.relativePath, {
        ...existing,
        references,
        referenced: true,
      });
      continue;
    }

    const filename = link.relativePath.split("/").pop() ?? link.relativePath;
    const extensionMatch = /\.[^.]+$/.exec(filename);
    const extension = extensionMatch?.[0]?.toLowerCase() ?? "";
    byPath.set(link.relativePath, {
      relativePath: link.relativePath,
      filename,
      basename: extension ? filename.slice(0, -extension.length) : filename,
      extension,
      size: 0,
      updatedAt: savedNote.updatedAt,
      references: [reference],
      referenced: true,
    });
  }

  return [...byPath.values()].sort(
    (a, b) => b.updatedAt - a.updatedAt || a.filename.localeCompare(b.filename),
  );
}

export { noteBodyReferencesVaultFiles };
