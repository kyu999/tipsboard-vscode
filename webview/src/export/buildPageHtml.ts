import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import markdownItTaskLists from "markdown-it-task-lists";
import multimdTable from "markdown-it-multimd-table";
import texmath from "markdown-it-texmath";
import katex from "katex";

import { findMermaidBlocks } from "@/editor/tipsboard-mermaid";
import { imageLayoutInlineStyle, parseMarkdownImageAlt } from "@/domain/markdown/imageSyntax";
import mermaid from "mermaid";
import {
  applyDesktopImagePreprocessors,
  applyVaultImageExportPreprocessors,
  buildExportTitleAndTagsFragment,
  escapeHtml,
  splitLeadingTitleAndTagLines,
} from "@/export/exportMarkdownPreprocess";

let mermaidInitialized = false;
let mermaidRenderSeq = 0;

function ensureExportMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
  });
  mermaidInitialized = true;
}

let mdInstance: MarkdownIt | null = null;

function installExportMarkdownRenderers(md: MarkdownIt): void {
  const open = md.renderer.rules.table_open;
  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    const inner = open?.(tokens, idx, options, env, self) ?? self.renderToken(tokens, idx, options);
    return `<div class="tipsboard-export-table-wrap">\n${inner}`;
  };

  const close = md.renderer.rules.table_close;
  md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
    const inner = close?.(tokens, idx, options, env, self) ?? self.renderToken(tokens, idx, options);
    return `${inner}\n</div>`;
  };

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx] as Token;
    const parsed = parseMarkdownImageAlt(token.content);
    token.content = parsed.alt;
    token.attrSet("alt", parsed.alt);

    const layoutStyle = imageLayoutInlineStyle(parsed.options);
    if (layoutStyle) {
      token.attrJoin("style", layoutStyle);
    }

    const inner = self.renderToken(tokens, idx, options);
    if (parsed.options.align) {
      return `<span style="display: block; text-align: ${parsed.options.align};">${inner}</span>`;
    }
    return inner;
  };
}

function getMarkdownIt(): MarkdownIt {
  if (!mdInstance) {
    mdInstance = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: false,
      breaks: false,
    })
      .use(multimdTable)
      .use(markdownItTaskLists, { enabled: true, label: true })
      .use(texmath, {
        engine: katex,
        delimiters: ["dollars", "brackets"],
        outerSpace: true,
        katexOptions: {
          strict: "ignore",
          throwOnError: false,
          trust: false,
        },
      });
    installExportMarkdownRenderers(mdInstance);
  }
  return mdInstance;
}

function renderMarkdownSlice(slice: string): string {
  if (!slice.trim()) {
    return "";
  }
  return getMarkdownIt().render(slice.endsWith("\n") ? slice : `${slice}\n`);
}

/** Vault 画像プリプロセスを挟まない Markdown の同期レンダリング（アプリ同梱ガイドなど）。 */
export function renderBundledMarkdown(markdown: string): string {
  return renderMarkdownSlice(markdown);
}

async function renderMermaidToHtml(code: string): Promise<string> {
  ensureExportMermaid();
  const renderId = `tipsboard-export-mermaid-${Date.now()}-${mermaidRenderSeq}`;
  mermaidRenderSeq += 1;
  try {
    const { svg } = await mermaid.render(renderId, code.trim());
    return `<div class="tipsboard-export-mermaid">${svg}</div>`;
  } catch (_error: unknown) {
    const escaped = escapeHtml(code);
    return `<pre class="tipsboard-export-mermaid-error"><code>${escaped}</code></pre>`;
  }
}

/** Mermaid ブロックでは html:false が生 HTML を潰すため、分割結合する。 */
async function renderBodyMarkdownWithInlinedMermaid(
  markdown: string,
  preprocessMarkdown: (md: string) => string,
): Promise<string> {
  const blocks = [...findMermaidBlocks(markdown)].sort((a, b) => a.from - b.from);
  if (blocks.length === 0) {
    return renderMarkdownSlice(preprocessMarkdown(markdown));
  }

  ensureExportMermaid();

  const fragments: string[] = [];
  let cursor = 0;

  for (const block of blocks) {
    if (block.from > cursor) {
      const mdSlice = preprocessMarkdown(markdown.slice(cursor, block.from));
      fragments.push(renderMarkdownSlice(mdSlice));
    }
    fragments.push(await renderMermaidToHtml(block.code));
    cursor = block.to;
  }

  if (cursor < markdown.length) {
    const mdSlice = preprocessMarkdown(markdown.slice(cursor));
    fragments.push(renderMarkdownSlice(mdSlice));
  }

  return fragments.join("\n");
}

const EXPORT_CSS = `
:root { color-scheme: light; }
body {
  margin: 0;
  padding: 1.5rem 0 2rem;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    "Segoe UI",
    "Helvetica Neue",
    Hiragino Sans,
    "Noto Sans JP",
    sans-serif;
  color: #243026;
  background: #fff;
}
.tipsboard-export-shell {
  box-sizing: border-box;
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  padding-left: 1rem;
  padding-right: 1rem;
}
@media (min-width: 640px) {
  .tipsboard-export-shell {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }
}
@media (min-width: 1024px) {
  .tipsboard-export-shell {
    padding-left: 2rem;
    padding-right: 2rem;
  }
}
main.tipsboard-export-inner {
  max-width: 64rem;
  margin: 0 auto;
  min-width: 0;
  box-sizing: border-box;
}
article.tipsboard-export-article {
  box-sizing: border-box;
  min-width: 0;
  font-size: 15px;
  line-height: 1.85;
  color: #243026;
  background: transparent;
  padding: 28px 32px 24px calc(12px + 2.75rem + 10px + 1px + 32px);
}
article.tipsboard-export-article a {
  color: #087f36;
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}
article.tipsboard-export-article p {
  margin: 0 0 0.45em 0;
}
article.tipsboard-export-article p:last-child {
  margin-bottom: 0;
}
article.tipsboard-export-article h1:not(.tipsboard-export-page-title),
article.tipsboard-export-article h2,
article.tipsboard-export-article h3,
article.tipsboard-export-article h4,
article.tipsboard-export-article h5,
article.tipsboard-export-article h6 {
  margin: 0.85em 0 0.35em 0;
  font-weight: 700;
}
article.tipsboard-export-article h1:first-child,
article.tipsboard-export-article h2:first-child,
article.tipsboard-export-article h3:first-child {
  margin-top: 0;
}
article.tipsboard-export-article h1:not(.tipsboard-export-page-title) {
  font-size: 1.5em;
  line-height: 1.4;
}
article.tipsboard-export-article h2 {
  font-size: 1.3em;
  line-height: 1.4;
}
article.tipsboard-export-article h3 {
  font-size: 1.15em;
  line-height: 1.4;
}
article.tipsboard-export-article h4 {
  font-size: 1.08em;
  font-weight: 700;
}
article.tipsboard-export-article h5 {
  font-size: 1em;
  font-weight: 600;
}
article.tipsboard-export-article h6 {
  font-size: 0.95em;
  font-weight: 600;
  color: #748075;
}
article.tipsboard-export-article strong,
article.tipsboard-export-article b {
  font-weight: bold;
}
article.tipsboard-export-article em,
article.tipsboard-export-article i:not(.tipsboard-export-tag) {
  font-style: italic;
}
.tipsboard-export-page-title {
  margin: 0 0 10px 0;
  padding: 1px 0 12px 0;
  font-size: 1.48em;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.02em;
  color: #243026;
  border-bottom: 1px solid rgba(8, 127, 54, 0.1);
  display: block;
  width: 100%;
}
.tipsboard-export-tags {
  margin: 0 0 12px 0;
  line-height: 1.55;
}
.tipsboard-export-tag {
  display: inline-block;
  margin: 0 0.65rem 0.35rem 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #6b7f2a;
}
article.tipsboard-export-article ul:not(.contains-task-list),
article.tipsboard-export-article ol {
  margin: 0.35em 0 0.5em;
  padding-left: 1.45em;
}
article.tipsboard-export-article li {
  margin: 2px 0;
}
article.tipsboard-export-article ul:not(.contains-task-list) > li::marker {
  color: #087f36;
  font-size: 0.9em;
}
article.tipsboard-export-article ol > li::marker {
  color: #087f36;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
article hr {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  margin: 10px 0;
  padding: 6px 0;
  border: none;
  border-top: 1px solid rgba(8,127,54,0.18);
}
.tipsboard-export-table-wrap {
  box-sizing: border-box;
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  margin: 8px 0;
  border: 1px solid rgba(8,127,54,0.14);
  border-radius: 10px;
  background-color: #fff;
}
.tipsboard-export-table-wrap table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.92em;
  line-height: 1.55;
}
.tipsboard-export-table-wrap th {
  background-color: #fff;
  color: #243026;
  font-weight: 700;
}
.tipsboard-export-table-wrap thead th {
  border-bottom: 2px solid rgba(8,127,54,0.16);
}
.tipsboard-export-table-wrap td {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.tipsboard-export-table-wrap td,
.tipsboard-export-table-wrap th {
  border-bottom: 1px solid rgba(8,127,54,0.10);
  border-right: 1px solid rgba(8,127,54,0.10);
  padding: 6px 10px;
  vertical-align: top;
}
.tipsboard-export-table-wrap tr:last-child td {
  border-bottom: none;
}
.tipsboard-export-table-wrap td:last-child,
.tipsboard-export-table-wrap th:last-child {
  border-right: none;
}
article.tipsboard-export-article blockquote {
  margin: 0.5em 0;
  padding: 0 0 0 10px;
  border-left: 3px solid #5b8f3a;
  color: #526257;
  font-style: italic;
}
article.tipsboard-export-article pre {
  overflow: auto;
  margin: 0.5em 0;
  padding: 0.75em 1em;
  border-radius: 6px;
  background: #f2efe5;
  border: 1px solid rgba(8,127,54,0.12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.95em;
  line-height: 1.55;
}
article.tipsboard-export-article pre code {
  font-size: inherit;
  line-height: inherit;
}
article.tipsboard-export-article code:not(pre code) {
  padding: 0 3px;
  border-radius: 5px;
  background-color: #f2efe5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: inherit;
}
article.tipsboard-export-article img {
  display: inline-block;
  max-width: 100%;
  max-height: 16rem;
  height: auto;
  border-radius: 0.25rem;
  margin: 0.25rem 0;
  vertical-align: middle;
}
article.tipsboard-export-article .katex-display {
  display: block;
  overflow-x: auto;
  overflow-y: visible;
  margin: 1em 0;
  padding: 0.25rem 0;
}
article.tipsboard-export-article .katex {
  font-size: 1em;
}
ul.contains-task-list {
  list-style: none;
  padding-left: 1.25rem;
}
.task-list-item { margin: 0.25rem 0; }
.tipsboard-export-mermaid {
  box-sizing: border-box;
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  contain: inline-size;
  overflow-x: auto;
  margin: 10px 0;
  padding: 16px;
  background-color: #fff;
}
.tipsboard-export-mermaid svg {
  box-sizing: border-box;
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  overflow: hidden;
}
.tipsboard-export-mermaid-error {
  color: #c8473f;
  font-size: 0.88em;
  white-space: pre-wrap;
  word-break: break-word;
}
@media print {
  body { padding: 0; background: white; color: black; }
  .tipsboard-export-shell {
    max-width: none;
    padding-left: 0;
    padding-right: 0;
  }
  main.tipsboard-export-inner {
    max-width: none;
  }
}
`.trim();

const KATEX_CDN_BASE = "https://cdn.jsdelivr.net/npm/katex@0.16.46/dist";

export interface BuildStandalonePageHtmlOptions {
  title: string;
  bodyMarkdown: string;
  /** 指定時は Vault 画像 `assets/images/...` の `src` をこの戻り値に差し替えてからレンダーする。 */
  resolveVaultImageSrcSync?: (relativePath: string) => string;
}

export async function buildStandalonePageHtml(options: BuildStandalonePageHtmlOptions): Promise<string> {
  const { title, bodyMarkdown, resolveVaultImageSrcSync } = options;

  const preprocessMarkdown =
    resolveVaultImageSrcSync !== undefined
      ? (md: string) => applyVaultImageExportPreprocessors(md, resolveVaultImageSrcSync)
      : applyDesktopImagePreprocessors;

  const split = splitLeadingTitleAndTagLines(bodyMarkdown);
  const titleBlock = buildExportTitleAndTagsFragment(split);
  const bodyFragment =
    split.remainderMarkdown.length > 0
      ? await renderBodyMarkdownWithInlinedMermaid(split.remainderMarkdown, preprocessMarkdown)
      : "";
  const fragment = `${titleBlock}\n${bodyFragment}`.trim();

  const documentTitleRaw =
    split.titleLine.trim().length > 0 ? split.titleLine.trim() : title.trim() || "Untitled";

  const safeTitle = escapeHtml(documentTitleRaw);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${safeTitle}</title>
<link rel="stylesheet" crossorigin href="${KATEX_CDN_BASE}/katex.min.css" />
<style>${EXPORT_CSS}</style>
</head>
<body>
<div class="tipsboard-export-shell">
<main class="tipsboard-export-inner">
<article class="tipsboard-export-article">
${fragment}
</article>
</main>
</div>
</body>
</html>
`;
}
