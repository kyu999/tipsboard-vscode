import { describe, expect, it } from "vitest";

import { renderBundledMarkdown } from "./buildPageHtml";

describe("renderBundledMarkdown (markdown-it + KaTeX)", () => {
  it("emits KaTeX spans for \\( ... \\) inline math", () => {
    const html = renderBundledMarkdown("inline \\( x^2 + y^2 = z^2 \\) done\n");
    expect(html).toMatch(/class="katex/);
  });

  it("emits KaTeX display wrapper for $$ blocks", () => {
    const html = renderBundledMarkdown("$$\n \\sum_{k=1}^n k\n$$\n");
    expect(html).toContain("katex-display");
  });

  it("handles multi-line dollar blocks between opening and closing $$", () => {
    const markdown = "\n$$\nf(x)=x^2\n$$\n";
    const html = renderBundledMarkdown(markdown);
    expect(html).toContain("katex-display");
    expect(html).toContain("x^2");
  });

  it("still renders plain paragraphs without math", () => {
    const html = renderBundledMarkdown("Hello **world**.\n");
    expect(html).toContain("<strong>world</strong>");
  });
});
