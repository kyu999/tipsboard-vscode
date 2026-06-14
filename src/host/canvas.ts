import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CanvasDocument, CanvasLoadResult, CanvasSummary } from "../types/editor.js";
import {
  emptyCanvasMermaidTemplate,
  isCanvasMermaidFile,
  parseCanvasMermaid,
  sanitizeCanvasDocument,
  serializeCanvasMermaid,
} from "../shared/canvasMermaid.js";
import { emptyCanvasDocument } from "../shared/canvasTypes.js";

const CANVAS_DIR_SEG = ".tipsboard/canvas";

function canvasDirAbs(vaultPath: string): string {
  return path.join(vaultPath, ...CANVAS_DIR_SEG.split("/"));
}

function canvasRelPath(stem: string): string {
  return `${CANVAS_DIR_SEG}/${stem}.canvas`;
}

function sanitizeStem(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : "Untitled";
}

async function atomicWriteCanvas(abs: string, text: string): Promise<void> {
  const dir = path.dirname(abs);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${abs}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, abs);
}

export function canvasAbsPath(vaultPath: string, relativePath: string): string {
  const rel = relativePath.replace(/\\/g, "/");
  if (!rel.startsWith(`${CANVAS_DIR_SEG}/`) || !rel.endsWith(".canvas")) {
    throw new Error("Invalid canvas path");
  }
  return path.join(vaultPath, rel);
}

export async function listCanvasSummaries(vaultPath: string): Promise<CanvasSummary[]> {
  const dir = canvasDirAbs(vaultPath);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const summaries: CanvasSummary[] = [];
  for (const filename of entries) {
    if (!filename.endsWith(".canvas")) continue;
    const abs = path.join(dir, filename);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat?.isFile()) continue;
    let raw = "";
    try {
      raw = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    if (!isCanvasMermaidFile(raw)) continue;
    const stem = filename.slice(0, -".canvas".length);
    summaries.push({
      relativePath: canvasRelPath(stem),
      name: stem,
      updatedAt: stat.mtimeMs,
    });
  }

  summaries.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  return summaries;
}

export async function loadCanvas(vaultPath: string, relativePath: string): Promise<CanvasLoadResult> {
  const rel = relativePath.replace(/\\/g, "/");
  if (!rel.startsWith(`${CANVAS_DIR_SEG}/`) || !rel.endsWith(".canvas")) {
    throw new Error("Invalid canvas path");
  }
  const abs = path.join(vaultPath, rel);
  let raw = "";
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch {
    return { document: emptyCanvasDocument(), warnings: [], errors: [] };
  }
  return parseCanvasMermaid(raw);
}

export async function saveCanvas(vaultPath: string, relativePath: string, doc: CanvasDocument): Promise<void> {
  const rel = relativePath.replace(/\\/g, "/");
  if (!rel.startsWith(`${CANVAS_DIR_SEG}/`) || !rel.endsWith(".canvas")) {
    throw new Error("Invalid canvas path");
  }
  const sanitized = sanitizeCanvasDocument(doc);
  const abs = path.join(vaultPath, rel);
  await atomicWriteCanvas(abs, serializeCanvasMermaid(sanitized));
}

export async function createCanvas(vaultPath: string, name: string): Promise<CanvasSummary> {
  const stem = sanitizeStem(name);
  let candidate = stem;
  let suffix = 2;
  while (true) {
    const rel = canvasRelPath(candidate);
    const abs = path.join(vaultPath, rel);
    const exists = await fs.stat(abs).catch(() => null);
    if (!exists) {
      await atomicWriteCanvas(abs, emptyCanvasMermaidTemplate());
      const stat = await fs.stat(abs);
      return { relativePath: rel, name: candidate, updatedAt: stat.mtimeMs };
    }
    candidate = `${stem} ${suffix}`;
    suffix += 1;
  }
}

export async function deleteCanvas(vaultPath: string, relativePath: string): Promise<void> {
  const rel = relativePath.replace(/\\/g, "/");
  if (!rel.startsWith(`${CANVAS_DIR_SEG}/`) || !rel.endsWith(".canvas")) {
    throw new Error("Invalid canvas path");
  }
  const abs = path.join(vaultPath, rel);
  await fs.unlink(abs).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
  });
}
