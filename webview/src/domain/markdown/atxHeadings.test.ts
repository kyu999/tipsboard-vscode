import { describe, expect, it } from "vitest";
import { extractAtxHeadings } from "./atxHeadings";

describe("extractAtxHeadings", () => {
  it("extracts ATX headings at each level", () => {
    const body = ["# One", "## Two", "### Three", "#### Four", "##### Five", "###### Six"].join("\n");
    const headings = extractAtxHeadings(body);
    expect(headings).toEqual([
      { level: 1, text: "One", lineNumber: 1 },
      { level: 2, text: "Two", lineNumber: 2 },
      { level: 3, text: "Three", lineNumber: 3 },
      { level: 4, text: "Four", lineNumber: 4 },
      { level: 5, text: "Five", lineNumber: 5 },
      { level: 6, text: "Six", lineNumber: 6 },
    ]);
  });

  it("supports Japanese headings", () => {
    const headings = extractAtxHeadings("## 報告書\n### 詳細\n");
    expect(headings).toEqual([
      { level: 2, text: "報告書", lineNumber: 1 },
      { level: 3, text: "詳細", lineNumber: 2 },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const body = ["## Real", "```", "# Inner", "```", "## After"].join("\n");
    expect(extractAtxHeadings(body)).toEqual([
      { level: 2, text: "Real", lineNumber: 1 },
      { level: 2, text: "After", lineNumber: 5 },
    ]);
  });

  it("does not treat tag lines as headings", () => {
    const body = ["Title", "#work", "#idea #draft", "## Section"].join("\n");
    expect(extractAtxHeadings(body)).toEqual([{ level: 2, text: "Section", lineNumber: 4 }]);
  });

  it("strips inline tags from heading labels", () => {
    const headings = extractAtxHeadings("## 見出し #inline\n");
    expect(headings).toEqual([{ level: 2, text: "見出し", lineNumber: 1 }]);
  });

  it("omits headings whose label is only tags", () => {
    expect(extractAtxHeadings("## #onlytag\n")).toEqual([]);
  });

  it("strips trailing closing hashes", () => {
    expect(extractAtxHeadings("## Closed ##\n")).toEqual([{ level: 2, text: "Closed", lineNumber: 1 }]);
  });

  it("ignores escaped hash lines", () => {
    expect(extractAtxHeadings("\\# Not a heading\n## Real\n")).toEqual([
      { level: 2, text: "Real", lineNumber: 2 },
    ]);
  });

  it("strips markdown link and emphasis syntax from heading labels", () => {
    const line =
      "## [B3-5: GeoAI Framework]（[論文あり](assets/files/B3-5.pdf)） **bold**";
    expect(extractAtxHeadings(line)).toEqual([
      {
        level: 2,
        text: "B3-5: GeoAI Framework（論文あり） bold",
        lineNumber: 1,
      },
    ]);
  });
});
