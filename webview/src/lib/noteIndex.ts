import { extractLinks } from "@/domain/links/links";
import { normalizeTitle } from "@/domain/title/title";
import type { LinkSuggestion, NoteSummary } from "@/types";

export interface NoteGraphEntry {
  note: NoteSummary;
  outgoing: NoteSummary[];
  backlinks: NoteSummary[];
  twoHop: TwoHopLink[];
  newLinks: string[];
  tags: string[];
}

export interface TwoHopLink {
  linkingTitle: string;
  pages: NoteSummary[];
}

export interface NoteIndex {
  byNormalizedTitle: Map<string, NoteSummary[]>;
  entries: Map<string, NoteGraphEntry>;
  tags: Map<string, NoteSummary[]>;
  suggestions: LinkSuggestion[];
}

export function buildNoteIndex(notes: NoteSummary[]): NoteIndex {
  const byNormalizedTitle = new Map<string, NoteSummary[]>();
  const incoming = new Map<string, NoteSummary[]>();
  const tags = new Map<string, NoteSummary[]>();

  for (const note of notes) {
    appendMap(byNormalizedTitle, note.normalizedTitle, note);
  }

  const entries = new Map<string, NoteGraphEntry>();
  for (const note of notes) {
    const links = extractLinks(note.body);
    const outgoing: NoteSummary[] = [];
    const newLinks: string[] = [];
    const seenNewLinks = new Set<string>();
    const noteTags: string[] = [];

    for (const link of links) {
      if (link.type === "tag") {
        noteTags.push(link.title);
        appendMap(tags, link.title, note);
        continue;
      }

      const title = link.title.trim();
      const normalizedTitle = normalizeTitle(title);
      if (!title) continue;

      const targets = byNormalizedTitle.get(normalizedTitle) ?? [];
      if (targets.length > 0) {
        for (const target of targets) {
          if (target.path === note.path) continue;
          outgoing.push(target);
          appendMap(incoming, target.path, note);
        }
      } else if (!seenNewLinks.has(normalizedTitle)) {
        seenNewLinks.add(normalizedTitle);
        newLinks.push(title);
      }
    }

    entries.set(note.path, {
      note,
      outgoing: uniqueByPath(outgoing),
      backlinks: [],
      twoHop: [],
      newLinks,
      tags: [...new Set(noteTags)].sort((a, b) => a.localeCompare(b)),
    });
  }

  for (const [path, backlinks] of incoming) {
    const entry = entries.get(path);
    if (entry) {
      entry.backlinks = uniqueByPath(backlinks).sort(sortByUpdatedAtDesc);
    }
  }

  for (const entry of entries.values()) {
    entry.twoHop = entry.outgoing
      .map((linkedNote) => {
        const linkedEntry = entries.get(linkedNote.path);
        const excludedPaths = new Set([entry.note.path, linkedNote.path]);
        const pages = uniqueByPath(
          (linkedEntry?.backlinks ?? []).filter(
            (target) => !excludedPaths.has(target.path),
          ),
        ).sort(sortByUpdatedAtDesc);
        return pages.length > 0 ? { linkingTitle: linkedNote.title, pages } : null;
      })
      .filter((hop): hop is TwoHopLink => hop !== null);
  }

  return {
    byNormalizedTitle,
    entries,
    tags,
    suggestions: notes
      .map((note) => ({
        title: note.title,
        filename: note.filename,
        path: note.path,
        duplicateTitle: (byNormalizedTitle.get(note.normalizedTitle)?.length ?? 0) > 1,
      }))
      .sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path)),
  };
}

export function searchNotes(notes: NoteSummary[], query: string): NoteSummary[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return notes;
  return notes.filter((note) => {
    return (
      note.title.toLowerCase().includes(trimmed) ||
      note.filename.toLowerCase().includes(trimmed) ||
      note.body.toLowerCase().includes(trimmed)
    );
  });
}

function appendMap<TKey, TValue>(map: Map<TKey, TValue[]>, key: TKey, value: TValue) {
  const values = map.get(key);
  if (values) {
    values.push(value);
  } else {
    map.set(key, [value]);
  }
}

function uniqueByPath(notes: NoteSummary[]): NoteSummary[] {
  return [...new Map(notes.map((note) => [note.path, note])).values()];
}

function sortByUpdatedAtDesc(a: NoteSummary, b: NoteSummary): number {
  return b.updatedAt - a.updatedAt || a.title.localeCompare(b.title);
}
