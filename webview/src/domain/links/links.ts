import { parseIconSyntax } from "./iconSyntax";

const INTERNAL_LINK_RE =
  /(?<!\\)\[(?!https?:\/\/)(?!image:)([^\[\]\n]+?)\](?![\]\(])/g;
const TAG_RE = /(?:^|\s)#([^\s#]+)/g;
const CODE_BLOCK_FENCE = /^\s*```/;

export interface LinkInfo {
  title: string;
  type: "internal" | "tag";
}

export function extractLinks(body: string): LinkInfo[] {
  const seen = new Set<string>();
  const result: LinkInfo[] = [];
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
      const title = parseIconSyntax(raw)?.title ?? raw;
      if (title && !seen.has(title)) {
        seen.add(title);
        result.push({ title, type: "internal" });
      }
    }

    TAG_RE.lastIndex = 0;
    while ((match = TAG_RE.exec(line)) !== null) {
      const tag = match[1]!;
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        result.push({ title: tag, type: "tag" });
      }
    }
  }

  return result;
}
