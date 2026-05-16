import { describe, expect, it } from "vitest";
import { cleanupPinsAfterNoteDelete, prunePinsToValidPaths } from "./pins.js";

describe("pins", () => {
  it("prunePinsToValidPaths drops missing notes and dedupes", () => {
    const state = { version: 1 as const, paths: ["pages/a.md", "pages/missing.md", "pages/a.md", "pages/b.md"] };
    const valid = new Set(["pages/a.md", "pages/b.md"]);
    expect(prunePinsToValidPaths(state, valid)).toEqual({ version: 1, paths: ["pages/a.md", "pages/b.md"] });
  });

  it("cleanupPinsAfterNoteDelete removes by normalized separators", () => {
    const state = { version: 1 as const, paths: ["pages/keep.md", "pages\\gone.md"] };
    expect(cleanupPinsAfterNoteDelete(state, "pages/gone.md")).toEqual({ version: 1, paths: ["pages/keep.md"] });
  });
});
