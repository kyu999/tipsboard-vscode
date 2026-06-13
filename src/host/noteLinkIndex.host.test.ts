import { describe, expect, it } from "vitest";

import { buildNoteLinkIndex, findInboundNotePaths, patchNoteLinkIndex } from "./noteLinkIndex.js";

describe("noteLinkIndex", () => {
  it("tracks inbound wiki links by normalized title", () => {
    const index = buildNoteLinkIndex([
      { path: "pages/a.md", body: "Alpha\n" },
      { path: "pages/b.md", body: "Beta\n\n[Alpha]\n" },
    ]);

    expect(findInboundNotePaths(index, "alpha")).toEqual(["pages/b.md"]);
  });

  it("patches inbound links when a note body changes", () => {
    const initial = buildNoteLinkIndex([
      { path: "pages/a.md", body: "Alpha\n" },
      { path: "pages/b.md", body: "Beta\n\n[Alpha]\n" },
    ]);
    const next = patchNoteLinkIndex(initial, { path: "pages/b.md", body: "Beta\n\n[Alpha]\n" }, {
      path: "pages/b.md",
      body: "Beta\n",
    });
    expect(findInboundNotePaths(next, "alpha")).toEqual([]);
  });
});
