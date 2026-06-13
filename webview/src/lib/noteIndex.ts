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
  const byNormalizedTitle = buildByNormalizedTitle(notes);
  const { entries, tags } = buildEntriesAndTags(notes, byNormalizedTitle);
  applyBacklinks(entries);
  applyTwoHop(entries);
  return {
    byNormalizedTitle,
    entries,
    tags,
    suggestions: buildSuggestions(notes, byNormalizedTitle),
  };
}

/**
 * Incrementally updates the note graph after a single note save or draft edit.
 */
export function patchNoteIndex(
  prev: NoteIndex,
  allNotes: NoteSummary[],
  oldNote: NoteSummary,
  newNote: NoteSummary,
): NoteIndex {
  const next = cloneNoteIndex(prev);
  const notesByPath = new Map(allNotes.map((note) => [note.path, note]));

  removeNoteFromTitleBucket(next.byNormalizedTitle, oldNote);
  removeNoteFromTags(next.tags, oldNote.path);

  const oldEntry = next.entries.get(oldNote.path);

  if (oldNote.path !== newNote.path) {
    next.entries.delete(oldNote.path);
  }

  addNoteToTitleBucket(next.byNormalizedTitle, newNote);

  const recomputePaths = collectRecomputePaths(allNotes, oldNote, newNote);
  for (const notePath of recomputePaths) {
    const note = notesByPath.get(notePath);
    if (!note) {
      next.entries.delete(notePath);
      continue;
    }
    const partial = buildPartialEntry(note, next.byNormalizedTitle);
    next.entries.set(notePath, {
      ...partial,
      backlinks: [],
      twoHop: [],
    });
    for (const tag of partial.tags) {
      appendMap(next.tags, tag, note);
    }
  }

  const backlinkRefreshPaths = new Set(recomputePaths);
  for (const target of oldEntry?.outgoing ?? []) {
    backlinkRefreshPaths.add(target.path);
  }
  for (const notePath of recomputePaths) {
    const entry = next.entries.get(notePath);
    if (!entry) continue;
    for (const target of entry.outgoing) {
      backlinkRefreshPaths.add(target.path);
    }
  }
  rebuildBacklinksForPaths(next.entries, backlinkRefreshPaths);

  const twoHopPaths = collectTwoHopPaths(
    next.entries,
    recomputePaths,
    oldEntry?.outgoing.map((target) => target.path) ?? [],
  );
  for (const notePath of twoHopPaths) {
    const entry = next.entries.get(notePath);
    if (entry) {
      entry.twoHop = computeTwoHopForEntry(entry, next.entries);
    }
  }

  next.suggestions = buildSuggestions(allNotes, next.byNormalizedTitle);
  return next;
}

function buildByNormalizedTitle(notes: NoteSummary[]): Map<string, NoteSummary[]> {
  const byNormalizedTitle = new Map<string, NoteSummary[]>();
  for (const note of notes) {
    appendMap(byNormalizedTitle, note.normalizedTitle, note);
  }
  return byNormalizedTitle;
}

function buildEntriesAndTags(
  notes: NoteSummary[],
  byNormalizedTitle: Map<string, NoteSummary[]>,
): { entries: Map<string, NoteGraphEntry>; tags: Map<string, NoteSummary[]> } {
  const incoming = new Map<string, NoteSummary[]>();
  const entries = new Map<string, NoteGraphEntry>();
  const tags = new Map<string, NoteSummary[]>();

  for (const note of notes) {
    const partial = buildPartialEntry(note, byNormalizedTitle);
    entries.set(note.path, {
      ...partial,
      backlinks: [],
      twoHop: [],
    });
    for (const tag of partial.tags) {
      appendMap(tags, tag, note);
    }
    for (const target of partial.outgoing) {
      appendMap(incoming, target.path, note);
    }
  }

  for (const [path, backlinks] of incoming) {
    const entry = entries.get(path);
    if (entry) {
      entry.backlinks = uniqueByPath(backlinks).sort(sortByUpdatedAtDesc);
    }
  }

  return { entries, tags };
}

function buildPartialEntry(
  note: NoteSummary,
  byNormalizedTitle: Map<string, NoteSummary[]>,
): Pick<NoteGraphEntry, "note" | "outgoing" | "newLinks" | "tags"> {
  const links = extractLinks(note.body);
  const outgoing: NoteSummary[] = [];
  const newLinks: string[] = [];
  const seenNewLinks = new Set<string>();
  const noteTags: string[] = [];

  for (const link of links) {
    if (link.type === "tag") {
      noteTags.push(link.title);
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
      }
    } else if (!seenNewLinks.has(normalizedTitle)) {
      seenNewLinks.add(normalizedTitle);
      newLinks.push(title);
    }
  }

  return {
    note,
    outgoing: uniqueByPath(outgoing),
    newLinks,
    tags: [...new Set(noteTags)].sort((a, b) => a.localeCompare(b)),
  };
}

function applyBacklinks(entries: Map<string, NoteGraphEntry>): void {
  const incoming = new Map<string, NoteSummary[]>();
  for (const entry of entries.values()) {
    for (const target of entry.outgoing) {
      appendMap(incoming, target.path, entry.note);
    }
  }
  for (const [path, backlinks] of incoming) {
    const entry = entries.get(path);
    if (entry) {
      entry.backlinks = uniqueByPath(backlinks).sort(sortByUpdatedAtDesc);
    }
  }
}

function applyTwoHop(entries: Map<string, NoteGraphEntry>): void {
  for (const entry of entries.values()) {
    entry.twoHop = computeTwoHopForEntry(entry, entries);
  }
}

function computeTwoHopForEntry(
  entry: NoteGraphEntry,
  entries: Map<string, NoteGraphEntry>,
): TwoHopLink[] {
  return entry.outgoing
    .map((linkedNote) => {
      const linkedEntry = entries.get(linkedNote.path);
      const excludedPaths = new Set([entry.note.path, linkedNote.path]);
      const pages = uniqueByPath(
        (linkedEntry?.backlinks ?? []).filter((target) => !excludedPaths.has(target.path)),
      ).sort(sortByUpdatedAtDesc);
      return pages.length > 0 ? { linkingTitle: linkedNote.title, pages } : null;
    })
    .filter((hop): hop is TwoHopLink => hop !== null);
}

function buildSuggestions(notes: NoteSummary[], byNormalizedTitle: Map<string, NoteSummary[]>): LinkSuggestion[] {
  return notes
    .map((note) => ({
      title: note.title,
      filename: note.filename,
      path: note.path,
      duplicateTitle: (byNormalizedTitle.get(note.normalizedTitle)?.length ?? 0) > 1,
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path));
}

function cloneNoteIndex(index: NoteIndex): NoteIndex {
  return {
    byNormalizedTitle: new Map(
      [...index.byNormalizedTitle.entries()].map(([key, notes]) => [key, [...notes]]),
    ),
    entries: new Map(
      [...index.entries.entries()].map(([key, entry]) => [
        key,
        {
          ...entry,
          note: { ...entry.note },
          outgoing: [...entry.outgoing],
          backlinks: [...entry.backlinks],
          twoHop: entry.twoHop.map((hop) => ({ ...hop, pages: [...hop.pages] })),
          newLinks: [...entry.newLinks],
          tags: [...entry.tags],
        },
      ]),
    ),
    tags: new Map([...index.tags.entries()].map(([key, notes]) => [key, [...notes]])),
    suggestions: [...index.suggestions],
  };
}

function removeNoteFromTitleBucket(map: Map<string, NoteSummary[]>, note: NoteSummary): void {
  const bucket = map.get(note.normalizedTitle);
  if (!bucket) return;
  const next = bucket.filter((item) => item.path !== note.path);
  if (next.length > 0) map.set(note.normalizedTitle, next);
  else map.delete(note.normalizedTitle);
}

function addNoteToTitleBucket(map: Map<string, NoteSummary[]>, note: NoteSummary): void {
  const bucket = map.get(note.normalizedTitle) ?? [];
  const without = bucket.filter((item) => item.path !== note.path);
  without.push(note);
  map.set(note.normalizedTitle, without);
}

function removeNoteFromTags(tags: Map<string, NoteSummary[]>, notePath: string): void {
  for (const [tag, notes] of [...tags.entries()]) {
    const next = notes.filter((note) => note.path !== notePath);
    if (next.length > 0) tags.set(tag, next);
    else tags.delete(tag);
  }
}

function rebuildBacklinksForPaths(
  entries: Map<string, NoteGraphEntry>,
  targetPaths: Set<string>,
): void {
  for (const targetPath of targetPaths) {
    const entry = entries.get(targetPath);
    if (!entry) continue;
    const backlinks: NoteSummary[] = [];
    for (const candidate of entries.values()) {
      if (candidate.note.path === targetPath) continue;
      if (candidate.outgoing.some((outgoing) => outgoing.path === targetPath)) {
        backlinks.push(candidate.note);
      }
    }
    entry.backlinks = uniqueByPath(backlinks).sort(sortByUpdatedAtDesc);
  }
}

function collectRecomputePaths(
  allNotes: NoteSummary[],
  oldNote: NoteSummary,
  newNote: NoteSummary,
): Set<string> {
  const paths = new Set<string>([newNote.path]);
  if (oldNote.path !== newNote.path) {
    paths.add(oldNote.path);
  }

  if (oldNote.normalizedTitle !== newNote.normalizedTitle) {
    for (const note of allNotes) {
      if (note.path === newNote.path) continue;
      if (noteLinksToNormalizedTitle(note, oldNote.normalizedTitle) || noteLinksToNormalizedTitle(note, newNote.normalizedTitle)) {
        paths.add(note.path);
      }
    }
  }

  return paths;
}

function noteLinksToNormalizedTitle(note: NoteSummary, normalizedTitle: string): boolean {
  for (const link of extractLinks(note.body)) {
    if (link.type === "tag") continue;
    if (normalizeTitle(link.title) === normalizedTitle) return true;
  }
  return false;
}

function collectTwoHopPaths(
  entries: Map<string, NoteGraphEntry>,
  seeds: Set<string>,
  extraPaths: string[] = [],
): Set<string> {
  const paths = new Set<string>([...seeds, ...extraPaths]);
  for (const seed of seeds) {
    const entry = entries.get(seed);
    if (!entry) continue;
    for (const linked of entry.outgoing) paths.add(linked.path);
    for (const linked of entry.backlinks) paths.add(linked.path);
  }
  return paths;
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

export function isLinkIsolated(entry: Pick<NoteGraphEntry, "outgoing" | "backlinks"> | null | undefined): boolean {
  return Boolean(entry && entry.outgoing.length === 0 && entry.backlinks.length === 0);
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
