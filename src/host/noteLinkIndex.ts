import { normalizeTitle } from "./vault.js";
import { extractWikiLinkTitles } from "../shared/wikiLinks.js";

export interface NoteLinkIndex {
  inboundByNormalizedTitle: Map<string, Set<string>>;
}

export function buildNoteLinkIndex(notes: Array<{ path: string; body: string }>): NoteLinkIndex {
  const inboundByNormalizedTitle = new Map<string, Set<string>>();
  for (const note of notes) {
    patchNoteLinkIndexForBody(inboundByNormalizedTitle, note.path, note.body);
  }
  return { inboundByNormalizedTitle };
}

export function patchNoteLinkIndex(
  index: NoteLinkIndex,
  oldNote: { path: string; body: string } | null,
  newNote: { path: string; body: string } | null,
): NoteLinkIndex {
  const inboundByNormalizedTitle = cloneInboundMap(index.inboundByNormalizedTitle);
  if (oldNote) {
    removeNoteLinkIndexForBody(inboundByNormalizedTitle, oldNote.path, oldNote.body);
  }
  if (newNote) {
    patchNoteLinkIndexForBody(inboundByNormalizedTitle, newNote.path, newNote.body);
  }
  return { inboundByNormalizedTitle };
}

export function findInboundNotePaths(index: NoteLinkIndex, normalizedTitle: string): string[] {
  const paths = index.inboundByNormalizedTitle.get(normalizedTitle);
  if (!paths) return [];
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function patchNoteLinkIndexForBody(
  inboundByNormalizedTitle: Map<string, Set<string>>,
  notePath: string,
  body: string,
): void {
  const normalizedPath = notePath.replace(/\\/g, "/");
  for (const title of extractWikiLinkTitles(body)) {
    const normalized = normalizeTitle(title);
    const bucket = inboundByNormalizedTitle.get(normalized) ?? new Set<string>();
    bucket.add(normalizedPath);
    inboundByNormalizedTitle.set(normalized, bucket);
  }
}

function removeNoteLinkIndexForBody(
  inboundByNormalizedTitle: Map<string, Set<string>>,
  notePath: string,
  body: string,
): void {
  const normalizedPath = notePath.replace(/\\/g, "/");
  for (const title of extractWikiLinkTitles(body)) {
    const normalized = normalizeTitle(title);
    const bucket = inboundByNormalizedTitle.get(normalized);
    if (!bucket) continue;
    bucket.delete(normalizedPath);
    if (bucket.size === 0) inboundByNormalizedTitle.delete(normalized);
  }
}

function cloneInboundMap(source: Map<string, Set<string>>): Map<string, Set<string>> {
  return new Map([...source.entries()].map(([key, value]) => [key, new Set(value)]));
}
