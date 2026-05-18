import { describe, expect, it } from "vitest";

import { extractLinks } from "./links";

describe("extractLinks", () => {
  it("collects internal wiki-style links", () => {
    const body = "Intro\n\nSee [Other Page] for more.\n";
    expect(extractLinks(body)).toEqual([{ title: "Other Page", type: "internal" }]);
  });

  it("skips lines inside fenced code blocks", () => {
    const body = "Before\n```\n#tag [Ghost]\n```\nAfter [Real]\n";
    expect(extractLinks(body)).toEqual([{ title: "Real", type: "internal" }]);
  });

  it("collects hashtags as tag links", () => {
    const body = "Line with #work and #deep-dive\n";
    const links = extractLinks(body);
    expect(links).toContainEqual({ title: "work", type: "tag" });
    expect(links).toContainEqual({ title: "deep-dive", type: "tag" });
  });

  it("dedupes repeated titles", () => {
    const body = "[Same][Same]\n";
    expect(extractLinks(body)).toEqual([{ title: "Same", type: "internal" }]);
  });
});
