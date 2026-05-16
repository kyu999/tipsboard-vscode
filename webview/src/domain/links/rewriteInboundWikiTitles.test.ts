import { describe, expect, it } from "vitest";
import { normalizeTitle } from "@/domain/title/title";
import {
  rewriteInboundWikiTitles,
  wouldRewriteInboundWikiTitles,
} from "./rewriteInboundWikiTitles";

describe("rewriteInboundWikiTitles", () => {
  it("leaves fenced code untouched", () => {
    const body = "```\n[Old Title]\n```";
    expect(rewriteInboundWikiTitles(body, normalizeTitle("Old Title"), "New")).toBe(body);
  });

  it("does not touch external brackets with trailing URL", () => {
    const line = "[label https://example.com]";
    expect(rewriteInboundWikiTitles(line, normalizeTitle("label"), "New")).toBe(line);
  });

  it("rewrites simple internal link display", () => {
    expect(rewriteInboundWikiTitles("See [Old Title].", normalizeTitle("Old Title"), "New Title")).toBe(
      "See [New Title].",
    );
  });

  it("rewrites casing variants when normalizeTitle matches", () => {
    const norm = normalizeTitle("Old Title");
    expect(norm).toBe(normalizeTitle("old title"));
    expect(rewriteInboundWikiTitles("[OLD  TITLE]", norm, "New")).toBe("[New]");
  });

  it("rewrites icon syntax preserving count", () => {
    const oldNorm = normalizeTitle("Foo");
    expect(rewriteInboundWikiTitles("[Foo.icon*2] end", oldNorm, "Bar")).toBe("[Bar.icon*2] end");
  });

  it("handles multiple brackets on one line", () => {
    const n = normalizeTitle("A");
    expect(rewriteInboundWikiTitles("[A] then [a] done", n, "X")).toBe("[X] then [X] done");
  });

  it("leaves unrelated internal links unchanged", () => {
    expect(rewriteInboundWikiTitles("[Other]", normalizeTitle("Target"), "X")).toBe("[Other]");
  });

  it("wouldRewrite is false when no match", () => {
    expect(wouldRewriteInboundWikiTitles("[X]", normalizeTitle("Y"), "Z")).toBe(false);
    expect(wouldRewriteInboundWikiTitles("[Y]", normalizeTitle("Y"), "Z")).toBe(true);
  });
});
