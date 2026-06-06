/** `#tag` のみ構成の行（exportMarkdownPreprocess の TAG_ONLY_LINE と同等）。 */
const TAG_ONLY_LINE = /^\s*(#[^\s#]+)(\s+(#[^\s#]+))*\s*$/;

/** ATX 見出し: 先頭 0–3 スペース + # 1–6 個 + 必須空白 + 本文 */
const ATX_HEADING_LINE = /^(\s{0,3})(#{1,6})\s+(.+?)\s*$/;

const INLINE_TAG = /(?:^|\s)(#[^\s#]+)/g;

export interface AtxHeading {
  level: number;
  text: string;
  lineNumber: number;
}

function stripInlineTags(raw: string): string {
  return raw.replace(INLINE_TAG, " ").replace(/\s+/g, " ").trim();
}

function stripClosingHashes(text: string): string {
  return text.replace(/\s+#+\s*$/, "").trim();
}

function stripMarkdownDecorationsOnce(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\](?!\()/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function stripMarkdownDecorations(raw: string): string {
  let s = raw;
  for (let i = 0; i < 8; i += 1) {
    const next = stripMarkdownDecorationsOnce(s);
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, " ").trim();
}

function formatHeadingText(raw: string): string {
  return stripInlineTags(stripMarkdownDecorations(stripClosingHashes(raw)));
}

export function extractAtxHeadings(markdown: string): AtxHeading[] {
  const out: AtxHeading[] = [];
  let inCodeBlock = false;

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const lineNumber = i + 1;

    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    if (TAG_ONLY_LINE.test(line)) continue;

    const match = ATX_HEADING_LINE.exec(line);
    if (!match) continue;

    const hashes = match[2]!;
    if (line.slice(match[1]!.length).startsWith(`\\${hashes}`)) continue;

    const text = formatHeadingText(match[3] ?? "");
    if (!text) continue;

    out.push({
      level: hashes.length,
      text,
      lineNumber,
    });
  }

  return out;
}
