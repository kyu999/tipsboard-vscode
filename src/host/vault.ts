import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  ImportedImage,
  KanbanState,
  NoteSummary,
  VaultAttachmentReference,
  VaultAttachmentSummary,
  VaultSnapshot,
} from "../types/editor.js";
import {
  cleanupCanvasAfterNoteDelete,
  listCanvasSummaries,
  patchCanvasNotePaths,
  pruneAllCanvasNoteNodes,
} from "./canvas.js";
import { cleanupKanbanAfterNoteDelete, loadKanbanState, patchKanbanNotePaths, saveKanbanState } from "./kanban.js";
import {
  cleanupPinsAfterNoteDelete,
  loadPinsState,
  patchPinsNotePaths,
  persistNotePinned as persistPinsForNote,
  prunePinsToValidPaths,
  savePinsState,
} from "./pins.js";
import { listInboxDirCandidates } from "../shared/inboxPath.js";
import { loadWorkspacePreferences } from "./workspacePreferences.js";

const PAGES_PREFIX = "pages";
const EXCLUDED_MARKDOWN_DIRS = new Set([".tipsboard", ".git", "node_modules", "dist", "build", "out"]);

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

function normalizeSafeRelativeMarkdownPath(relativePath: string): string {
  if (!relativePath) throw new Error("Note paths must be workspace-relative Markdown files");
  if (path.isAbsolute(relativePath)) throw new Error("Note paths must be workspace-relative Markdown files");
  const normalized = path.normalize(relativePath).replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Note paths must be workspace-relative Markdown files");
  }
  if (!normalized.toLowerCase().endsWith(".md")) {
    throw new Error("Note paths must be Markdown files");
  }
  if (parts.some((part) => EXCLUDED_MARKDOWN_DIRS.has(part))) {
    throw new Error("Note paths must not be inside excluded workspace directories");
  }
  return parts.join("/");
}

function normalizeSafeRelativeFolderPath(relativePath: string): string {
  if (!relativePath) throw new Error("Folder paths must be workspace-relative directories");
  if (path.isAbsolute(relativePath)) throw new Error("Folder paths must be workspace-relative directories");
  const normalized = path.normalize(relativePath).replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Folder paths must be workspace-relative directories");
  }
  if (parts.some((part) => EXCLUDED_MARKDOWN_DIRS.has(part))) {
    throw new Error("Folder paths must not be inside excluded workspace directories");
  }
  return parts.join("/");
}

export function assertSafeRelativePath(relativePath: string): void {
  normalizeSafeRelativeMarkdownPath(relativePath);
}

export function isExcludedWorkspaceRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return normalized.split("/").some((part) => EXCLUDED_MARKDOWN_DIRS.has(part));
}

async function enumerateMarkdownStemSet(pagesDir: string): Promise<Set<string>> {
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(pagesDir, { withFileTypes: true });
  } catch {
    return new Set();
  }
  const lower = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    lower.add(entry.name.toLowerCase());
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
  const safeRelativePath = normalizeSafeRelativeMarkdownPath(relativePath);
  const abs = path.join(vaultPath, safeRelativePath);
  const raw = await fs.readFile(abs, "utf8");
  const stats = await fs.stat(abs);
  const title = extractTitle(raw);
  const normalizedTitle = normalizeTitle(title);
  return {
    path: safeRelativePath,
    filename: path.basename(safeRelativePath),
    title,
    normalizedTitle,
    body: raw,
    preview: buildPreview(raw),
    updatedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs || stats.ctimeMs,
  };
}

export async function listNotePaths(vaultPath: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (EXCLUDED_MARKDOWN_DIRS.has(entry.name)) continue;
        await walk(path.join(absDir, entry.name), rel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".md")) continue;
      if (isExcludedWorkspaceRelativePath(rel)) continue;
      out.push(rel.replace(/\\/g, "/"));
    }
  }

  await walk(vaultPath, "");
  return out.sort((a, b) => a.localeCompare(b));
}

export interface ExtractedVaultAttachmentLink {
  relativePath: string;
  label: string;
}

const VAULT_FILE_ATTACHMENT_LINK_RE = /!?\[([^\]\n]*)\]\(\s*(assets[/\\]files[/\\][^) \t\n\r]+)\s*(?:\"[^\"]*\")?\)/g;

function normalizeVaultFileAttachmentPath(raw: string): string | null {
  const normalized = path.normalize(raw.trim()).replace(/\\/g, "/");
  if (!normalized || path.isAbsolute(normalized)) return null;
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) return null;
  return normalized.startsWith("assets/files/") ? normalized : null;
}

export function extractVaultFileAttachmentLinks(body: string): ExtractedVaultAttachmentLink[] {
  const out: ExtractedVaultAttachmentLink[] = [];
  let inCodeBlock = false;

  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    VAULT_FILE_ATTACHMENT_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = VAULT_FILE_ATTACHMENT_LINK_RE.exec(line)) !== null) {
      const relativePath = normalizeVaultFileAttachmentPath(match[2] ?? "");
      if (!relativePath) continue;
      out.push({
        relativePath,
        label: (match[1] ?? "").trim(),
      });
    }
  }

  return out;
}

async function buildAttachmentSummaries(vaultPath: string, notes: NoteSummary[]): Promise<VaultAttachmentSummary[]> {
  const filesDir = path.join(vaultPath, "assets", "files");
  const referencesByPath = new Map<string, VaultAttachmentReference[]>();

  for (const note of notes) {
    for (const link of extractVaultFileAttachmentLinks(note.body)) {
      const refs = referencesByPath.get(link.relativePath) ?? [];
      refs.push({
        notePath: note.path,
        noteTitle: note.title,
        noteFilename: note.filename,
        label: link.label,
      });
      referencesByPath.set(link.relativePath, refs);
    }
  }

  const entries = await fs.readdir(filesDir, { withFileTypes: true }).catch(() => []);
  const attachments: VaultAttachmentSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const abs = path.join(filesDir, entry.name);
    const stats = await fs.stat(abs).catch(() => null);
    if (!stats?.isFile()) continue;

    const relativePath = `assets/files/${entry.name}`.replace(/\\/g, "/");
    const extension = path.extname(entry.name).toLowerCase();
    const references = referencesByPath.get(relativePath) ?? [];
    attachments.push({
      relativePath,
      filename: entry.name,
      basename: extension ? path.basename(entry.name, extension) : entry.name,
      extension,
      size: stats.size,
      updatedAt: stats.mtimeMs,
      references,
      referenced: references.length > 0,
    });
  }

  attachments.sort((a, b) => b.updatedAt - a.updatedAt || a.filename.localeCompare(b.filename));
  return attachments;
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
      attachments: [],
      pins: [],
      kanban: { version: 1, boards: [] },
      canvases: [],
    };
  }

  const kanbanLoaded = await loadKanbanState(vaultPath);
  let pinsLoaded = await loadPinsState(vaultPath);

  const relPathsRaw = await listNotePaths(vaultPath);
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
  const workspacePreferences = await loadWorkspacePreferences(vaultPath);
  await pruneAllCanvasNoteNodes(vaultPath, pathSet);
  const canvases = await listCanvasSummaries(vaultPath);

  return {
    vaultPath,
    notes: notesOrdered,
    attachments: await buildAttachmentSummaries(vaultPath, notesOrdered),
    pins: pinsPruned.paths.slice(),
    kanban: kanbanClean,
    canvases,
    workspacePreferences,
  };
}

/**
 * Rebuilds the `assets/files/` attachment index from on-disk note bodies (no kanban/pins side effects).
 * Used to refresh the WebView attachment list after imports or saves without a full `readVault`.
 */
export async function readVaultAttachmentSummaries(vaultPath: string): Promise<VaultAttachmentSummary[]> {
  const relPathsRaw = await listNotePaths(vaultPath);
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
  return buildAttachmentSummaries(vaultPath, notes);
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

async function pathExists(abs: string): Promise<boolean> {
  return fs.access(abs).then(
    () => true,
    () => false,
  );
}

async function resolveInboxDir(vaultPath: string): Promise<{ abs: string; rel: string }> {
  const candidates = listInboxDirCandidates();

  for (const rel of candidates) {
    const abs = path.join(vaultPath, rel);
    const stats = await fs.stat(abs).catch(() => null);
    if (stats?.isDirectory()) return { abs, rel };
  }

  for (const rel of candidates) {
    const abs = path.join(vaultPath, rel);
    const stats = await fs.stat(abs).catch(() => null);
    if (!stats) {
      await fs.mkdir(abs, { recursive: true });
      return { abs, rel };
    }
  }

  throw new Error("Could not allocate an inbox folder");
}

export async function createNote(vaultPath: string, titleIn: string): Promise<NoteSummary> {
  const trimmed = titleIn.trim();
  const titleLine = trimmed || "Untitled";
  const inboxDir = await resolveInboxDir(vaultPath);
  const filename = await allocateUniqueFilename(inboxDir.abs, titleLine);
  const relative = `${inboxDir.rel}/${filename}`;
  const body = `${titleLine}\n`;
  const abs = path.join(vaultPath, relative);
  await fs.writeFile(abs, body, "utf8");
  return statNote(vaultPath, relative);
}

/** §8.2 — save and rename filename when title stem changes */
export async function saveNote(vaultPath: string, relativePath: string, body: string): Promise<NoteSummary> {
  const safeRelativePath = normalizeSafeRelativeMarkdownPath(relativePath);
  const containingDirRel = path.posix.dirname(safeRelativePath);
  const containingDirFs = containingDirRel === "." ? vaultPath : path.join(vaultPath, containingDirRel);
  const currentBasename = path.basename(safeRelativePath);
  const currentStemOnly = path.basename(safeRelativePath, ".md");

  const desiredStem = stemFromTitle(extractTitle(body));

  const stemNamesDifferIgnoringCase =
    currentStemOnly.localeCompare(desiredStem, undefined, { sensitivity: "accent" }) !== 0;

  let targetBasename = currentBasename;
  let finalRelative = safeRelativePath;

  if (stemNamesDifferIgnoringCase) {
    targetBasename = await allocateUniqueMarkdownBasename(containingDirFs, desiredStem, currentBasename.toLowerCase());
    const newRelative =
      containingDirRel === "." ? targetBasename : path.posix.join(containingDirRel, targetBasename);
    finalRelative = newRelative.replace(/\\/g, "/");

    const absOld = path.join(vaultPath, safeRelativePath);
    const absNew = path.join(vaultPath, finalRelative);

    await fs.mkdir(path.dirname(absNew), { recursive: true });
    const oldStillThere = await pathExists(absOld);
    if (oldStillThere) {
      await fs.rename(absOld, absNew);
    }
    /** §8.2: if source missing treat as recreate */
    else {
      await fs.writeFile(absNew, body, "utf8");
      await patchKanbanNotePaths(vaultPath, safeRelativePath, finalRelative);
      await patchCanvasNotePaths(vaultPath, safeRelativePath, finalRelative);
      await patchPinsNotePaths(vaultPath, safeRelativePath, finalRelative);
      return statNote(vaultPath, finalRelative);
    }

    await patchKanbanNotePaths(vaultPath, safeRelativePath, finalRelative);
    await patchCanvasNotePaths(vaultPath, safeRelativePath, finalRelative);
    await patchPinsNotePaths(vaultPath, safeRelativePath, finalRelative);
  }

  const abs = path.join(vaultPath, finalRelative);
  await fs.writeFile(abs, body, "utf8");

  return statNote(vaultPath, finalRelative);
}

export async function moveNoteToFolder(
  vaultPath: string,
  relativePath: string,
  targetFolder: string,
): Promise<NoteSummary> {
  const safeRelativePath = normalizeSafeRelativeMarkdownPath(relativePath);
  const safeTargetFolder = normalizeSafeRelativeFolderPath(targetFolder);
  const absOld = path.join(vaultPath, safeRelativePath);
  const absTargetDir = path.join(vaultPath, safeTargetFolder);
  const targetStats = await fs.stat(absTargetDir).catch(() => null);
  if (!targetStats?.isDirectory()) {
    throw new Error("Target folder must already exist");
  }

  const currentFolder = path.posix.dirname(safeRelativePath);
  if (currentFolder === safeTargetFolder) {
    return statNote(vaultPath, safeRelativePath);
  }

  const currentBasename = path.basename(safeRelativePath);
  const targetBasename = await allocateUniqueMarkdownBasename(
    absTargetDir,
    path.basename(currentBasename, ".md"),
    undefined,
  );
  const finalRelative = path.posix.join(safeTargetFolder, targetBasename).replace(/\\/g, "/");
  const absNew = path.join(vaultPath, finalRelative);

  await fs.rename(absOld, absNew);
  await patchKanbanNotePaths(vaultPath, safeRelativePath, finalRelative);
  await patchCanvasNotePaths(vaultPath, safeRelativePath, finalRelative);
  await patchPinsNotePaths(vaultPath, safeRelativePath, finalRelative);
  return statNote(vaultPath, finalRelative);
}

export async function moveNotesToFolders(
  vaultPath: string,
  moves: Array<{ notePath: string; targetFolder: string }>,
): Promise<{
  snapshot: VaultSnapshot;
  moved: Array<{ fromPath: string; toPath: string; note: NoteSummary }>;
}> {
  const moved: Array<{ fromPath: string; toPath: string; note: NoteSummary }> = [];
  for (const move of moves) {
    const fromPath = move.notePath.replace(/\\/g, "/");
    const note = await moveNoteToFolder(vaultPath, move.notePath, move.targetFolder);
    const toPath = note.path.replace(/\\/g, "/");
    if (fromPath !== toPath) {
      moved.push({ fromPath, toPath, note });
    }
  }
  return { snapshot: await readVault(vaultPath), moved };
}

export async function deleteNote(vaultPath: string, relativePath: string): Promise<void> {
  const safeRelativePath = normalizeSafeRelativeMarkdownPath(relativePath);
  const abs = path.join(vaultPath, safeRelativePath);
  await fs.unlink(abs).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
  });
  const kanban = await loadKanbanState(vaultPath);
  const nextKanban = cleanupKanbanAfterNoteDelete(kanban, safeRelativePath);
  await saveKanbanState(vaultPath, nextKanban);
  await cleanupCanvasAfterNoteDelete(vaultPath, safeRelativePath);
  const pins = await loadPinsState(vaultPath);
  await savePinsState(vaultPath, cleanupPinsAfterNoteDelete(pins, safeRelativePath));
}

const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/**
 * Executable / installer / shell-script extensions rejected for attachment import.
 * Keep in sync with `webview/src/shared/attachmentImportPolicy.ts`.
 */
export const BLOCKED_ATTACHMENT_EXTS = new Set([
  ".app",
  ".bash",
  ".bat",
  ".cmd",
  ".com",
  ".dmg",
  ".exe",
  ".jar",
  ".msi",
  ".pkg",
  ".ps1",
  ".scr",
  ".sh",
  ".zsh",
]);

/** Stable code; WebView maps to i18n on import errors. */
export const ATTACHMENT_TOO_LARGE_ERROR = "TIPSBOARD_ATTACHMENT_TOO_LARGE";

function assertAttachmentWithinMaxBytes(data: Uint8Array, maxBytes: number): void {
  if (data.byteLength > maxBytes) {
    throw new Error(ATTACHMENT_TOO_LARGE_ERROR);
  }
}

function assertFileWithinMaxBytes(size: number, maxBytes: number): void {
  if (size > maxBytes) {
    throw new Error(ATTACHMENT_TOO_LARGE_ERROR);
  }
}

function sanitizeAttachmentLinkLabel(originalBasenameWithoutExt: string): string {
  const s = originalBasenameWithoutExt
    .replace(/[\[\]()]/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > 0 ? s : "file";
}

function sanitizeAttachmentFilenameStem(raw: string, fallback: string): string {
  const cleaned = raw
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/[\[\]()]/g, " ")
    .replace(/[-\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "");
  return cleaned || fallback;
}

function truncateStem(stem: string, maxLength: number): string {
  if (stem.length <= maxLength) return stem;
  return stem.slice(0, maxLength).replace(/[_.]+$/g, "") || stem.slice(0, maxLength);
}

/** `assets/files/` 保存名: 元ファイル名（サニタイズ・長さ制限）+ 短い一意ID + 拡張子。 */
export function buildAttachmentFilename(originalName: string, ext: string, id: string): string {
  const originalBase = ext ? path.basename(originalName, ext) : path.basename(originalName);
  const originalStem = sanitizeAttachmentFilenameStem(originalBase, "file");
  const shortId = id.replace(/-/g, "").slice(0, 8);
  const maxFilenameLength = 112;
  const reservedForId = shortId.length + 1;
  const maxStemChars = Math.max(1, maxFilenameLength - ext.length - reservedForId);
  const stem = truncateStem(originalStem, maxStemChars);
  return `${stem}_${shortId}${ext}`;
}

async function allocateAttachmentRelativePath(filesDir: string, originalName: string, ext: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const filename = buildAttachmentFilename(originalName, ext, randomUUID());
    const abs = path.join(filesDir, filename);
    try {
      await fs.access(abs);
    } catch {
      return `assets/files/${filename}`;
    }
  }
  throw new Error("Could not allocate a unique attachment filename");
}

function contentSha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

async function findExistingFileAttachmentByContent(
  filesDir: string,
  data: Uint8Array,
): Promise<string | null> {
  const entries = await fs.readdir(filesDir, { withFileTypes: true }).catch(() => []);
  const incomingHash = contentSha256(data);
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const abs = path.join(filesDir, entry.name);
    const st = await fs.stat(abs).catch(() => null);
    if (!st?.isFile() || st.size !== data.byteLength) continue;
    const existing = await fs.readFile(abs).catch(() => null);
    if (!existing) continue;
    if (contentSha256(existing) === incomingHash) {
      return `assets/files/${entry.name}`.replace(/\\/g, "/");
    }
  }
  return null;
}

async function importFileAttachmentData(
  vaultPath: string,
  filesDir: string,
  originalName: string,
  data: Uint8Array,
): Promise<ImportedImage> {
  const ext = path.extname(originalName).toLowerCase();
  const existingRel = await findExistingFileAttachmentByContent(filesDir, data);
  const rel = existingRel ?? (await allocateAttachmentRelativePath(filesDir, originalName, ext));
  if (!existingRel) {
    await fs.writeFile(path.join(vaultPath, rel), data);
  }
  const stem = sanitizeAttachmentLinkLabel(ext ? path.basename(originalName, ext) : path.basename(originalName));
  const relPosix = rel.replace(/\\/g, "/");
  return { relativePath: relPosix, markdown: `[${stem}](${relPosix})` };
}

export async function importImages(vaultPath: string, sourcePaths: string[], maxBytes: number): Promise<ImportedImage[]> {
  const imagesDir = path.join(vaultPath, "assets", "images");
  const filesDir = path.join(vaultPath, "assets", "files");
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(filesDir, { recursive: true });

  const out: ImportedImage[] = [];

  for (const src of sourcePaths) {
    if (!src) continue;
    const normSrc = path.normalize(src);
    if (!path.isAbsolute(src) && normSrc.includes("..")) continue;
    const absSrc = path.isAbsolute(src) ? src : path.join(vaultPath, src);
    const st = await fs.stat(absSrc).catch(() => null);
    if (!st?.isFile()) continue;
    assertFileWithinMaxBytes(st.size, maxBytes);
    const ext = path.extname(absSrc).toLowerCase();
    const id = randomUUID();

    if (IMG_EXT.has(ext)) {
      const base = `img_${id}${ext}`;
      const rel = `assets/images/${base}`;
      const absDest = path.join(vaultPath, rel);
      await fs.copyFile(absSrc, absDest);
      const stem = sanitizeAttachmentLinkLabel(path.basename(absSrc, ext));
      const relPosix = rel.replace(/\\/g, "/");
      out.push({ relativePath: relPosix, markdown: `![${stem}](${relPosix})` });
      continue;
    }

    if (BLOCKED_ATTACHMENT_EXTS.has(ext)) continue;

    const data = await fs.readFile(absSrc);
    out.push(await importFileAttachmentData(vaultPath, filesDir, path.basename(absSrc), data));
  }
  return out;
}

export interface ImageBufferInput {
  name: string;
  data: Uint8Array;
}

/** Imports dropped buffers in order: images → `assets/images/`, other allowed files → `assets/files/`. */
export async function importAttachmentBuffers(
  vaultPath: string,
  entries: ImageBufferInput[],
  maxBytes: number,
): Promise<ImportedImage[]> {
  const imagesDir = path.join(vaultPath, "assets", "images");
  const filesDir = path.join(vaultPath, "assets", "files");
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(filesDir, { recursive: true });

  const out: ImportedImage[] = [];

  for (const ent of entries) {
    assertAttachmentWithinMaxBytes(ent.data, maxBytes);
    const ext = path.extname(ent.name).toLowerCase();
    const id = randomUUID();

    if (IMG_EXT.has(ext)) {
      const base = `img_${id}${ext}`;
      const rel = `assets/images/${base}`;
      const absDest = path.join(vaultPath, rel);
      await fs.writeFile(absDest, ent.data);
      const stem = sanitizeAttachmentLinkLabel(path.basename(ent.name, ext));
      const relPosix = rel.replace(/\\/g, "/");
      out.push({ relativePath: relPosix, markdown: `![${stem}](${relPosix})` });
      continue;
    }

    if (BLOCKED_ATTACHMENT_EXTS.has(ext)) continue;

    out.push(await importFileAttachmentData(vaultPath, filesDir, ent.name, ent.data));
  }
  return out;
}

/** @deprecated Prefer `importAttachmentBuffers` (same behavior). */
export async function importImageBuffers(
  vaultPath: string,
  entries: ImageBufferInput[],
  maxBytes: number,
): Promise<ImportedImage[]> {
  return importAttachmentBuffers(vaultPath, entries, maxBytes);
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

  const inboxDir = await resolveInboxDir(vaultPath);

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
      const file = await allocateUniqueFilename(inboxDir.abs, title);
      const rel = `${inboxDir.rel}/${file}`;
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
