/**
 * 色ハイライト記法 `==text==` / `==red:text==`。
 * 色指定なしは既定色（黄）。色名は英小文字の固定リストのみ受け付け、それ以外の `xxx:` は本文として扱う。
 */
export const HIGHLIGHT_COLORS = ["yellow", "red", "green", "blue", "purple"] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "yellow";

/** 色名 + `:` + 任意の空白。後ろに本文が続くときだけ色指定とみなす（`==red:==` は本文 `red:`）。 */
const COLOR_PREFIX_RE = new RegExp(`^(${HIGHLIGHT_COLORS.join("|")}):[ \\t]*(?=\\S)`);

export interface HighlightColorPrefix {
  color: HighlightColor;
  /** `==` の内側先頭から数えた色指定の文字数（指定なしは 0）。 */
  prefixLength: number;
}

/** `==` で囲まれた内側テキストの先頭から色指定を読む。 */
export function parseHighlightColorPrefix(inner: string): HighlightColorPrefix {
  const match = COLOR_PREFIX_RE.exec(inner);
  if (!match) {
    return { color: DEFAULT_HIGHLIGHT_COLOR, prefixLength: 0 };
  }
  return { color: match[1] as HighlightColor, prefixLength: match[0].length };
}

/** 色指定を除いたハイライト本文。 */
export function stripHighlightColorPrefix(inner: string): string {
  return inner.slice(parseHighlightColorPrefix(inner).prefixLength);
}
