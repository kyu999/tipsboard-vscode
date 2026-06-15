import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { KanbanBoard, KanbanState } from "../types/editor.js";
import { loadKanbanState, moveKanbanNote, moveKanbanNotes, reorderKanbanColumns, saveKanbanState } from "./kanban.js";

async function withVault(run: (vaultPath: string) => Promise<void>): Promise<void> {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "tipsboard-vs-kanban-"));
  try {
    await run(vaultPath);
  } finally {
    await fs.rm(vaultPath, { recursive: true, force: true });
  }
}

function boardWithCards(cards: KanbanBoard["cards"]): KanbanState {
  return {
    version: 1,
    boards: [
      {
        id: "board-1",
        name: "Board",
        created_at: "2026-05-16T00:00:00.000Z",
        updated_at: "2026-05-16T00:00:00.000Z",
        columns: [
          {
            id: "todo",
            board_id: "board-1",
            name: "Todo",
            position: 0,
            created_at: "2026-05-16T00:00:00.000Z",
            updated_at: "2026-05-16T00:00:00.000Z",
          },
          {
            id: "done",
            board_id: "board-1",
            name: "Done",
            position: 1,
            created_at: "2026-05-16T00:00:00.000Z",
            updated_at: "2026-05-16T00:00:00.000Z",
          },
        ],
        cards,
      },
    ],
  };
}

function cardsInColumn(state: KanbanState, columnId: string): string[] {
  const board = state.boards[0];
  if (!board) return [];
  return board.cards
    .filter((card) => card.column_id === columnId)
    .sort((a, b) => a.position - b.position)
    .map((card) => `${card.note_path}:${card.position}`);
}

async function kanbanSnapshotJson(vaultPath: string): Promise<string> {
  return JSON.stringify(await loadKanbanState(vaultPath));
}

function boardWithThreeColumns(cards: KanbanBoard["cards"]): KanbanState {
  const ts = "2026-05-16T00:00:00.000Z";
  return {
    version: 1,
    boards: [
      {
        id: "board-1",
        name: "Board",
        created_at: ts,
        updated_at: ts,
        columns: [
          { id: "left", board_id: "board-1", name: "L", position: 0, created_at: ts, updated_at: ts },
          { id: "mid", board_id: "board-1", name: "M", position: 1, created_at: ts, updated_at: ts },
          { id: "right", board_id: "board-1", name: "R", position: 2, created_at: ts, updated_at: ts },
        ],
        cards,
      },
    ],
  };
}

describe("kanban host", () => {
  it("reorders columns and assigns contiguous positions", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(vaultPath, boardWithCards([]));
      await reorderKanbanColumns(vaultPath, "board-1", ["done", "todo"]);
      const state = await loadKanbanState(vaultPath);
      const board = state.boards[0];
      expect(board?.columns.map((c) => c.id)).toEqual(["done", "todo"]);
      expect(board?.columns.map((c) => c.position)).toEqual([0, 1]);
    });
  });

  it("reorderKanbanColumns throws Board not found and leaves state unchanged", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(vaultPath, boardWithCards([]));
      const before = await kanbanSnapshotJson(vaultPath);
      await expect(reorderKanbanColumns(vaultPath, "missing-board", ["done", "todo"])).rejects.toThrow(
        "Board not found",
      );
      expect(await kanbanSnapshotJson(vaultPath)).toBe(before);
    });
  });

  it("reorderKanbanColumns throws Invalid column order for duplicate IDs and leaves state unchanged", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(vaultPath, boardWithCards([]));
      const before = await kanbanSnapshotJson(vaultPath);
      await expect(reorderKanbanColumns(vaultPath, "board-1", ["todo", "todo"])).rejects.toThrow(
        "Invalid column order",
      );
      expect(await kanbanSnapshotJson(vaultPath)).toBe(before);
    });
  });

  it("reorderKanbanColumns throws Invalid column order for unknown column ID", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(vaultPath, boardWithCards([]));
      const before = await kanbanSnapshotJson(vaultPath);
      await expect(reorderKanbanColumns(vaultPath, "board-1", ["todo", "bogus"])).rejects.toThrow(
        "Invalid column order",
      );
      expect(await kanbanSnapshotJson(vaultPath)).toBe(before);
    });
  });

  it("reorderKanbanColumns throws Invalid column order when ordered length mismatches column count", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(vaultPath, boardWithCards([]));
      const before = await kanbanSnapshotJson(vaultPath);
      await expect(reorderKanbanColumns(vaultPath, "board-1", ["todo"])).rejects.toThrow("Invalid column order");
      await expect(reorderKanbanColumns(vaultPath, "board-1", ["todo", "done", "extra"])).rejects.toThrow(
        "Invalid column order",
      );
      expect(await kanbanSnapshotJson(vaultPath)).toBe(before);
    });
  });

  it("reorderKanbanColumns preserves cards and only rewires columns", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(
        vaultPath,
        boardWithCards([
          { note_path: "pages/a.md", column_id: "todo", position: 0 },
          { note_path: "pages/b.md", column_id: "done", position: 0 },
        ]),
      );
      await reorderKanbanColumns(vaultPath, "board-1", ["done", "todo"]);
      const state = await loadKanbanState(vaultPath);
      expect(cardsInColumn(state, "todo")).toEqual(["pages/a.md:0"]);
      expect(cardsInColumn(state, "done")).toEqual(["pages/b.md:0"]);
    });
  });

  it("reorderKanbanColumns handles three-column permutations", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(
        vaultPath,
        boardWithThreeColumns([
          { note_path: "pages/z.md", column_id: "left", position: 0 },
          { note_path: "pages/q.md", column_id: "right", position: 0 },
        ]),
      );
      await reorderKanbanColumns(vaultPath, "board-1", ["right", "mid", "left"]);
      const state = await loadKanbanState(vaultPath);
      const board = state.boards[0];
      expect(board?.columns.map((c) => c.id)).toEqual(["right", "mid", "left"]);
      expect(board?.columns.map((c) => c.position)).toEqual([0, 1, 2]);
      expect(cardsInColumn(state, "left")).toEqual(["pages/z.md:0"]);
      expect(cardsInColumn(state, "right")).toEqual(["pages/q.md:0"]);
    });
  });

  it("moves a card within the same column and renumbers positions", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(
        vaultPath,
        boardWithCards([
          { note_path: "pages/a.md", column_id: "todo", position: 0 },
          { note_path: "pages/b.md", column_id: "todo", position: 1 },
          { note_path: "pages/c.md", column_id: "todo", position: 2 },
        ]),
      );

      await moveKanbanNote(vaultPath, "board-1", "pages/c.md", "todo", 0);
      const afterTopMove = await loadKanbanState(vaultPath);
      expect(cardsInColumn(afterTopMove, "todo")).toEqual(["pages/c.md:0", "pages/a.md:1", "pages/b.md:2"]);

      await moveKanbanNote(vaultPath, "board-1", "pages/c.md", "todo", 2);
      const afterBottomMove = await loadKanbanState(vaultPath);
      expect(cardsInColumn(afterBottomMove, "todo")).toEqual(["pages/a.md:0", "pages/b.md:1", "pages/c.md:2"]);
    });
  });

  it("renumbers both source and target columns when moving between columns", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(
        vaultPath,
        boardWithCards([
          { note_path: "pages/a.md", column_id: "todo", position: 0 },
          { note_path: "pages/b.md", column_id: "todo", position: 1 },
          { note_path: "pages/c.md", column_id: "todo", position: 2 },
          { note_path: "pages/x.md", column_id: "done", position: 0 },
        ]),
      );

      await moveKanbanNote(vaultPath, "board-1", "pages/b.md", "done", 1);
      const state = await loadKanbanState(vaultPath);

      expect(cardsInColumn(state, "todo")).toEqual(["pages/a.md:0", "pages/c.md:1"]);
      expect(cardsInColumn(state, "done")).toEqual(["pages/x.md:0", "pages/b.md:1"]);
    });
  });

  it("clamps out-of-range positions", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(
        vaultPath,
        boardWithCards([
          { note_path: "pages/a.md", column_id: "todo", position: 0 },
          { note_path: "pages/b.md", column_id: "todo", position: 1 },
          { note_path: "pages/c.md", column_id: "todo", position: 2 },
        ]),
      );

      await moveKanbanNote(vaultPath, "board-1", "pages/c.md", "todo", -10);
      const afterNegative = await loadKanbanState(vaultPath);
      expect(cardsInColumn(afterNegative, "todo")).toEqual(["pages/c.md:0", "pages/a.md:1", "pages/b.md:2"]);

      await moveKanbanNote(vaultPath, "board-1", "pages/c.md", "todo", 99);
      const afterOverflow = await loadKanbanState(vaultPath);
      expect(cardsInColumn(afterOverflow, "todo")).toEqual(["pages/a.md:0", "pages/b.md:1", "pages/c.md:2"]);
    });
  });

  it("moves multiple notes in one save", async () => {
    await withVault(async (vaultPath) => {
      await saveKanbanState(
        vaultPath,
        boardWithCards([
          { note_path: "pages/a.md", column_id: "todo", position: 0 },
          { note_path: "pages/b.md", column_id: "todo", position: 1 },
          { note_path: "pages/c.md", column_id: "done", position: 0 },
        ]),
      );

      await moveKanbanNotes(vaultPath, "board-1", [
        { notePath: "pages/a.md", toColumnId: "done", position: 0 },
        { notePath: "pages/c.md", toColumnId: "todo", position: 1 },
      ]);
      const state = await loadKanbanState(vaultPath);
      expect(cardsInColumn(state, "todo")).toEqual(["pages/b.md:0", "pages/c.md:1"]);
      expect(cardsInColumn(state, "done")).toEqual(["pages/a.md:0"]);
    });
  });
});
