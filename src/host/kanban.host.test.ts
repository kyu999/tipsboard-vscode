import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { KanbanBoard, KanbanState } from "../types/editor.js";
import { loadKanbanState, moveKanbanNote, saveKanbanState } from "./kanban.js";

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

describe("kanban host", () => {
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
});
