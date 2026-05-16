import type { EditorState } from "@codemirror/state";
import { isCustomSyntaxIgnoredPosition } from "./tipsboard-markdown-ranges";

export interface ParsedMathSpan {
  from: number;
  to: number;
  tex: string;
  displayMode: boolean;
}

const DISPLAY_BRACKET = /\\\[([\s\S]*?)\\\]/g;
const INLINE_BRACKET = /\\\(([\s\S]*?)\\\)/g;

function isEscapedDelimiter(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount++;
  }
  return slashCount % 2 === 1;
}

function collectMatches(pattern: RegExp, text: string, displayMode: boolean): ParsedMathSpan[] {
  const out: ParsedMathSpan[] = [];
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    const tex = (m[1] ?? "").trim();
    if (!tex) continue;
    out.push({ from, to, tex, displayMode });
  }
  return out;
}

function collectDisplayDollarMatches(text: string, state: EditorState): ParsedMathSpan[] {
  const out: ParsedMathSpan[] = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const from = text.indexOf("$$", searchFrom);
    if (from < 0) break;

    searchFrom = from + 2;
    if (isEscapedDelimiter(text, from) || isCustomSyntaxIgnoredPosition(state, from)) {
      continue;
    }

    let closeSearchFrom = searchFrom;
    while (closeSearchFrom < text.length) {
      const toDelimiter = text.indexOf("$$", closeSearchFrom);
      if (toDelimiter < 0) {
        searchFrom = text.length;
        break;
      }

      closeSearchFrom = toDelimiter + 2;
      if (
        isEscapedDelimiter(text, toDelimiter) ||
        isCustomSyntaxIgnoredPosition(state, toDelimiter)
      ) {
        continue;
      }

      const tex = text.slice(from + 2, toDelimiter).trim();
      if (tex) {
        out.push({ from, to: toDelimiter + 2, tex, displayMode: true });
      }
      searchFrom = toDelimiter + 2;
      break;
    }
  }

  return out;
}

/** Exclude spans that intersect a larger span (e.g. inline inside raw display markup). */
function dropOverlapping(sorted: ParsedMathSpan[]): ParsedMathSpan[] {
  const out: ParsedMathSpan[] = [];
  for (const span of sorted) {
    if (out.some((x) => span.from < x.to && span.to > x.from)) continue;
    out.push(span);
  }
  return out;
}

/**
 * Locate math spans to render with KaTeX in the editor.
 * Skips fenced / inline code via Lezer markdown tree (same rules as Tipsboard links).
 */
export function findRenderableMathSpans(text: string, state: EditorState): ParsedMathSpan[] {
  const displayDollar = collectDisplayDollarMatches(text, state);
  const displayBracket = collectMatches(DISPLAY_BRACKET, text, true);
  const inlineBracket = collectMatches(INLINE_BRACKET, text, false);

  const all = [...displayDollar, ...displayBracket, ...inlineBracket];
  const filtered = all.filter((span) => !isCustomSyntaxIgnoredPosition(state, span.from));
  filtered.sort((a, b) => a.from - b.from || (b.displayMode === a.displayMode ? 0 : b.displayMode ? 1 : -1));
  return dropOverlapping(filtered);
}
