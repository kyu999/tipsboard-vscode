/** 先頭が `[` のときは tipsboard 形式の `[表示名 https://…]` 内と重ねない。 */
export const bareHttpUrlInTextRe =
  /(?<!\[)(?<![\w/])(https?:\/\/\S+)/g;

/** 括弧なしで貼り付けた URL の末尾に付きやすい記号を除去する。 */
export function trimAutolinkUrl(raw: string): string {
  let s = raw;
  while (s.length > 0) {
    const last = s.at(-1)!;
    if (
      last === ")" ||
      last === "]" ||
      last === "}" ||
      last === "," ||
      last === "." ||
      last === ";" ||
      last === "!" ||
      last === "?" ||
      last === "*" ||
      last === "'" ||
      last === '"' ||
      last === "」" ||
      last === "』" ||
      last === "）"
    ) {
      s = s.slice(0, -1);
      continue;
    }
    break;
  }
  return s;
}
