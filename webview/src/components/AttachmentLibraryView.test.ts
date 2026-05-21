import { describe, expect, it } from "vitest";
import { searchAttachments } from "@/lib/attachmentSearch";
import type { VaultAttachmentSummary } from "@/types";

function attachment(partial: Partial<VaultAttachmentSummary> & Pick<VaultAttachmentSummary, "relativePath">): VaultAttachmentSummary {
  const filename = partial.relativePath.split("/").pop() ?? partial.relativePath;
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
  return {
    ...partial,
    filename: partial.filename ?? filename,
    basename: partial.basename ?? (extension ? filename.slice(0, -extension.length) : filename),
    extension: partial.extension ?? extension,
    size: partial.size ?? 1,
    updatedAt: partial.updatedAt ?? 0,
    references: partial.references ?? [],
    referenced: partial.referenced ?? false,
  };
}

describe("searchAttachments", () => {
  it("matches filename, extension, and linked note metadata", () => {
    const rows = [
      attachment({
        relativePath: "assets/files/Meeting_Spec_ab12cd34.pdf",
        references: [
          {
            notePath: "pages/Meeting.md",
            noteTitle: "Meeting",
            noteFilename: "Meeting.md",
            label: "Specification",
          },
        ],
        referenced: true,
      }),
      attachment({ relativePath: "assets/files/Loose_a1b2c3d4.txt" }),
    ];

    expect(searchAttachments(rows, "spec")).toEqual([rows[0]]);
    expect(searchAttachments(rows, ".txt")).toEqual([rows[1]]);
    expect(searchAttachments(rows, "meeting.md")).toEqual([rows[0]]);
  });
});
