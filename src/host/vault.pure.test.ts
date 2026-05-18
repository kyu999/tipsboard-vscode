import { describe, expect, it } from "vitest";
import {
  assertSafeRelativePath,
  buildPreview,
  normalizeTitle,
  stemFromTitle,
} from "./vault.js";

describe("vault pure helpers", () => {
  describe("normalizeTitle", () => {
    it("lowercases ASCII and collapses whitespace", () => {
      expect(normalizeTitle("  Foo  Bar  ")).toBe("foo bar");
    });

    it("normalizes full-width spaces", () => {
      expect(normalizeTitle("a\u3000b")).toBe("a b");
    });
  });

  describe("buildPreview", () => {
    it("uses non-title lines joined up to length cap", () => {
      const body = "Title\n\n  Hello  \nWorld\n";
      expect(buildPreview(body)).toBe("Hello World");
    });

    it("returns empty when only title line exists", () => {
      expect(buildPreview("OnlyTitle\n")).toBe("");
    });
  });

  describe("stemFromTitle", () => {
    it("strips illegal filename characters", () => {
      expect(stemFromTitle('A/B:C')).toBe("A B C");
    });

    it("avoids Windows reserved device names", () => {
      expect(stemFromTitle("con")).toBe("con note");
      expect(stemFromTitle("CON")).toBe("CON note");
    });

    it("truncates very long stems", () => {
      const long = "x".repeat(200);
      const s = stemFromTitle(long);
      expect(s.length).toBeLessThanOrEqual(120);
    });
  });

  describe("assertSafeRelativePath", () => {
    it("accepts pages markdown paths", () => {
      expect(() => assertSafeRelativePath("pages/Note.md")).not.toThrow();
      expect(() => assertSafeRelativePath("pages\\Note.md")).not.toThrow();
    });

    it("rejects traversal and non-pages paths", () => {
      expect(() => assertSafeRelativePath("")).toThrow("pages directory");
      expect(() => assertSafeRelativePath("../pages/Evil.md")).toThrow("pages directory");
      expect(() => assertSafeRelativePath("pages/sub/Note.md")).toThrow("pages directory");
      expect(() => assertSafeRelativePath("assets/x.md")).toThrow("pages directory");
    });
  });
});
