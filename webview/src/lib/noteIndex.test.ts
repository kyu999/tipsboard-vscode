import { describe, expect, it } from "vitest";

import { buildNoteIndex, searchNotes } from "./noteIndex";
import type { NoteSummary } from "@/types";

function note(partial: Partial<NoteSummary> & Pick<NoteSummary, "path" | "title">): NoteSummary {
  return {
    filename: partial.filename ?? "x.md",
    normalizedTitle: partial.normalizedTitle ?? partial.title.toLowerCase(),
    body: partial.body ?? `${partial.title}\n`,
    preview: partial.preview ?? "",
    updatedAt: partial.updatedAt ?? 0,
    createdAt: partial.createdAt ?? 0,
    ...partial,
  };
}

describe("noteIndex", () => {
  describe("buildNoteIndex", () => {
    it("maps backlinks between linked notes", () => {
      const a = note({ path: "pages/a.md", title: "Alpha", body: "Alpha\n\n[Bravo]\n", normalizedTitle: "alpha" });
      const b = note({ path: "pages/b.md", title: "Bravo", body: "Bravo\n", normalizedTitle: "bravo" });
      const idx = buildNoteIndex([a, b]);
      const alphaEntry = idx.entries.get("pages/a.md");
      const bravoEntry = idx.entries.get("pages/b.md");
      expect(alphaEntry?.outgoing.map((n) => n.title)).toEqual(["Bravo"]);
      expect(bravoEntry?.backlinks.map((n) => n.title)).toEqual(["Alpha"]);
    });

    it("lists sorted link suggestions by title", () => {
      const z = note({ path: "pages/z.md", title: "Zed", body: "Z\n" });
      const a = note({ path: "pages/a.md", title: "Amy", body: "A\n" });
      const titles = buildNoteIndex([z, a]).suggestions.map((s) => s.title);
      expect(titles).toEqual(["Amy", "Zed"]);
    });
  });

  describe("searchNotes", () => {
    it("returns all notes for empty query", () => {
      const notes = [note({ path: "pages/a.md", title: "A", body: "x" })];
      expect(searchNotes(notes, "   ")).toEqual(notes);
    });

    it("filters case-insensitively by title, filename, or body", () => {
      const notes = [
        note({ path: "pages/hidden.md", title: "T", body: "needle in body", filename: "hidden.md" }),
        note({ path: "pages/other.md", title: "Other", body: "nope" }),
      ];
      expect(searchNotes(notes, "NEEDLE")).toHaveLength(1);
      expect(searchNotes(notes, "hidden")).toHaveLength(1);
      expect(searchNotes(notes, "other")).toHaveLength(1);
    });
  });
});
