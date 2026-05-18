import { describe, expect, it } from "vitest";

import { extractTitle, normalizeTitle } from "./title";

describe("title domain", () => {
  describe("extractTitle", () => {
    it("uses first line trimmed", () => {
      expect(extractTitle("Hello\nbody")).toBe("Hello");
    });

    it("returns Untitled for empty or whitespace", () => {
      expect(extractTitle("")).toBe("Untitled");
      expect(extractTitle("  \n")).toBe("Untitled");
    });
  });

  describe("normalizeTitle", () => {
    it("matches vault-style normalization for links", () => {
      expect(normalizeTitle("  Foo  BAR  ")).toBe("foo bar");
    });
  });
});
