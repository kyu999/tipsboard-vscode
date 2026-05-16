import type { KanbanCardState } from "@/types";

export type KanbanDropPlacement = "before" | "after" | "end";

export function getKanbanDropPosition(
  cards: KanbanCardState[],
  draggedNotePath: string,
  targetNotePath: string | null,
  placement: KanbanDropPlacement,
): number {
  if (targetNotePath === draggedNotePath) {
    const currentIndex = cards.findIndex((card) => card.note_path === draggedNotePath);
    if (currentIndex !== -1) return currentIndex;
  }

  const orderedCards = cards.filter((card) => card.note_path !== draggedNotePath);
  if (placement === "end" || !targetNotePath) return orderedCards.length;

  const targetIndex = orderedCards.findIndex((card) => card.note_path === targetNotePath);
  if (targetIndex === -1) return orderedCards.length;

  return placement === "before" ? targetIndex : targetIndex + 1;
}
