import { describe, expect, it } from "vitest";

import { buildStandalonePageHtml, renderBundledMarkdown } from "./buildPageHtml";

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

  it("renders compact image layout options without leaking them into alt text", () => {
    for (const [suffix, textAlign] of [
      ["5l", "left"],
      ["5c", "center"],
      ["5r", "right"],
    ] as const) {
      const html = renderBundledMarkdown(`![Logo|${suffix}](https://example.com/logo.png)\n`);
      expect(html).toContain('alt="Logo"');
      expect(html).not.toContain(`Logo|${suffix}`);
      expect(html).toContain('style="width: 50%; height: auto; max-height: none;"');
      expect(html).toContain(`text-align: ${textAlign};`);
    }
  });
});

describe("buildStandalonePageHtml", () => {
  it("keeps image layout options after rewriting vault image sources", async () => {
    const html = await buildStandalonePageHtml({
      title: "Note",
      bodyMarkdown: "Title\n![Logo|5c](assets/images/logo.png)\n",
      resolveVaultImageSrcSync: () => "data:image/png;base64,QQ",
    });

    expect(html).toContain('src="data:image/png;base64,QQ"');
    expect(html).toContain('alt="Logo"');
    expect(html).not.toContain("Logo|5c");
    expect(html).toContain('style="width: 50%; height: auto; max-height: none;"');
    expect(html).toContain('text-align: center;');
  });
});
