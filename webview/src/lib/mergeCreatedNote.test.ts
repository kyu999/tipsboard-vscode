import { describe, expect, it } from "vitest";

import { mergeCreatedNoteIntoSnapshot } from "./mergeCreatedNote";
import type { NoteSummary, VaultSnapshot } from "@/types";

function note(partial: Partial<NoteSummary> & Pick<NoteSummary, "path" | "title">): NoteSummary {
  return {
    filename: partial.filename ?? "x.md",
    normalizedTitle: partial.normalizedTitle ?? partial.title.toLowerCase(),
    body: partial.body ?? `${partial.title}\n`,
    preview: partial.preview ?? "",
    updatedAt: partial.updatedAt ?? 0,
    createdAt: partial.createdAt ?? 0,
    ...partial,
  };
}

describe("mergeCreatedNoteIntoSnapshot", () => {
  const emptyVault: VaultSnapshot = {
    vaultPath: "/v",
    notes: [],
    pins: [],
    kanban: { version: 1, boards: [] },
  };

  it("adds a new note and sorts by updatedAt among unpinned", () => {
    const older = note({ path: "pages/old.md", title: "Old", updatedAt: 100 });
    const created = note({ path: "pages/new.md", title: "New", updatedAt: 500 });
    const prev: VaultSnapshot = { ...emptyVault, notes: [older] };
    const next = mergeCreatedNoteIntoSnapshot(prev, created);
    expect(next.notes.map((n) => n.path)).toEqual(["pages/new.md", "pages/old.md"]);
  });

  it("replaces an existing path instead of duplicating", () => {
    const a = note({ path: "pages/a.md", title: "A", body: "A\n", updatedAt: 1 });
    const a2 = note({ path: "pages/a.md", title: "A2", body: "A2\n", updatedAt: 2 });
    const prev: VaultSnapshot = { ...emptyVault, notes: [a] };
    const next = mergeCreatedNoteIntoSnapshot(prev, a2);
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]!.title).toBe("A2");
  });

  it("keeps pinned notes before unpinned (same as sortNotesWithPinOrder)", () => {
    const pinned = note({ path: "pages/pin.md", title: "Pin", updatedAt: 1 });
    const fresh = note({ path: "pages/new.md", title: "New", updatedAt: 9999 });
    const prev: VaultSnapshot = {
      ...emptyVault,
      notes: [pinned],
      pins: ["pages/pin.md"],
    };
    const next = mergeCreatedNoteIntoSnapshot(prev, fresh);
    expect(next.notes.map((n) => n.path)).toEqual(["pages/pin.md", "pages/new.md"]);
  });
});
