import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ImportedImage, KanbanState, NoteSummary, VaultSnapshot } from "../types/editor.js";
import { cleanupKanbanAfterNoteDelete, loadKanbanState, patchKanbanNotePaths, saveKanbanState } from "./kanban.js";
import {
  cleanupPinsAfterNoteDelete,
  loadPinsState,
  patchPinsNotePaths,
  persistNotePinned as persistPinsForNote,
  prunePinsToValidPaths,
  savePinsState,
} from "./pins.js";

const PAGES_PREFIX = "pages";

function nowIso(): string {
  return new Date().toISOString();
}

export function extractTitle(body: string): string {
  if (!body || !body.trim()) return "Untitled";
  const firstLine = body.split("\n", 1)[0]!.trim();
  return firstLine || "Untitled";
}

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFC")
    .trim()
    .replace(/[\s\u3000]+/g, " ")
    .replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** §7.4 preview generation */
export function buildPreview(body: string): string {
  const lines = body.split(/\n/);
  const rest = lines.slice(1);
  const condensed = rest.map((ln) => ln.trim()).filter((ln) => ln.length > 0);
  let text = condensed.join(" ");
  if (text.length > 180) text = text.slice(0, 180);
  return text;
}

const RESERVED_WINDOWS = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/** §8.5 */
export function stemFromTitle(titleRaw: string): string {
  let s = titleRaw.normalize("NFC");
  s = s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[.\s]+$/, "");
  if (!s) s = "Untitled";
  const lower = s.toLowerCase();
  if (RESERVED_WINDOWS.has(lower)) s = `${s} note`;
  if (s.length > 120) {
    s = s.slice(0, 120).replace(/[.\s]+$/, "");
    if (!s) s = "Untitled";
  }
  return s;
}

export function assertSafeRelativePath(relativePath: string): void {
  if (!relativePath) throw new Error("Note paths must be inside pages directory");
  if (path.isAbsolute(relativePath)) throw new Error("Note paths must be inside pages directory");
  const normalized = path.normalize(relativePath);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error("Note paths must be inside pages directory");
  }
  if (!/^pages[/\\][^/\\]+\.md$/i.test(normalized.replace(/\\/g, "/"))) {
    throw new Error("Note paths must be inside pages directory");
  }
}

async function enumerateMarkdownStemSet(pagesDir: string): Promise<Set<string>> {
  let names: string[] = [];
  try {
    names = await fs.readdir(pagesDir);
  } catch {
    return new Set();
  }
  const lower = new Set<string>();
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".md")) continue;
    const full = path.join(pagesDir, name);
    const st = await fs.stat(full).catch(() => null);
    if (st?.isFile()) lower.add(name.toLowerCase());
  }
  return lower;
}

async function markdownBasenamesLower(pagesDir: string): Promise<Set<string>> {
  return enumerateMarkdownStemSet(pagesDir);
}

/** Resolve next free `basename.md`; `excludeBasenameLower` keeps current file usable when renaming to new spelling. §8.6 */
async function allocateUniqueMarkdownBasename(pagesDir: string, stem: string, excludeBasenameLower?: string): Promise<string> {
  const existing = await markdownBasenamesLower(pagesDir);
  const usable = (name: string): boolean =>
    !existing.has(name.toLowerCase()) || name.toLowerCase() === excludeBasenameLower?.toLowerCase();

  for (let n = 1; n < 9999; n += 1) {
    const file = n === 1 ? `${stem}.md` : `${stem} (${n}).md`;
    if (usable(file)) return file;
  }
  throw new Error("Could not allocate a unique filename");
}

/** Allocate `stem.md` or `stem (n).md` per §8.6 */
export async function allocateUniqueFilename(pagesDir: string, title: string): Promise<string> {
  const stem = stemFromTitle(extractTitle(title));
  return allocateUniqueMarkdownBasename(pagesDir, stem, undefined);
}

export async function ensurePagesDir(vaultPath: string): Promise<string> {
  const dir = path.join(vaultPath, PAGES_PREFIX);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function statNote(vaultPath: string, relativePath: string): Promise<NoteSummary> {
  assertSafeRelativePath(relativePath);
  const abs = path.join(vaultPath, relativePath);
  const raw = await fs.readFile(abs, "utf8");
  const stats = await fs.stat(abs);
  const title = extractTitle(raw);
  const normalizedTitle = normalizeTitle(title);
  return {
    path: relativePath.replace(/\\/g, "/"),
    filename: path.basename(relativePath),
    title,
    normalizedTitle,
    body: raw,
    preview: buildPreview(raw),
    updatedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.ctimeMs,
  };
}

async function listNotePaths(pagesDir: string): Promise<string[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(pagesDir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".md")) continue;
    const full = path.join(pagesDir, name);
    const st = await fs.stat(full).catch(() => null);
    if (st?.isFile()) out.push(`${PAGES_PREFIX}/${name}`);
  }
  return out;
}

function reorderNotesWithPins(notes: NoteSummary[], pins: string[]): NoteSummary[] {
  const byNorm = new Map(notes.map((n) => [n.path.replace(/\\/g, "/"), n]));
  const out: NoteSummary[] = [];
  const placed = new Set<string>();
  for (const raw of pins) {
    const p = raw.replace(/\\/g, "/");
    const note = byNorm.get(p);
    if (!note || placed.has(p)) continue;
    out.push(note);
    placed.add(p);
  }
  for (const n of notes) {
    const p = n.path.replace(/\\/g, "/");
    if (!placed.has(p)) out.push(n);
  }
  return out;
}

function pruneOrphanKanbanCards(kanban: KanbanState, validPaths: ReadonlySet<string>): KanbanState {
  const boards = kanban.boards.map((board) => ({
    ...board,
    cards: board.cards.filter((c) => validPaths.has(c.note_path.replace(/\\/g, "/"))),
  }));
  return { version: 1, boards };
}

export async function readVault(vaultPath: string | null): Promise<VaultSnapshot> {
  if (!vaultPath) {
    return {
      vaultPath: null,
      notes: [],
      pins: [],
      kanban: { version: 1, boards: [] },
    };
  }

  await ensurePagesDir(vaultPath);
  const kanbanLoaded = await loadKanbanState(vaultPath);
  let pinsLoaded = await loadPinsState(vaultPath);

  const relPathsRaw = await listNotePaths(path.join(vaultPath, PAGES_PREFIX));
  const notes: NoteSummary[] = [];
  for (const rp of relPathsRaw) {
    try {
      notes.push(await statNote(vaultPath, rp));
    } catch {
      // skip unreadable entries
    }
  }

  notes.sort((a, b) => {
    const d = b.updatedAt - a.updatedAt;
    if (d !== 0) return d;
    return a.title.localeCompare(b.title);
  });

  const pathSet = new Set(notes.map((n) => n.path.replace(/\\/g, "/")));

  let kanbanClean = pruneOrphanKanbanCards(pruneStaleBoardColumns(kanbanLoaded, vaultPath), pathSet);
  if (kanbanJSONChanged(kanbanLoaded, kanbanClean)) {
    await saveKanbanState(vaultPath, kanbanClean);
  }

  const pinsPruned = prunePinsToValidPaths(pinsLoaded, pathSet);
  if (pinsJSONChanged(pinsLoaded, pinsPruned)) {
    pinsLoaded = pinsPruned;
    await savePinsState(vaultPath, pinsLoaded);
  }

  const notesOrdered = reorderNotesWithPins(notes, pinsPruned.paths);

  return {
    vaultPath,
    notes: notesOrdered,
    pins: pinsPruned.paths.slice(),
    kanban: kanbanClean,
  };
}

/** Stub for future board/column integrity checks (sync). */
function pruneStaleBoardColumns(kanban: KanbanState, _vaultPath: string): KanbanState {
  void _vaultPath;
  return kanban;
}

function kanbanJSONChanged(a: KanbanState, b: KanbanState): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function pinsJSONChanged(
  a: { version: 1; paths: string[] },
  b: { version: 1; paths: string[] },
): boolean {
  return JSON.stringify(a.paths) !== JSON.stringify(b.paths);
}

export async function setNotePinned(vaultPath: string, relativePath: string, pinned: boolean): Promise<void> {
  assertSafeRelativePath(relativePath);
  await persistPinsForNote(vaultPath, relativePath, pinned);
}

export async function createNote(vaultPath: string, titleIn: string): Promise<string> {
  const trimmed = titleIn.trim();
  const titleLine = trimmed || "Untitled";
  const pagesDir = await ensurePagesDir(vaultPath);
  const filename = await allocateUniqueFilename(pagesDir, titleLine);
  const relative = `${PAGES_PREFIX}/${filename}`;
  const body = `${titleLine}\n`;
  const abs = path.join(vaultPath, relative);
  await fs.writeFile(abs, body, "utf8");
  return relative.replace(/\\/g, "/");
}

/** §8.2 — save and rename filename when title stem changes */
export async function saveNote(vaultPath: string, relativePath: string, body: string): Promise<NoteSummary> {
  assertSafeRelativePath(relativePath);
  const pagesDir = await ensurePagesDir(vaultPath);
  const currentBasename = path.basename(relativePath);
  const currentStemOnly = path.basename(relativePath, ".md");

  const desiredStem = stemFromTitle(extractTitle(body));

  const stemNamesDifferIgnoringCase =
    currentStemOnly.localeCompare(desiredStem, undefined, { sensitivity: "accent" }) !== 0;

  let targetBasename = currentBasename;
  let finalRelative = relativePath.replace(/\\/g, "/");

  if (stemNamesDifferIgnoringCase) {
    targetBasename = await allocateUniqueMarkdownBasename(pagesDir, desiredStem, currentBasename.toLowerCase());
    const newRelative = `${PAGES_PREFIX}/${targetBasename}`;
    finalRelative = newRelative.replace(/\\/g, "/");

    const absOld = path.join(vaultPath, relativePath);
    const absNew = path.join(vaultPath, finalRelative);

    const oldStillThere = await fs
      .access(absOld)
      .then(() => true)
      .catch(() => false);
    if (oldStillThere) {
      await fs.rename(absOld, absNew);
    }
    /** §8.2: if source missing treat as recreate */
    else {
      await fs.writeFile(absNew, body, "utf8");
      await patchKanbanNotePaths(vaultPath, relativePath.replace(/\\/g, "/"), finalRelative);
      await patchPinsNotePaths(vaultPath, relativePath.replace(/\\/g, "/"), finalRelative);
      return statNote(vaultPath, finalRelative);
    }

    await patchKanbanNotePaths(vaultPath, relativePath.replace(/\\/g, "/"), finalRelative);
    await patchPinsNotePaths(vaultPath, relativePath.replace(/\\/g, "/"), finalRelative);
  }

  const abs = path.join(vaultPath, finalRelative);
  await fs.writeFile(abs, body, "utf8");

  return statNote(vaultPath, finalRelative);
}

export async function deleteNote(vaultPath: string, relativePath: string): Promise<void> {
  assertSafeRelativePath(relativePath);
  const abs = path.join(vaultPath, relativePath);
  await fs.unlink(abs).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
  });
  const kanban = await loadKanbanState(vaultPath);
  const nextKanban = cleanupKanbanAfterNoteDelete(kanban, relativePath.replace(/\\/g, "/"));
  await saveKanbanState(vaultPath, nextKanban);
  const pins = await loadPinsState(vaultPath);
  await savePinsState(vaultPath, cleanupPinsAfterNoteDelete(pins, relativePath.replace(/\\/g, "/")));
}

const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export async function importImages(vaultPath: string, sourcePaths: string[]): Promise<ImportedImage[]> {
  const out: ImportedImage[] = [];
  const destDir = path.join(vaultPath, "assets", "images");
  await fs.mkdir(destDir, { recursive: true });

  for (const src of sourcePaths) {
    if (!src) continue;
    const normSrc = path.normalize(src);
    if (!path.isAbsolute(src) && normSrc.includes("..")) continue;
    const absSrc = path.isAbsolute(src) ? src : path.join(vaultPath, src);
    const st = await fs.stat(absSrc).catch(() => null);
    if (!st?.isFile()) continue;
    const ext = path.extname(absSrc).toLowerCase();
    if (!IMG_EXT.has(ext)) continue;
    const id = randomUUID();
    const base = `img_${id}${ext}`;
    const rel = `assets/images/${base}`;
    const absDest = path.join(vaultPath, rel);
    await fs.copyFile(absSrc, absDest);
    const stem = path.basename(absSrc, ext).replace(/[-_]+/g, " ");
    out.push({ relativePath: rel.replace(/\\/g, "/"), markdown: `![${stem}](${rel.replace(/\\/g, "/")})` });
  }
  return out;
}

export interface ImageBufferInput {
  name: string;
  data: Uint8Array;
}

export async function importImageBuffers(vaultPath: string, entries: ImageBufferInput[]): Promise<ImportedImage[]> {
  const out: ImportedImage[] = [];
  const destDir = path.join(vaultPath, "assets", "images");
  await fs.mkdir(destDir, { recursive: true });

  for (const ent of entries) {
    const ext = path.extname(ent.name).toLowerCase();
    if (!IMG_EXT.has(ext)) continue;
    const id = randomUUID();
    const base = `img_${id}${ext}`;
    const rel = `assets/images/${base}`;
    const absDest = path.join(vaultPath, rel);
    await fs.writeFile(absDest, ent.data);
    const stem = path.basename(ent.name, ext).replace(/[-_]+/g, " ");
    out.push({ relativePath: rel.replace(/\\/g, "/"), markdown: `![${stem}](${rel.replace(/\\/g, "/")})` });
  }
  return out;
}

export async function exportVaultJson(vaultPath: string, targetPath: string): Promise<void> {
  const snap = await readVault(vaultPath);
  const pages = snap.notes.map((n) => ({
    title: n.title,
    normalized_title: n.normalizedTitle,
    body: n.body,
    updated_at: new Date(n.updatedAt).toISOString(),
    created_at: new Date(n.createdAt).toISOString(),
    deleted_at: null as string | null,
  }));
  const data = {
    schemaVersion: 1 as const,
    project: path.basename(vaultPath),
    exportedAt: nowIso(),
    pages,
  };
  await fs.writeFile(targetPath, JSON.stringify(data, null, 2), "utf8");
}

export async function importVaultJson(vaultPath: string, jsonPath: string): Promise<void> {
  const raw = await fs.readFile(jsonPath, "utf8");
  const parsed = JSON.parse(raw) as { schemaVersion?: number; pages?: unknown[] };
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.pages)) {
    throw new Error("Unsupported import file");
  }

  const pagesDir = await ensurePagesDir(vaultPath);

  for (const p of parsed.pages) {
    const page = p as {
      deleted_at?: string | null;
      body?: unknown;
      title?: string;
      normalized_title?: string;
    };
    if (page.deleted_at != null && page.deleted_at !== undefined) continue;

    let body: string;
    if (typeof page.body === "string") {
      body = page.body;
    } else {
      const t = page.title?.trim() || "Untitled";
      body = `${t}\n`;
    }

    const title = extractTitle(body);
    const normKey = page.normalized_title ? normalizeTitle(page.normalized_title) : normalizeTitle(title);

    const existing = await findNoteByNormalizedTitle(vaultPath, normKey);
    if (existing) {
      await saveNote(vaultPath, existing, body);
    } else {
      const file = await allocateUniqueFilename(pagesDir, title);
      const rel = `${PAGES_PREFIX}/${file}`;
      await fs.writeFile(path.join(vaultPath, rel), body, "utf8");
    }
  }
}

async function findNoteByNormalizedTitle(vaultPath: string, norm: string): Promise<string | null> {
  const snap = await readVault(vaultPath);
  for (const n of snap.notes) {
    if (n.normalizedTitle === norm) return n.path;
  }
  return null;
}
