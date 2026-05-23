import { describe, expect, it } from "vitest";

import { markdownForSemanticEvalDocument } from "./wikiMarkdown.js";

describe("markdownForSemanticEvalDocument", () => {
  it("formats source text as wiki-like Markdown with h1 through h5 sections", () => {
    const markdown = markdownForSemanticEvalDocument({
      datasetName: "Dataset",
      sourceUrl: "https://example.test/dataset",
      id: "doc-1",
      title: "Sample Page",
      text: ["Sample intro.", "概要.", "Body paragraph.", "詳細.", "More detail."].join("\n"),
      relatedTitles: ["Related Page"],
    });

    expect(markdown).toContain("Sample Page\n\n# Overview");
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("### Body");
    expect(markdown).toContain("#### 概要");
    expect(markdown).toContain("#### Related Notes");
    expect(markdown).toContain("- [Related Page]");
    expect(markdown).toContain("##### Dataset Metadata");
  });

  it("keeps dataset metadata at the end of the note", () => {
    const markdown = markdownForSemanticEvalDocument({
      datasetName: "Dataset",
      sourceUrl: "https://example.test/dataset",
      id: "doc-2",
      title: "Metadata Page",
      text: "Body text.",
      relatedTitles: [],
    });

    expect(markdown.trimEnd().endsWith("- Document ID: doc-2")).toBe(true);
  });
});
