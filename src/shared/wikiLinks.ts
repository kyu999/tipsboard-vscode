const INTERNAL_LINK_RE = /(?<!\\)\[(?!https?:\/\/)(?!image:)([^\[\]\n]+?)\](?![\]\(])/g;
const CODE_BLOCK_FENCE = /^\s*```/;

/** Extract display titles from wiki-style internal links (host-safe, no webview imports). */
export function extractWikiLinkTitles(body: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  let inCodeBlock = false;

  for (const line of body.split("\n")) {
    if (CODE_BLOCK_FENCE.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    INTERNAL_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INTERNAL_LINK_RE.exec(line)) !== null) {
      const raw = match[1]!.trim();
      const parts = raw.split(/\s+/);
      const last = parts[parts.length - 1]!;
      if (last.startsWith("http://") || last.startsWith("https://")) continue;
      const title = raw.replace(/\.icon(?:\*\d+)?$/i, "").trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      titles.push(title);
    }
  }

  return titles;
}
