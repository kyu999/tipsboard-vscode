import type { NoteSummary } from "@/types";

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Pinned paths first (order from `pins`), then by updated date like the vault host. */
export function sortNotesWithPinOrder(notes: readonly NoteSummary[], pins: readonly string[] | undefined): NoteSummary[] {
  const pinOrder = new Map<string, number>();
  (pins ?? []).forEach((raw, i) => {
    const p = normPath(raw);
    if (!pinOrder.has(p)) pinOrder.set(p, i);
  });

  return [...notes].sort((a, b) => {
    const ia = pinOrder.has(normPath(a.path)) ? pinOrder.get(normPath(a.path))! : Number.POSITIVE_INFINITY;
    const ib = pinOrder.has(normPath(b.path)) ? pinOrder.get(normPath(b.path))! : Number.POSITIVE_INFINITY;
    if (ia !== ib) return ia - ib;
    const d = b.updatedAt - a.updatedAt;
    if (d !== 0) return d;
    return a.title.localeCompare(b.title);
  });
}
