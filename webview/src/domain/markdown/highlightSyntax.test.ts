import { describe, expect, it } from "vitest";

import { parseHighlightColorPrefix, stripHighlightColorPrefix } from "./highlightSyntax";

describe("parseHighlightColorPrefix", () => {
  it("defaults to yellow without a color prefix", () => {
    expect(parseHighlightColorPrefix("plain text")).toEqual({ color: "yellow", prefixLength: 0 });
  });

  it("reads a known color prefix and optional spaces after the colon", () => {
    expect(parseHighlightColorPrefix("red:danger")).toEqual({ color: "red", prefixLength: 4 });
    expect(parseHighlightColorPrefix("blue: info")).toEqual({ color: "blue", prefixLength: 6 });
  });

  it("treats unknown names, uppercase, and empty bodies as plain text", () => {
    expect(parseHighlightColorPrefix("TODO: fix").prefixLength).toBe(0);
    expect(parseHighlightColorPrefix("Red:text").prefixLength).toBe(0);
    expect(parseHighlightColorPrefix("red:").prefixLength).toBe(0);
    expect(parseHighlightColorPrefix("red:  ").prefixLength).toBe(0);
  });
});

describe("stripHighlightColorPrefix", () => {
  it("removes only a recognized color prefix", () => {
    expect(stripHighlightColorPrefix("green:ok")).toBe("ok");
    expect(stripHighlightColorPrefix("note:kept")).toBe("note:kept");
  });
});
