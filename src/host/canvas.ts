import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CanvasDocument, CanvasNode, CanvasSummary } from "../types/editor.js";

const CANVAS_DIR_SEG = ".tipsboard/canvas";

function canvasDirAbs(vaultPath: string): string {
  return path.join(vaultPath, ...CANVAS_DIR_SEG.split("/"));
}

function canvasRelPath(stem: string): string {
  return `${CANVAS_DIR_SEG}/${stem}.canvas`;
}

function emptyDocument(): CanvasDocument {
  return {
    version: 1,
    nodes: [],
    edges: [],
    viewport: { zoom: 1, panX: 0, panY: 0 },
  };
}

function sanitizeStem(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : "Untitled";
}

function isCanvasSide(value: unknown): value is CanvasDocument["edges"][number]["fromSide"] {
  return value === "top" || value === "right" || value === "bottom" || value === "left";
}

function isCanvasEdgeEnd(value: unknown): value is NonNullable<CanvasDocument["edges"][number]["fromEnd"]> {
  return value === "none" || value === "arrow";
}

function sanitizeNode(raw: unknown): CanvasNode | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const type = typeof o.type === "string" ? o.type : "";
  const x = typeof o.x === "number" ? o.x : 0;
  const y = typeof o.y === "number" ? o.y : 0;
  const width = typeof o.width === "number" && o.width > 0 ? o.width : 200;
  const height = typeof o.height === "number" && o.height > 0 ? o.height : 120;
  const parentId = typeof o.parentId === "string" ? o.parentId : undefined;
  const base = { id, x, y, width, height, ...(parentId ? { parentId } : {}) };
  if (!id) return null;

  switch (type) {
    case "text":
      return { ...base, type: "text", text: typeof o.text === "string" ? o.text : "" };
    case "note":
      return { ...base, type: "note", path: typeof o.path === "string" ? o.path.replace(/\\/g, "/") : "" };
    case "image":
      return { ...base, type: "image", path: typeof o.path === "string" ? o.path.replace(/\\/g, "/") : "" };
    case "link":
      return { ...base, type: "link", url: typeof o.url === "string" ? o.url : "" };
    case "group":
      return { ...base, type: "group", label: typeof o.label === "string" ? o.label : "" };
    default:
      return null;
  }
}

export function sanitizeCanvasDocument(input: unknown): CanvasDocument {
  if (!input || typeof input !== "object") return emptyDocument();
  const o = input as Record<string, unknown>;
  const nodesRaw = Array.isArray(o.nodes) ? o.nodes : [];
  const edgesRaw = Array.isArray(o.edges) ? o.edges : [];
  const viewportRaw = o.viewport && typeof o.viewport === "object" ? (o.viewport as Record<string, unknown>) : {};

  const nodes = nodesRaw.map(sanitizeNode).filter((n): n is CanvasNode => n !== null);
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges = edgesRaw
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const e = raw as Record<string, unknown>;
      const id = typeof e.id === "string" ? e.id : "";
      const fromNode = typeof e.fromNode === "string" ? e.fromNode : "";
      const toNode = typeof e.toNode === "string" ? e.toNode : "";
      if (!id || !fromNode || !toNode || !nodeIds.has(fromNode) || !nodeIds.has(toNode)) return null;
      const fromSide = isCanvasSide(e.fromSide) ? e.fromSide : "right";
      const toSide = isCanvasSide(e.toSide) ? e.toSide : "left";
      const fromEnd = isCanvasEdgeEnd(e.fromEnd) ? e.fromEnd : "none";
      const toEnd = isCanvasEdgeEnd(e.toEnd) ? e.toEnd : "arrow";
      const label = typeof e.label === "string" ? e.label : undefined;
      const edge: CanvasDocument["edges"][number] = {
        id,
        fromNode,
        toNode,
        fromSide,
        toSide,
      };
      if (label !== undefined && label.length > 0) edge.label = label;
      if (fromEnd !== "none") edge.fromEnd = fromEnd;
      if (toEnd !== "arrow") edge.toEnd = toEnd;
      return edge;
    })
    .filter((e): e is CanvasDocument["edges"][number] => e !== null);

  const zoom = typeof viewportRaw.zoom === "number" && viewportRaw.zoom > 0 ? viewportRaw.zoom : 1;
  const panX = typeof viewportRaw.panX === "number" ? viewportRaw.panX : 0;
  const panY = typeof viewportRaw.panY === "number" ? viewportRaw.panY : 0;

  return { version: 1, nodes, edges, viewport: { zoom, panX, panY } };
}

async function atomicWriteCanvas(abs: string, doc: CanvasDocument): Promise<void> {
  const dir = path.dirname(abs);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${abs}.${randomUUID()}.tmp`;
  const json = `${JSON.stringify(doc, null, 2)}\n`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, abs);
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

export async function loadCanvas(vaultPath: string, relativePath: string): Promise<CanvasDocument> {
  const rel = relativePath.replace(/\\/g, "/");
  if (!rel.startsWith(`${CANVAS_DIR_SEG}/`) || !rel.endsWith(".canvas")) {
    throw new Error("Invalid canvas path");
  }
  const abs = path.join(vaultPath, rel);
  let raw = "";
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch {
    return emptyDocument();
  }
  try {
    return sanitizeCanvasDocument(JSON.parse(raw));
  } catch {
    return emptyDocument();
  }
}

export async function saveCanvas(vaultPath: string, relativePath: string, doc: CanvasDocument): Promise<void> {
  const rel = relativePath.replace(/\\/g, "/");
  if (!rel.startsWith(`${CANVAS_DIR_SEG}/`) || !rel.endsWith(".canvas")) {
    throw new Error("Invalid canvas path");
  }
  const sanitized = sanitizeCanvasDocument(doc);
  const abs = path.join(vaultPath, rel);
  await atomicWriteCanvas(abs, sanitized);
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
      await atomicWriteCanvas(abs, emptyDocument());
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

export function pruneCanvasNoteNodes(doc: CanvasDocument, validPaths: ReadonlySet<string>): CanvasDocument {
  const removedIds = new Set<string>();
  const nodes = doc.nodes.filter((node) => {
    if (node.type !== "note") return true;
    const ok = validPaths.has(node.path.replace(/\\/g, "/"));
    if (!ok) removedIds.add(node.id);
    return ok;
  });
  const edges = doc.edges.filter((e) => !removedIds.has(e.fromNode) && !removedIds.has(e.toNode));
  return { ...doc, nodes, edges };
}

export function patchCanvasDocumentNotePath(
  doc: CanvasDocument,
  oldRelative: string,
  newRelative: string,
): CanvasDocument {
  const oldN = oldRelative.replace(/\\/g, "/");
  const newN = newRelative.replace(/\\/g, "/");
  if (oldN === newN) return doc;
  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      if (node.type !== "note") return node;
      if (node.path.replace(/\\/g, "/") !== oldN) return node;
      return { ...node, path: newN };
    }),
  };
}

export function removeNoteFromCanvasDocument(doc: CanvasDocument, deletedRelative: string): CanvasDocument {
  const del = deletedRelative.replace(/\\/g, "/");
  const removedIds = new Set<string>();
  const nodes = doc.nodes.filter((node) => {
    if (node.type !== "note") return true;
    if (node.path.replace(/\\/g, "/") !== del) return true;
    removedIds.add(node.id);
    return false;
  });
  const edges = doc.edges.filter((e) => !removedIds.has(e.fromNode) && !removedIds.has(e.toNode));
  return { ...doc, nodes, edges };
}

async function forEachCanvasFile(
  vaultPath: string,
  fn: (relativePath: string, doc: CanvasDocument) => CanvasDocument | null,
): Promise<void> {
  const summaries = await listCanvasSummaries(vaultPath);
  for (const summary of summaries) {
    const doc = await loadCanvas(vaultPath, summary.relativePath);
    const next = fn(summary.relativePath, doc);
    if (next !== null) {
      await saveCanvas(vaultPath, summary.relativePath, next);
    }
  }
}

export async function patchCanvasNotePaths(
  vaultPath: string,
  oldRelative: string,
  newRelative: string,
): Promise<void> {
  await forEachCanvasFile(vaultPath, (_rel, doc) => patchCanvasDocumentNotePath(doc, oldRelative, newRelative));
}

export async function cleanupCanvasAfterNoteDelete(vaultPath: string, deletedRelative: string): Promise<void> {
  await forEachCanvasFile(vaultPath, (_rel, doc) => removeNoteFromCanvasDocument(doc, deletedRelative));
}

export async function pruneAllCanvasNoteNodes(vaultPath: string, validPaths: ReadonlySet<string>): Promise<void> {
  await forEachCanvasFile(vaultPath, (_rel, doc) => {
    const pruned = pruneCanvasNoteNodes(doc, validPaths);
    return JSON.stringify(pruned) !== JSON.stringify(doc) ? pruned : null;
  });
}
