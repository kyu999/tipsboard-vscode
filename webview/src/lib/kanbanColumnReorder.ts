/** 現在の列 ID の順に対して、dragId を target の前または後ろへ動かした新しい順序。不要なときは null。 */
export function reorderColumnsWithPlacement(
  orderedIds: readonly string[],
  dragId: string,
  targetId: string,
  placement: "before" | "after",
): string[] | null {
  if (dragId === targetId) return null;
  const without = orderedIds.filter((id) => id !== dragId);
  const idx = without.indexOf(targetId);
  if (idx < 0) return null;
  const insertAt = placement === "after" ? idx + 1 : idx;
  return [...without.slice(0, insertAt), dragId, ...without.slice(insertAt)];
}
