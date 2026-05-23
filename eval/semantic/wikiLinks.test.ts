import { describe, expect, it } from "vitest";

import { buildSemanticEvalWikiLinks } from "./wikiLinks.js";

describe("buildSemanticEvalWikiLinks", () => {
  it("links documents that are relevant to the same query", () => {
    const links = buildSemanticEvalWikiLinks(
      [
        { id: "a", title: "Alpha", text: "Alpha body" },
        { id: "b", title: "Bravo", text: "Bravo body" },
        { id: "c", title: "Charlie", text: "Charlie body" },
      ],
      [
        { id: "q1", text: "shared topic", relevant: { a: 1, b: 1 } },
      ],
    );

    expect(links.get("a")).toEqual(["Bravo"]);
    expect(links.get("b")).toEqual(["Alpha"]);
    expect(links.has("c")).toBe(false);
  });

  it("links documents when the source text mentions another note title", () => {
    const links = buildSemanticEvalWikiLinks(
      [
        { id: "a", title: "Alpha", text: "See Bravo Topic for background." },
        { id: "b", title: "Bravo Topic", text: "Bravo body" },
      ],
      [],
    );

    expect(links.get("a")).toEqual(["Bravo Topic"]);
    expect(links.has("b")).toBe(false);
  });

  it("does not create links for missing relevant documents", () => {
    const links = buildSemanticEvalWikiLinks(
      [{ id: "a", title: "Alpha", text: "Alpha body" }],
      [{ id: "q1", text: "ghost", relevant: { a: 1, ghost: 1 } }],
    );

    expect(links.has("a")).toBe(false);
  });
});
