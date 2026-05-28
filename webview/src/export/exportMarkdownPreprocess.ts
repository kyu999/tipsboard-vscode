/** Vault 画像パスおよび HTML 出力用の内部リンク表示正規化。 */

import { parseIconSyntax } from "@/domain/links/iconSyntax";
import { MARKDOWN_IMAGE_RE } from "@/domain/markdown/imageSyntax";

/** `domain/links/links.ts` の内部リンク検出と同じ規約（標準リンク `[t](url)` は除外）。 */
const INTERNAL_LINK_RE =
  /(?<!\\)\[(?!https?:\/\/)(?!image:)([^\[\]\n]+?)\](?![\]\(])/g;

const CODE_BLOCK_FENCE_LINE = /^\s*```/;

/** `tipsboard-links.ts` の外部リンク（括弧付き Markdown ではない形式）と同じ。 */
const TIPSBOARD_SPACED_EXTERNAL_LINK_RE =
  /(?<!\\)\[([^\[\]\n]+?)\s+(https?:\/\/\S+)\](?!\()/g;
const TIPSBOARD_BRACKET_ONLY_HTTP_RE = /(?<!\\)\[(https?:\/\/\S+)\](?!\()/g;

function escapeMarkdownLinkText(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function formatMarkdownInlineLink(display: string, href: string): string {
  const text = display.trim().length > 0 ? display.trim() : href;
  const safeLabel = escapeMarkdownLinkText(text);
  const dest = /[()\s]/.test(href) ? `<${href}>` : href;
  return `[${safeLabel}](${dest})`;
}

/** コードフェンス外の `[表示名 https://…]` / `[https://…]` を Markdown 標準リンクにし、HTML 出力で正しくレンダーする。 */
export function normalizeTipsboardBracketExternalLinksForExport(markdown: string): string {
  const lines = markdown.split("\n");
  let inCodeBlock = false;
  const out: string[] = [];

  for (const line of lines) {
    if (CODE_BLOCK_FENCE_LINE.test(line)) {
      inCodeBlock = !inCodeBlock;
      out.push(line);
      continue;
    }
    if (inCodeBlock) {
      out.push(line);
      continue;
    }
    let replaced = line.replace(TIPSBOARD_SPACED_EXTERNAL_LINK_RE, (_full, labelRaw: string, hrefRaw: string) => {
      const rawLabel = labelRaw.trim();
      const display = (parseIconSyntax(rawLabel)?.title ?? rawLabel).trim();
      return formatMarkdownInlineLink(display, hrefRaw);
    });
    replaced = replaced.replace(TIPSBOARD_BRACKET_ONLY_HTTP_RE, (_full, hrefRaw: string) =>
      formatMarkdownInlineLink(hrefRaw, hrefRaw),
    );
    out.push(replaced);
  }

  return out.join("\n");
}

/** コードフェンス外の `[ページ名]` を括弧なしの表示タイトルにする。 */
export function stripInternalWikiLinksForExport(markdown: string): string {
  const lines = markdown.split("\n");
  let inCodeBlock = false;
  const out: string[] = [];

  for (const line of lines) {
    if (CODE_BLOCK_FENCE_LINE.test(line)) {
      inCodeBlock = !inCodeBlock;
      out.push(line);
      continue;
    }
    if (inCodeBlock) {
      out.push(line);
      continue;
    }
    out.push(
      line.replace(INTERNAL_LINK_RE, (fullMatch, inner: string) => {
        const raw = inner.trim();
        const parts = raw.split(/\s+/);
        const last = parts[parts.length - 1]!;
        if (last.startsWith("http://") || last.startsWith("https://")) {
          return fullMatch;
        }
        let title = raw;
        if (title.startsWith("[") && title.endsWith("]")) {
          title = title.slice(1, -1);
        }
        const display = (parseIconSyntax(title)?.title ?? title).trim();
        return display.length > 0 ? display : fullMatch;
      }),
    );
  }

  return out.join("\n");
}

/** Markdown 画像の `assets/images/...` を表示用 URL（file / WebView / data など）に書き換える。 */
export function rewriteVaultMarkdownImages(
  markdown: string,
  resolveAssetUrl: (relativePath: string) => string,
): string {
  return markdown.replace(MARKDOWN_IMAGE_RE, (_full, alt: string, src: string) => {
    if (src.startsWith("assets/images/")) {
      const absolute = resolveAssetUrl(src).trim();
      if (!absolute) {
        return _full;
      }
      return `![${alt}](${absolute})`;
    }
    return _full;
  });
}

/** 本文から Vault 画像パス `assets/images/...` を重複なしで列挙する。 */
export function collectVaultMarkdownImagePaths(markdown: string): string[] {
  const seen = new Set<string>();
  for (const m of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const src = m[2] as string;
    if (src.startsWith("assets/images/")) {
      seen.add(src);
    }
  }
  return [...seen];
}

/** HTML エクスポート用。内部リンク正規化のあと Vault 画像 URL を `resolveVaultImageSrc` で差し替える。 */
export function applyVaultImageExportPreprocessors(
  markdown: string,
  resolveVaultImageSrc: (relativePath: string) => string,
): string {
  let md = stripInternalWikiLinksForExport(markdown);
  md = normalizeTipsboardBracketExternalLinksForExport(md);
  md = rewriteVaultMarkdownImages(md, resolveVaultImageSrc);
  return md;
}

/** レンダラ用。Vault 環境のみ（`tipsboardDesktop` 必須）。 */
export function applyDesktopImagePreprocessors(markdown: string): string {
  return applyVaultImageExportPreprocessors(markdown, (path) => window.tipsboardDesktop.resolveAssetUrl(path));
}

/** `#tag` のみ構成の行など。コードフェンス外・先頭想定で raw に対して使う。 */
const TAG_ONLY_LINE = /^\s*(#[^\s#]+)(\s+(#[^\s#]+))*\s*$/;

export interface LeadingPageExportSplit {
  titleLine: string;
  rawTagLines: string[];
  remainderMarkdown: string;
}

export function splitLeadingTitleAndTagLines(markdown: string): LeadingPageExportSplit {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let idx = 0;
  while (idx < lines.length && lines[idx]!.trim() === "") {
    idx += 1;
  }
  if (idx >= lines.length) {
    return { titleLine: "", rawTagLines: [], remainderMarkdown: normalized };
  }

  let titleLine = "";
  if (!TAG_ONLY_LINE.test(lines[idx]!)) {
    titleLine = lines[idx]!.trim();
    idx += 1;
  }

  while (idx < lines.length && lines[idx]!.trim() === "") {
    idx += 1;
  }

  const rawTagLines: string[] = [];
  while (idx < lines.length && TAG_ONLY_LINE.test(lines[idx]!)) {
    rawTagLines.push(lines[idx]!.trim());
    idx += 1;
  }

  while (idx < lines.length && lines[idx]!.trim() === "") {
    idx += 1;
  }

  const remainderMarkdown = lines.slice(idx).join("\n");
  return { titleLine, rawTagLines, remainderMarkdown };
}

export function buildExportTitleAndTagsFragment(split: LeadingPageExportSplit): string {
  const parts: string[] = [];
  if (split.titleLine.length > 0) {
    parts.push(`<h1 class="tipsboard-export-page-title">${escapeHtml(split.titleLine)}</h1>`);
  }
  if (split.rawTagLines.length > 0) {
    const joined = split.rawTagLines.join(" ");
    const tags = joined.match(/#[^\s#]+/g);
    const inner =
      tags?.map((tag) => `<span class="tipsboard-export-tag">${escapeHtml(tag)}</span>`).join("") ??
      escapeHtml(joined);
    parts.push(`<p class="tipsboard-export-tags">${inner}</p>`);
  }
  return parts.join("\n");
}

export function sanitizeExportFilename(title: string): string {
  const trimmed = title.trim() || "untitled";
  const safe = trimmed.replace(/[/\\:?*"<>|\n\r\t]+/g, "_").trim();
  return (safe.slice(0, 120) || "untitled") + ".html";
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
