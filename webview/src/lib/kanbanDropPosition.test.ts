import { describe, expect, it } from "vitest";
import type { KanbanCardState } from "@/types";
import { getKanbanDropPosition } from "./kanbanDropPosition";

const cards: KanbanCardState[] = [
  { note_path: "pages/a.md", column_id: "todo", position: 0 },
  { note_path: "pages/b.md", column_id: "todo", position: 1 },
  { note_path: "pages/c.md", column_id: "todo", position: 2 },
];

describe("getKanbanDropPosition", () => {
  it("calculates before and after positions while excluding the dragged card", () => {
    expect(getKanbanDropPosition(cards, "pages/c.md", "pages/a.md", "before")).toBe(0);
    expect(getKanbanDropPosition(cards, "pages/a.md", "pages/c.md", "after")).toBe(2);
  });

  it("returns the end position when dropping on the column body", () => {
    expect(getKanbanDropPosition(cards, "pages/b.md", null, "end")).toBe(2);
  });

  it("keeps the current position when dropping onto itself", () => {
    expect(getKanbanDropPosition(cards, "pages/b.md", "pages/b.md", "after")).toBe(1);
  });

  it("falls back to the end position when the target card is not found", () => {
    expect(getKanbanDropPosition(cards, "pages/a.md", "pages/missing.md", "before")).toBe(2);
  });
});
