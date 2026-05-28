import { describe, expect, it } from "vitest";

import { imageLayoutInlineStyle, imageWidthPercent, parseMarkdownImageAlt } from "./imageSyntax";

describe("parseMarkdownImageAlt", () => {
  it("extracts width and alignment from a compact alt suffix", () => {
    expect(parseMarkdownImageAlt("logo|5c")).toEqual({
      alt: "logo",
      options: { widthUnits: 5, align: "center" },
    });
    expect(parseMarkdownImageAlt("logo|10r")).toEqual({
      alt: "logo",
      options: { widthUnits: 10, align: "right" },
    });
  });

  it("allows width-only and alignment-only suffixes", () => {
    expect(parseMarkdownImageAlt("logo|5")).toEqual({
      alt: "logo",
      options: { widthUnits: 5, align: undefined },
    });
    expect(parseMarkdownImageAlt("logo|c")).toEqual({
      alt: "logo",
      options: { widthUnits: undefined, align: "center" },
    });
  });

  it("only treats the final pipe segment as an option token", () => {
    expect(parseMarkdownImageAlt("a|b|5c")).toEqual({
      alt: "a|b",
      options: { widthUnits: 5, align: "center" },
    });
  });

  it("leaves invalid suffixes as normal alt text", () => {
    for (const alt of ["logo|0", "logo|11", "logo|5x", "logo|50%", "a|b"]) {
      expect(parseMarkdownImageAlt(alt)).toEqual({ alt, options: {} });
    }
  });
});

describe("imageWidthPercent", () => {
  it("converts width units to container percentages", () => {
    expect(imageWidthPercent(1)).toBe("10%");
    expect(imageWidthPercent(10)).toBe("100%");
  });
});

describe("imageLayoutInlineStyle", () => {
  it("sets width and auto height without max-height cap", () => {
    expect(imageLayoutInlineStyle({ widthUnits: 10, align: "center" })).toBe(
      "width: 100%; height: auto; max-height: none;",
    );
  });

  it("returns undefined when width is not specified", () => {
    expect(imageLayoutInlineStyle({ align: "center" })).toBeUndefined();
  });
});
