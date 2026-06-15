import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { KanbanBoard, KanbanCardState, KanbanColumn, KanbanState } from "../types/editor.js";

const KANBAN_SEG = `.tipsboard/kanban.json`;

function kanbanAbs(vaultPath: string): string {
  return path.join(vaultPath, ...KANBAN_SEG.split("/"));
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyState(): KanbanState {
  return { version: 1, boards: [] };
}

export async function loadKanbanState(vaultPath: string): Promise<KanbanState> {
  const abs = kanbanAbs(vaultPath);
  let raw = "";
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch {
    return emptyState();
  }
  try {
    const parsed = JSON.parse(raw) as KanbanState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.boards)) return emptyState();
    return sanitizeKanban(parsed);
  } catch {
    return emptyState();
  }
}

function sanitizeKanban(input: KanbanState): KanbanState {
  return {
    version: 1,
    boards: input.boards.map((b) => ({
      ...b,
      columns: Array.isArray(b.columns) ? b.columns.slice() : [],
      cards: Array.isArray(b.cards) ? b.cards.slice() : [],
    })),
  };
}

export async function saveKanbanState(vaultPath: string, state: KanbanState): Promise<void> {
  const dir = path.join(vaultPath, ".tipsboard");
  await fs.mkdir(dir, { recursive: true });
  const target = kanbanAbs(vaultPath);
  const tmp = `${target}.${randomUUID()}.tmp`;
  const json = `${JSON.stringify(state, null, 2)}\n`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, target);
}

export async function patchKanbanNotePaths(
  vaultPath: string,
  oldRelative: string,
  newRelative: string,
): Promise<void> {
  const oldN = oldRelative.replace(/\\/g, "/");
  const newN = newRelative.replace(/\\/g, "/");
  if (oldN === newN) return;
  const state = await loadKanbanState(vaultPath);
  for (const b of state.boards) {
    for (const c of b.cards) {
      if (c.note_path.replace(/\\/g, "/") === oldN) c.note_path = newN;
    }
  }
  await saveKanbanState(vaultPath, state);
}

export function cleanupKanbanAfterNoteDelete(state: KanbanState, deletedRelative: string): KanbanState {
  const del = deletedRelative.replace(/\\/g, "/");
  return {
    ...state,
    boards: state.boards.map((b) => ({
      ...b,
      cards: b.cards.filter((c) => c.note_path.replace(/\\/g, "/") !== del),
    })),
  };
}

export async function createKanbanBoard(vaultPath: string, name: string): Promise<void> {
  const state = await loadKanbanState(vaultPath);
  const id = randomUUID();
  const ts = nowIso();
  const board: KanbanBoard = {
    id,
    name,
    created_at: ts,
    updated_at: ts,
    columns: [],
    cards: [],
  };
  state.boards.push(board);
  await saveKanbanState(vaultPath, state);
}

export async function updateKanbanBoard(vaultPath: string, boardId: string, data: { name?: string }): Promise<void> {
  const state = await loadKanbanState(vaultPath);
  const b = state.boards.find((x) => x.id === boardId);
  if (!b) throw new Error("Board not found");
  if (data.name !== undefined) b.name = data.name;
  b.updated_at = nowIso();
  await saveKanbanState(vaultPath, state);
}

export async function deleteKanbanBoard(vaultPath: string, boardId: string): Promise<void> {
  const state = await loadKanbanState(vaultPath);
  state.boards = state.boards.filter((b) => b.id !== boardId);
  await saveKanbanState(vaultPath, state);
}

export async function createKanbanColumn(vaultPath: string, boardId: string, name: string): Promise<void> {
  const state = await loadKanbanState(vaultPath);
  const b = state.boards.find((br) => br.id === boardId);
  if (!b) throw new Error("Board not found");
  const maxPos = b.columns.length === 0 ? 0 : Math.max(...b.columns.map((c) => c.position), 0);
  const id = randomUUID();
  const ts = nowIso();
  const col: KanbanColumn = {
    id,
    board_id: boardId,
    name,
    position: maxPos + 1,
    created_at: ts,
    updated_at: ts,
  };
  b.columns.push(col);
  b.updated_at = nowIso();
  await saveKanbanState(vaultPath, state);
}

export async function updateKanbanColumn(
  vaultPath: string,
  columnId: string,
  data: { name?: string; position?: number },
): Promise<void> {
  const state = await loadKanbanState(vaultPath);
  for (const b of state.boards) {
    const c = b.columns.find((co) => co.id === columnId);
    if (c) {
      if (data.name !== undefined) c.name = data.name;
      if (data.position !== undefined) c.position = data.position;
      c.updated_at = nowIso();
      b.updated_at = nowIso();
      await saveKanbanState(vaultPath, state);
      return;
    }
  }
  throw new Error("Column not found");
}

export async function reorderKanbanColumns(
  vaultPath: string,
  boardId: string,
  orderedColumnIds: readonly string[],
): Promise<void> {
  const state = await loadKanbanState(vaultPath);
  const b = state.boards.find((br) => br.id === boardId);
  if (!b) throw new Error("Board not found");
  const prevIds = new Set(b.columns.map((c) => c.id));
  if (orderedColumnIds.length !== prevIds.size || new Set(orderedColumnIds).size !== orderedColumnIds.length) {
    throw new Error("Invalid column order");
  }
  for (const id of orderedColumnIds) {
    if (!prevIds.has(id)) throw new Error("Invalid column order");
  }
  const byId = new Map(b.columns.map((c) => [c.id, c] as const));
  const ts = nowIso();
  b.columns = orderedColumnIds.map((id) => {
    const col = byId.get(id);
    if (!col) throw new Error("Invalid column order");
    return col;
  });
  orderedColumnIds.forEach((id, index) => {
    const col = byId.get(id);
    if (col) {
      col.position = index;
      col.updated_at = ts;
    }
  });
  b.updated_at = ts;
  await saveKanbanState(vaultPath, state);
}

export async function deleteKanbanColumn(vaultPath: string, columnId: string): Promise<void> {
  const state = await loadKanbanState(vaultPath);
  for (const b of state.boards) {
    const had = b.columns.some((c) => c.id === columnId);
    if (had) {
      b.columns = b.columns.filter((c) => c.id !== columnId);
      b.cards = b.cards.filter((card) => card.column_id !== columnId);
      b.updated_at = nowIso();
      await saveKanbanState(vaultPath, state);
      return;
    }
  }
  throw new Error("Column not found");
}

function renumberColumn(board: KanbanBoard, columnId: string | null): void {
  const list = board.cards
    .filter((c) => (columnId === null ? c.column_id === null : c.column_id === columnId))
    .sort((a, b) => a.position - b.position);
  list.forEach((c, i) => {
    c.position = i;
  });
}

function applyMoveToBoard(
  board: KanbanBoard,
  notePath: string,
  toColumnId: string | null,
  position: number,
): void {
  const np = notePath.replace(/\\/g, "/");

  let card = board.cards.find((c) => c.note_path.replace(/\\/g, "/") === np);
  if (!card) {
    card = { note_path: np, column_id: toColumnId, position: 0 };
    board.cards.push(card);
  }

  const fromCol = card.column_id;
  card.column_id = toColumnId;

  const targetPeers = board.cards
    .filter((c) => c !== card && (toColumnId === null ? c.column_id === null : c.column_id === toColumnId))
    .sort((a, c) => a.position - c.position);

  const insertAt = Math.max(0, Math.min(Math.floor(position), targetPeers.length));
  const ordered = [...targetPeers.slice(0, insertAt), card, ...targetPeers.slice(insertAt)];
  ordered.forEach((c, i) => {
    c.position = i;
  });

  if (fromCol !== toColumnId) {
    renumberColumn(board, fromCol ?? null);
  }
}

export async function moveKanbanNote(
  vaultPath: string,
  boardId: string,
  notePath: string,
  toColumnId: string | null,
  position: number,
): Promise<void> {
  const state = await loadKanbanState(vaultPath);
  const b = state.boards.find((br) => br.id === boardId);
  if (!b) throw new Error("Board not found");
  applyMoveToBoard(b, notePath, toColumnId, position);
  b.updated_at = nowIso();
  await saveKanbanState(vaultPath, state);
}

export async function moveKanbanNotes(
  vaultPath: string,
  boardId: string,
  moves: ReadonlyArray<{ notePath: string; toColumnId: string | null; position: number }>,
): Promise<void> {
  if (moves.length === 0) return;
  const state = await loadKanbanState(vaultPath);
  const b = state.boards.find((br) => br.id === boardId);
  if (!b) throw new Error("Board not found");
  for (const move of moves) {
    applyMoveToBoard(b, move.notePath, move.toColumnId, move.position);
  }
  b.updated_at = nowIso();
  await saveKanbanState(vaultPath, state);
}
