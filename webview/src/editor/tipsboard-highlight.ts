import type { DelimiterType, MarkdownConfig } from "@lezer/markdown";

const EQUALS = 61; // "="
const PUNCTUATION_RE = /[\p{P}\p{S}]/u;

const highlightDelimiter: DelimiterType = { resolve: "Highlight", mark: "HighlightMark" };

/**
 * `==text==` を `Highlight`（区切りは `HighlightMark`）としてパースする Lezer 拡張。
 * 区切りの開閉判定は GFM の `~~` と同じ規則。`===` 以上の連続は対象外。
 * 色指定 `red:` は本文の一部として残し、装飾側で `parseHighlightColorPrefix` が読む。
 */
export const Highlight: MarkdownConfig = {
  defineNodes: ["Highlight", "HighlightMark"],
  parseInline: [
    {
      name: "Highlight",
      parse(cx, next, pos) {
        if (
          next !== EQUALS ||
          cx.char(pos + 1) !== EQUALS ||
          cx.char(pos + 2) === EQUALS ||
          cx.char(pos - 1) === EQUALS
        ) {
          return -1;
        }
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const spaceBefore = /\s|^$/.test(before);
        const spaceAfter = /\s|^$/.test(after);
        const punctBefore = PUNCTUATION_RE.test(before);
        const punctAfter = PUNCTUATION_RE.test(after);
        return cx.addDelimiter(
          highlightDelimiter,
          pos,
          pos + 2,
          !spaceAfter && (!punctAfter || spaceBefore || punctBefore),
          !spaceBefore && (!punctBefore || spaceAfter || punctAfter),
        );
      },
      after: "Emphasis",
    },
  ],
};
