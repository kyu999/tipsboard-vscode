import { describe, expect, it } from "vitest";
import type { KanbanState, NoteSummary, VaultSnapshot } from "@/types";
import { mergeCreatedNoteIntoSnapshot } from "./mergeCreatedNote";
import { applyMoveKanbanNoteInState, applyMoveKanbanNotesInState } from "./kanbanStateOps";

const baseSnapshot: VaultSnapshot = {
  vaultPath: "/vault",
  notes: [
    {
      path: "pages/a.md",
      filename: "a.md",
      title: "A",
      normalizedTitle: "a",
      body: "",
      preview: "",
      updatedAt: 1,
      createdAt: 1,
    },
  ],
  attachments: [],
  pins: [],
  kanban: {
    version: 1,
    boards: [
      {
        id: "board-1",
        name: "Main",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        columns: [
          {
            id: "todo",
            board_id: "board-1",
            name: "Todo",
            position: 0,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        cards: [{ note_path: "pages/a.md", column_id: "todo", position: 0 }],
      },
    ],
  },
  canvases: [],
};

const state: KanbanState = {
  version: 1,
  boards: [
    {
      id: "board-1",
      name: "Main",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      columns: [
        {
          id: "todo",
          board_id: "board-1",
          name: "Todo",
          position: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "done",
          board_id: "board-1",
          name: "Done",
          position: 1,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      cards: [
        { note_path: "pages/a.md", column_id: "todo", position: 0 },
        { note_path: "pages/b.md", column_id: "todo", position: 1 },
        { note_path: "pages/c.md", column_id: "done", position: 0 },
      ],
    },
  ],
};

function cardsInColumn(next: KanbanState, columnId: string): string[] {
  const board = next.boards[0];
  if (!board) return [];
  return board.cards
    .filter((card) => card.column_id === columnId)
    .sort((a, b) => a.position - b.position)
    .map((card) => card.note_path);
}

describe("kanbanStateOps", () => {
  it("moves a card within a column", () => {
    const next = applyMoveKanbanNoteInState(state, "board-1", "pages/b.md", "todo", 0);
    expect(cardsInColumn(next, "todo")).toEqual(["pages/b.md", "pages/a.md"]);
  });

  it("moves a card across columns", () => {
    const next = applyMoveKanbanNoteInState(state, "board-1", "pages/b.md", "done", 1);
    expect(cardsInColumn(next, "todo")).toEqual(["pages/a.md"]);
    expect(cardsInColumn(next, "done")).toEqual(["pages/c.md", "pages/b.md"]);
  });

  it("applies multiple moves in order", () => {
    const next = applyMoveKanbanNotesInState(state, "board-1", [
      { notePath: "pages/a.md", toColumnId: "done", position: 0 },
      { notePath: "pages/c.md", toColumnId: "todo", position: 1 },
    ]);
    expect(cardsInColumn(next, "todo")).toEqual(["pages/b.md", "pages/c.md"]);
    expect(cardsInColumn(next, "done")).toEqual(["pages/a.md"]);
  });

  it("keeps notes and kanban in sync when creating a card in a column", () => {
    const createdNote: NoteSummary = {
      path: "pages/new.md",
      filename: "new.md",
      title: "New card",
      normalizedTitle: "new card",
      body: "",
      preview: "",
      updatedAt: 2,
      createdAt: 2,
    };
    const withNote = mergeCreatedNoteIntoSnapshot(baseSnapshot, createdNote);
    const nextSnapshot = {
      ...withNote,
      kanban: applyMoveKanbanNoteInState(withNote.kanban, "board-1", createdNote.path, "todo", 1),
    };

    expect(nextSnapshot.notes.some((note) => note.path === "pages/new.md")).toBe(true);
    expect(
      nextSnapshot.kanban.boards[0]?.cards.some(
        (card) => card.note_path === "pages/new.md" && card.column_id === "todo",
      ),
    ).toBe(true);
  });
});
