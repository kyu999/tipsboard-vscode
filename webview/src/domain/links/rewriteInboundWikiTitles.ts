import { normalizeTitle } from "@/domain/title/title";
import { formatIconSyntax, parseIconSyntax } from "./iconSyntax";
import { INTERNAL_LINK_RE } from "./links";

/** Returns true iff `rewriteInboundWikiTitles` changes the markdown. */
export function wouldRewriteInboundWikiTitles(
  markdown: string,
  oldNorm: string,
  newDisplayTitle: string,
): boolean {
  return rewriteInboundWikiTitles(markdown, oldNorm, newDisplayTitle) !== markdown;
}

/**
 * Rewrite internal wiki links whose resolved title matches `oldNorm`
 * (`normalizeTitle` of link text after icon syntax peeling) to `newDisplayTitle`.
 * Mirrors `extractLinks` scope: code fenced blocks skipped; URL-hybrid brackets skipped.
 */
export function rewriteInboundWikiTitles(markdown: string, oldNorm: string, newDisplayTitle: string): string {
  if (!markdown) return markdown;
  const lines = markdown.split("\n");
  let inFence = false;
  const next: string[] = [];

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      next.push(line);
      continue;
    }
    if (inFence) {
      next.push(line);
      continue;
    }
    INTERNAL_LINK_RE.lastIndex = 0;
    next.push(
      line.replace(INTERNAL_LINK_RE, (full, innerCaptured: string) => {
        const raw = innerCaptured.trim();
        const parts = raw.split(/\s+/);
        const last = parts[parts.length - 1]!;
        if (last.startsWith("http://") || last.startsWith("https://")) return full;

        const icon = parseIconSyntax(raw);
        const title = icon?.title ?? raw;
        if (normalizeTitle(title) !== oldNorm) return full;

        if (icon) return formatIconSyntax(newDisplayTitle, icon.count);
        return `[${newDisplayTitle}]`;
      }),
    );
  }

  return next.join("\n");
}
