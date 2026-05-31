import type { NoteSummary, SemanticSearchResult } from "@/types";

export const DEFAULT_NEAR_NOTE_MIN_SCORE = 0.45;

export interface NearNote {
  note: NoteSummary;
  score: number;
  heading: string;
  snippet: string;
}

export function aggregateNearNotes({
  results,
  notes,
  sourcePath,
  linkedPaths = new Set<string>(),
  limit = 6,
  minScore = DEFAULT_NEAR_NOTE_MIN_SCORE,
}: {
  results: SemanticSearchResult[];
  notes: NoteSummary[];
  sourcePath: string;
  linkedPaths?: Set<string>;
  limit?: number;
  minScore?: number;
}): NearNote[] {
  const notesByPath = new Map(notes.map((note) => [normalizeVaultNotePath(note.path), note]));
  const source = normalizeVaultNotePath(sourcePath);
  const linked = new Set([...linkedPaths].map(normalizeVaultNotePath));
  const bestByPath = new Map<string, NearNote>();

  for (const result of results) {
    const path = normalizeVaultNotePath(result.path);
    if (result.score < minScore) continue;
    if (path === source || linked.has(path)) continue;

    const note = notesByPath.get(path);
    if (!note) continue;

    const current = bestByPath.get(path);
    if (!current || result.score > current.score) {
      bestByPath.set(path, {
        note,
        score: result.score,
        heading: result.heading.trim(),
        snippet: result.snippet.trim(),
      });
    }
  }

  return [...bestByPath.values()]
    .sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title) || a.note.path.localeCompare(b.note.path))
    .slice(0, limit);
}

function normalizeVaultNotePath(notePath: string): string {
  return notePath.replace(/\\/g, "/");
}
