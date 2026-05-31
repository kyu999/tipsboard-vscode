import { describe, expect, it } from "vitest";

import { aggregateNearNotes } from "./nearNotes";
import type { NoteSummary, SemanticSearchResult } from "@/types";

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

function result(partial: Partial<SemanticSearchResult> & Pick<SemanticSearchResult, "path" | "score">): SemanticSearchResult {
  return {
    title: partial.title ?? partial.path,
    heading: partial.heading ?? "",
    snippet: partial.snippet ?? "",
    startLine: partial.startLine ?? 1,
    endLine: partial.endLine ?? 1,
    ...partial,
  };
}

describe("aggregateNearNotes", () => {
  it("excludes the source note and already linked notes", () => {
    const notes = [
      note({ path: "source.md", title: "Source" }),
      note({ path: "linked.md", title: "Linked" }),
      note({ path: "near.md", title: "Near" }),
    ];

    const nearNotes = aggregateNearNotes({
      results: [
        result({ path: "source.md", score: 0.99 }),
        result({ path: "linked.md", score: 0.95 }),
        result({ path: "near.md", score: 0.8, heading: "Useful section", snippet: "Relevant context follows." }),
      ],
      notes,
      sourcePath: "source.md",
      linkedPaths: new Set(["linked.md"]),
    });

    expect(nearNotes.map((item) => item.note.path)).toEqual(["near.md"]);
    expect(nearNotes[0]?.heading).toBe("Useful section");
    expect(nearNotes[0]?.snippet).toBe("Relevant context follows.");
  });

  it("deduplicates chunks by path and orders by the best score", () => {
    const notes = [
      note({ path: "source.md", title: "Source" }),
      note({ path: "a.md", title: "Alpha" }),
      note({ path: "b.md", title: "Bravo" }),
    ];

    const nearNotes = aggregateNearNotes({
      results: [
        result({ path: "a.md", score: 0.4 }),
        result({ path: "b.md", score: 0.7 }),
        result({ path: "a.md", score: 0.9 }),
      ],
      notes,
      sourcePath: "source.md",
    });

    expect(nearNotes).toEqual([
      { note: notes[1], score: 0.9, heading: "", snippet: "" },
      { note: notes[2], score: 0.7, heading: "", snippet: "" },
    ]);
  });

  it("filters weak semantic matches by minimum score", () => {
    const notes = [
      note({ path: "source.md", title: "Source" }),
      note({ path: "weak.md", title: "Weak" }),
      note({ path: "strong.md", title: "Strong" }),
    ];

    const nearNotes = aggregateNearNotes({
      results: [
        result({ path: "weak.md", score: 0.44 }),
        result({ path: "strong.md", score: 0.45 }),
      ],
      notes,
      sourcePath: "source.md",
    });

    expect(nearNotes.map((item) => item.note.path)).toEqual(["strong.md"]);
  });

  it("normalizes path separators before comparing paths", () => {
    const notes = [
      note({ path: "source.md", title: "Source" }),
      note({ path: "folder/near.md", title: "Near" }),
    ];

    const nearNotes = aggregateNearNotes({
      results: [result({ path: "folder\\near.md", score: 0.8 })],
      notes,
      sourcePath: "source.md",
      linkedPaths: new Set(["folder/near.md"]),
    });

    expect(nearNotes).toEqual([]);
  });
});
