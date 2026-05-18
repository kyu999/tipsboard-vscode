import { sortNotesWithPinOrder } from "@/lib/sortNotesWithPinOrder";
import type { NoteSummary, VaultSnapshot } from "@/types";

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Inserts or replaces a single note in the vault snapshot (e.g. after `createNote` RPC).
 * Keeps pin ordering and updatedAt sort consistent with the host vault reader.
 */
export function mergeCreatedNoteIntoSnapshot(prev: VaultSnapshot, note: NoteSummary): VaultSnapshot {
  const key = normPath(note.path);
  const without = prev.notes.filter((n) => normPath(n.path) !== key);
  const notes = sortNotesWithPinOrder([...without, note], prev.pins);
  return {
    ...prev,
    notes,
  };
}
