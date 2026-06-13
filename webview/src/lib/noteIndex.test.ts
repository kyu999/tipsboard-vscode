import { describe, expect, it } from "vitest";

import { buildNoteIndex, isLinkIsolated, patchNoteIndex, searchNotes } from "./noteIndex";
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

    it("keeps duplicate title candidates and links to all matching notes", () => {
      const source = note({
        path: "docs/source.md",
        title: "Source",
        body: "Source\n\n[Overview]\n",
        normalizedTitle: "source",
      });
      const authOverview = note({
        path: "docs/auth/overview.md",
        title: "Overview",
        body: "Overview\n",
        normalizedTitle: "overview",
      });
      const apiOverview = note({
        path: "docs/api/overview.md",
        title: "Overview",
        body: "Overview\n",
        normalizedTitle: "overview",
      });

      const idx = buildNoteIndex([source, authOverview, apiOverview]);

      expect(idx.byNormalizedTitle.get("overview")?.map((n) => n.path).sort()).toEqual([
        "docs/api/overview.md",
        "docs/auth/overview.md",
      ]);
      expect(idx.entries.get("docs/source.md")?.outgoing.map((n) => n.path).sort()).toEqual([
        "docs/api/overview.md",
        "docs/auth/overview.md",
      ]);
      expect(idx.entries.get("docs/auth/overview.md")?.backlinks.map((n) => n.path)).toEqual(["docs/source.md"]);
      expect(idx.entries.get("docs/api/overview.md")?.backlinks.map((n) => n.path)).toEqual(["docs/source.md"]);
      expect(idx.suggestions.filter((s) => s.title === "Overview")).toEqual([
        {
          title: "Overview",
          filename: "x.md",
          path: "docs/api/overview.md",
          duplicateTitle: true,
        },
        {
          title: "Overview",
          filename: "x.md",
          path: "docs/auth/overview.md",
          duplicateTitle: true,
        },
      ]);
    });

    it("detects notes without outgoing links or backlinks as link-isolated", () => {
      const isolated = note({ path: "pages/isolated.md", title: "Isolated" });
      const linked = note({ path: "pages/linked.md", title: "Linked", body: "Linked\n\n[Target]\n" });
      const target = note({ path: "pages/target.md", title: "Target", normalizedTitle: "target" });
      const idx = buildNoteIndex([isolated, linked, target]);

      expect(isLinkIsolated(idx.entries.get("pages/isolated.md"))).toBe(true);
      expect(isLinkIsolated(idx.entries.get("pages/linked.md"))).toBe(false);
      expect(isLinkIsolated(idx.entries.get("pages/target.md"))).toBe(false);
    });

    it("patchNoteIndex matches full rebuild after body edit", () => {
      const a = note({ path: "pages/a.md", title: "Alpha", body: "Alpha\n\n[Bravo]\n", normalizedTitle: "alpha" });
      const b = note({ path: "pages/b.md", title: "Bravo", body: "Bravo\n", normalizedTitle: "bravo" });
      const c = note({ path: "pages/c.md", title: "Charlie", body: "Charlie\n\n[Bravo]\n", normalizedTitle: "charlie" });
      const notes = [a, b, c];
      const index = buildNoteIndex(notes);
      const nextA = { ...a, body: "Alpha\n\n[Charlie]\n" };
      const merged = [nextA, b, c];
      const patched = patchNoteIndex(index, merged, a, nextA);
      const rebuilt = buildNoteIndex(merged);
      expect(patched).toEqual(rebuilt);
    });

    it("patchNoteIndex matches full rebuild after title change", () => {
      const a = note({ path: "pages/a.md", title: "Alpha", body: "Alpha\n", normalizedTitle: "alpha" });
      const b = note({ path: "pages/b.md", title: "Beta", body: "Beta\n\n[Alpha]\n", normalizedTitle: "beta" });
      const notes = [a, b];
      const index = buildNoteIndex(notes);
      const nextA = {
        ...a,
        title: "Aleph",
        normalizedTitle: "aleph",
        body: "Aleph\n",
      };
      const merged = [nextA, b];
      const patched = patchNoteIndex(index, merged, a, nextA);
      const rebuilt = buildNoteIndex(merged);
      expect(patched).toEqual(rebuilt);
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
