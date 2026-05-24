import path from "node:path";
import type {
  BulkOrganizeSuggestionsResponse,
  NoteSummary,
  OrganizeSuggestion,
  OrganizeSuggestionConfidence,
  OrganizeSuggestionReason,
  OrganizeSuggestionsResponse,
} from "../types/editor.js";
import { normalizeTitle } from "./vault.js";
import type { SemanticSearchResult } from "./semantic.js";
import {
  isInboxNotePath,
  isInboxTopLevelFolder,
  normalizeNotePath,
} from "../shared/inboxPath.js";

export { isInboxNotePath } from "../shared/inboxPath.js";

const MAX_SUGGESTIONS = 3;
const PARENT_PROPAGATION = 0.25;
const COMMON_LINK_TITLES = new Set(["home", "index", "overview", "readme", "untitled"]);

type SignalName = OrganizeSuggestionReason["signal"];

interface FolderScore {
  folder: string;
  notes: NoteSummary[];
  signals: Record<SignalName, number>;
  reasons: OrganizeSuggestionReason[];
}

export interface BuildOrganizeSuggestionsInput {
  notePath: string;
  notes: NoteSummary[];
  semanticEnabled: boolean;
  semanticNeighbors?: SemanticSearchResult[];
}

export function buildOrganizeSuggestions(input: BuildOrganizeSuggestionsInput): OrganizeSuggestionsResponse {
  const targetPath = normalizeNotePath(input.notePath);
  const targetNote = input.notes.find((note) => normalizeNotePath(note.path) === targetPath);
  if (!targetNote) {
    throw new Error("Note not found");
  }
  if (!isInboxNotePath(targetPath)) {
    throw new Error("Organize suggestions are only available for inbox notes");
  }

  const candidateNotes = input.notes.filter((note) => {
    const notePath = normalizeNotePath(note.path);
    const folder = folderForNotePath(notePath);
    return notePath !== targetPath && folder !== null && !isInboxFolder(folder);
  });
  const folders = buildFolderScores(candidateNotes);

  applyWikiLinkScore(targetNote, input.notes, folders);
  applySemanticNeighborScore(input.semanticNeighbors ?? [], candidateNotes, folders);
  applyTagDistributionScore(targetNote, candidateNotes, folders);
  applyTitlePatternScore(targetNote, candidateNotes, folders);
  applyFolderProfileScore(targetNote, candidateNotes, folders);

  const scored = [...folders.values()]
    .map((entry) => {
      const weights = input.semanticEnabled
        ? {
          "wiki-link": 0.35,
          "semantic-neighbor": 0.25,
          "tag-distribution": 0.2,
          "title-pattern": 0.1,
          "folder-profile": 0.1,
        }
        : {
          "wiki-link": 0.4,
          "semantic-neighbor": 0,
          "tag-distribution": 0.3,
          "title-pattern": 0.15,
          "folder-profile": 0.15,
        };
      const score = clamp01(
        entry.signals["wiki-link"] * weights["wiki-link"] +
        entry.signals["semantic-neighbor"] * weights["semantic-neighbor"] +
        entry.signals["tag-distribution"] * weights["tag-distribution"] +
        entry.signals["title-pattern"] * weights["title-pattern"] +
        entry.signals["folder-profile"] * weights["folder-profile"],
      );
      return {
        entry,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.folder.localeCompare(b.entry.folder));

  const topScore = scored[0]?.score ?? 0;
  const secondScore = scored[1]?.score ?? 0;
  const suggestions: OrganizeSuggestion[] = scored.slice(0, MAX_SUGGESTIONS).map((item) => ({
    folder: item.entry.folder,
    score: item.score,
    confidence: confidenceFor(item.entry, item.score, topScore, secondScore),
    reasons: item.entry.reasons.slice(0, 4),
  }));

  return {
    notePath: targetPath,
    suggestions,
    semanticEnabled: input.semanticEnabled,
    lowConfidence: suggestions.length === 0 || suggestions[0]?.confidence === "low",
    hasRelativeMarkdownLinks: hasRelativeMarkdownLinks(targetNote.body),
  };
}

export interface BuildBulkOrganizeSuggestionsInput {
  notes: NoteSummary[];
  semanticEnabled: boolean;
  semanticNeighborsByPath?: Map<string, SemanticSearchResult[]>;
}

export function buildBulkOrganizeSuggestions(input: BuildBulkOrganizeSuggestionsInput): BulkOrganizeSuggestionsResponse {
  const inboxNotes = input.notes.filter((note) => isInboxNotePath(note.path));
  const items = inboxNotes.map((note) =>
    buildOrganizeSuggestions({
      notePath: note.path,
      notes: input.notes,
      semanticEnabled: input.semanticEnabled,
      semanticNeighbors: input.semanticNeighborsByPath?.get(normalizeNotePath(note.path)) ?? [],
    }),
  );
  return { items, semanticEnabled: input.semanticEnabled };
}

export function hasRelativeMarkdownLinks(body: string): boolean {
  const re = /!?\[[^\]\n]*\]\(\s*([^)\s]+\.md(?:#[^)]+)?)(?:\s+["'][^"']*["'])?\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const raw = (match[1] ?? "").trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
    return true;
  }
  return false;
}

function buildFolderScores(notes: NoteSummary[]): Map<string, FolderScore> {
  const out = new Map<string, FolderScore>();
  for (const note of notes) {
    const folder = folderForNotePath(note.path);
    if (!folder || isInboxFolder(folder)) continue;
    ensureFolderScore(out, folder).notes.push(note);
    for (const parent of parentFolders(folder)) {
      ensureFolderScore(out, parent).notes.push(note);
    }
  }
  return out;
}

function applyWikiLinkScore(
  targetNote: NoteSummary,
  allNotes: NoteSummary[],
  folders: Map<string, FolderScore>,
): void {
  const links = extractWikiLinks(targetNote.body);
  if (links.length === 0) return;

  const notesByTitle = new Map<string, NoteSummary[]>();
  for (const note of allNotes) {
    const normalized = normalizeTitle(note.title);
    const list = notesByTitle.get(normalized) ?? [];
    list.push(note);
    notesByTitle.set(normalized, list);
  }

  const contributions = new Map<string, { score: number; titles: Set<string> }>();
  for (const title of links) {
    const normalized = normalizeTitle(title);
    const matches = (notesByTitle.get(normalized) ?? []).filter((note) => !isInboxNotePath(note.path));
    if (matches.length === 0) continue;
    const titleWeight = COMMON_LINK_TITLES.has(normalized) || matches.length > 1 ? 0.35 : 1;
    for (const match of matches) {
      const folder = folderForNotePath(match.path);
      if (!folder || isInboxFolder(folder)) continue;
      addContribution(contributions, folder, titleWeight / matches.length, title);
      for (const parent of parentFolders(folder)) {
        addContribution(contributions, parent, (titleWeight * PARENT_PROPAGATION) / matches.length, title);
      }
    }
  }

  normalizeContribution(contributions, (folder, value, titles) => {
    addSignal(folders, folder, "wiki-link", value, `Links to ${Array.from(titles).slice(0, 2).join(", ")}`);
  });
}

function applySemanticNeighborScore(
  neighbors: SemanticSearchResult[],
  candidateNotes: NoteSummary[],
  folders: Map<string, FolderScore>,
): void {
  if (neighbors.length === 0) return;
  const notePathSet = new Set(candidateNotes.map((note) => normalizeNotePath(note.path)));
  const folderNoteCounts = folderCounts(candidateNotes);
  const contributions = new Map<string, { score: number; titles: Set<string> }>();

  for (const neighbor of neighbors.slice(0, 12)) {
    const neighborPath = normalizeNotePath(neighbor.path);
    if (!notePathSet.has(neighborPath)) continue;
    const folder = folderForNotePath(neighborPath);
    if (!folder || isInboxFolder(folder)) continue;
    const normalizedScore = Math.max(0, neighbor.score);
    const folderSizePenalty = Math.sqrt(folderNoteCounts.get(folder) ?? 1);
    addContribution(contributions, folder, normalizedScore / folderSizePenalty, neighbor.title);
    for (const parent of parentFolders(folder)) {
      addContribution(contributions, parent, (normalizedScore * PARENT_PROPAGATION) / folderSizePenalty, neighbor.title);
    }
  }

  normalizeContribution(contributions, (folder, value, titles) => {
    addSignal(folders, folder, "semantic-neighbor", value, `Similar to ${Array.from(titles).slice(0, 2).join(", ")}`);
  });
}

function applyTagDistributionScore(
  targetNote: NoteSummary,
  candidateNotes: NoteSummary[],
  folders: Map<string, FolderScore>,
): void {
  const targetTags = extractTags(targetNote.body);
  if (targetTags.size === 0) return;

  const contributions = new Map<string, { score: number; titles: Set<string> }>();
  for (const tag of targetTags) {
    const folderHits = new Map<string, number>();
    let total = 0;
    for (const note of candidateNotes) {
      if (!extractTags(note.body).has(tag)) continue;
      const folder = folderForNotePath(note.path);
      if (!folder || isInboxFolder(folder)) continue;
      folderHits.set(folder, (folderHits.get(folder) ?? 0) + 1);
      total += 1;
    }
    if (total === 0) continue;
    const maxShare = Math.max(...folderHits.values()) / total;
    const concentration = maxShare < 0.5 ? 0.35 : maxShare;
    for (const [folder, count] of folderHits) {
      const value = (count / total) * concentration;
      addContribution(contributions, folder, value, `#${tag}`);
      for (const parent of parentFolders(folder)) {
        addContribution(contributions, parent, value * PARENT_PROPAGATION, `#${tag}`);
      }
    }
  }

  normalizeContribution(contributions, (folder, value, tags) => {
    addSignal(folders, folder, "tag-distribution", value, `Tags cluster here: ${Array.from(tags).slice(0, 3).join(", ")}`);
  });
}

function applyTitlePatternScore(
  targetNote: NoteSummary,
  candidateNotes: NoteSummary[],
  folders: Map<string, FolderScore>,
): void {
  const patterns = titlePatterns(targetNote.title);
  if (patterns.size === 0) return;

  const contributions = new Map<string, { score: number; titles: Set<string> }>();
  let total = 0;
  for (const note of candidateNotes) {
    const matched = [...titlePatterns(note.title)].filter((pattern) => patterns.has(pattern));
    if (matched.length === 0) continue;
    const folder = folderForNotePath(note.path);
    if (!folder || isInboxFolder(folder)) continue;
    total += 1;
    for (const pattern of matched) {
      addContribution(contributions, folder, 1, pattern);
      for (const parent of parentFolders(folder)) {
        addContribution(contributions, parent, PARENT_PROPAGATION, pattern);
      }
    }
  }
  if (total === 0) return;

  normalizeContribution(contributions, (folder, value, patternsFound) => {
    addSignal(folders, folder, "title-pattern", value, `Title pattern: ${Array.from(patternsFound).join(", ")}`);
  });
}

function applyFolderProfileScore(
  targetNote: NoteSummary,
  candidateNotes: NoteSummary[],
  folders: Map<string, FolderScore>,
): void {
  const targetTerms = weightedTermsForNote(targetNote);
  if (targetTerms.size === 0) return;

  const profiles = new Map<string, Map<string, number>>();
  for (const note of candidateNotes) {
    const folder = folderForNotePath(note.path);
    if (!folder || isInboxFolder(folder)) continue;
    mergeTerms(ensureProfile(profiles, folder), weightedTermsForNote(note));
    for (const parent of parentFolders(folder)) {
      mergeTerms(ensureProfile(profiles, parent), scaleTerms(weightedTermsForNote(note), PARENT_PROPAGATION));
    }
  }

  const contributions = new Map<string, { score: number; titles: Set<string> }>();
  for (const [folder, profile] of profiles) {
    let overlap = 0;
    const matched: string[] = [];
    for (const [term, weight] of targetTerms) {
      const profileWeight = profile.get(term) ?? 0;
      if (profileWeight <= 0) continue;
      overlap += Math.min(weight, profileWeight);
      if (matched.length < 3) matched.push(term);
    }
    if (overlap <= 0) continue;
    const profileMass = [...profile.values()].reduce((sum, value) => sum + value, 0);
    const normalized = overlap / Math.sqrt(Math.max(1, targetTerms.size) * Math.max(1, profileMass));
    addContribution(contributions, folder, normalized, matched.join(", "));
  }

  normalizeContribution(contributions, (folder, value, matches) => {
    addSignal(folders, folder, "folder-profile", value, `Folder vocabulary matches: ${Array.from(matches).filter(Boolean).slice(0, 2).join(", ")}`);
  });
}

function confidenceFor(entry: FolderScore, score: number, topScore: number, secondScore: number): OrganizeSuggestionConfidence {
  const activeSignals = Object.values(entry.signals).filter((value) => value > 0.12).length;
  const separation = topScore > 0 ? (topScore - secondScore) / topScore : 0;
  const strongSignal = entry.signals["wiki-link"] > 0.65 || entry.signals["semantic-neighbor"] > 0.65;
  if (score >= 0.55 && separation >= 0.25 && activeSignals >= 2) return "high";
  if (score >= 0.42 && (activeSignals >= 2 || strongSignal)) return "medium";
  if (score >= 0.32 && strongSignal) return "medium";
  return "low";
}

function extractWikiLinks(body: string): string[] {
  const out: string[] = [];
  let inCodeBlock = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const re = /(?<!!)\[([^\]\n]{1,160})\](?!\()/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      const title = (match[1] ?? "").trim();
      if (title) out.push(title);
    }
  }
  return [...new Set(out)];
}

function extractTags(body: string): Set<string> {
  const tags = new Set<string>();
  const re = /(^|[\s(])#([\p{L}\p{N}_/-]{2,64})/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    tags.add((match[2] ?? "").toLocaleLowerCase());
  }
  return tags;
}

function titlePatterns(title: string): Set<string> {
  const normalized = title.trim().toLocaleLowerCase();
  const out = new Set<string>();
  if (/^(adr[-_\s]?\d+|\d{4}[-_].*record|adr\b)/i.test(title)) out.add("ADR");
  if (/\b(rfc|request for comments)\b/i.test(title)) out.add("RFC");
  if (/\b(meeting|mtg|minutes)\b/i.test(title) || /\b\d{4}-\d{2}-\d{2}\b/.test(title)) out.add("Meeting");
  if (/\b(retro|retrospective)\b/i.test(title)) out.add("Retro");
  if (normalized.startsWith("daily ") || /^\d{4}-\d{2}-\d{2}$/.test(normalized)) out.add("Daily");
  return out;
}

function weightedTermsForNote(note: NoteSummary): Map<string, number> {
  const text = [note.title, note.preview, note.body.slice(0, 1600), note.path.replace(/\.md$/i, "").replace(/[\\/]/g, " ")].join("\n");
  const terms = new Map<string, number>();
  for (const token of tokenize(text)) {
    terms.set(token, Math.min(4, (terms.get(token) ?? 0) + 1));
  }
  for (const tag of extractTags(note.body)) {
    terms.set(tag, (terms.get(tag) ?? 0) + 2);
  }
  for (const link of extractWikiLinks(note.body)) {
    for (const token of tokenize(link)) {
      terms.set(token, (terms.get(token) ?? 0) + 1.5);
    }
  }
  return terms;
}

function tokenize(text: string): string[] {
  const words = text.toLocaleLowerCase().match(/[a-z0-9][a-z0-9._-]*|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu) ?? [];
  return words
    .flatMap((word) => {
      if (/^[a-z0-9._-]+$/.test(word)) return word.length >= 2 ? [word] : [];
      const chars = Array.from(word);
      if (chars.length <= 2) return [word];
      const bigrams: string[] = [];
      for (let i = 0; i < chars.length - 1; i += 1) bigrams.push(`${chars[i]}${chars[i + 1]}`);
      return bigrams;
    })
    .filter((word) => !STOP_WORDS.has(word));
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "note",
  "notes",
  "todo",
  "draft",
  "memo",
]);

function addSignal(
  folders: Map<string, FolderScore>,
  folder: string,
  signal: SignalName,
  score: number,
  message: string,
): void {
  const entry = folders.get(folder);
  if (!entry) return;
  entry.signals[signal] = Math.max(entry.signals[signal], clamp01(score));
  if (score > 0.05 && !entry.reasons.some((reason) => reason.signal === signal && reason.message === message)) {
    entry.reasons.push({ signal, message });
  }
}

function normalizeContribution(
  contributions: Map<string, { score: number; titles: Set<string> }>,
  emit: (folder: string, value: number, labels: Set<string>) => void,
): void {
  const max = Math.max(0, ...[...contributions.values()].map((item) => item.score));
  if (max <= 0) return;
  const denominator = Math.max(1, max);
  for (const [folder, item] of contributions) {
    emit(folder, item.score / denominator, item.titles);
  }
}

function addContribution(
  map: Map<string, { score: number; titles: Set<string> }>,
  folder: string,
  score: number,
  label: string,
): void {
  const current = map.get(folder) ?? { score: 0, titles: new Set<string>() };
  current.score += score;
  if (label) current.titles.add(label);
  map.set(folder, current);
}

function ensureFolderScore(scores: Map<string, FolderScore>, folder: string): FolderScore {
  const existing = scores.get(folder);
  if (existing) return existing;
  const created: FolderScore = {
    folder,
    notes: [],
    signals: {
      "wiki-link": 0,
      "semantic-neighbor": 0,
      "tag-distribution": 0,
      "title-pattern": 0,
      "folder-profile": 0,
    },
    reasons: [],
  };
  scores.set(folder, created);
  return created;
}

function ensureProfile(profiles: Map<string, Map<string, number>>, folder: string): Map<string, number> {
  const existing = profiles.get(folder);
  if (existing) return existing;
  const created = new Map<string, number>();
  profiles.set(folder, created);
  return created;
}

function mergeTerms(target: Map<string, number>, source: Map<string, number>): void {
  for (const [term, weight] of source) {
    target.set(term, (target.get(term) ?? 0) + weight);
  }
}

function scaleTerms(source: Map<string, number>, scale: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [term, weight] of source) out.set(term, weight * scale);
  return out;
}

function folderCounts(notes: NoteSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    const folder = folderForNotePath(note.path);
    if (!folder) continue;
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return counts;
}

function folderForNotePath(relativePath: string): string | null {
  const normalized = normalizeNotePath(relativePath);
  const folder = path.posix.dirname(normalized);
  return folder === "." ? null : folder;
}

function parentFolders(folder: string): string[] {
  const parts = folder.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = parts.length - 1; i > 0; i -= 1) {
    out.push(parts.slice(0, i).join("/"));
  }
  return out;
}

function isInboxFolder(folder: string): boolean {
  const first = normalizeNotePath(folder).split("/")[0] ?? "";
  return isInboxTopLevelFolder(first);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
