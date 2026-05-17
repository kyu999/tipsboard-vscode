import { normalizeTitle } from "@/domain/title/title";

export type EditorNoteTab = { id: string; kind: "note"; path: string };
export type EditorTagTab = { id: string; kind: "tag"; tag: string };
export type EditorTab = EditorNoteTab | EditorTagTab;

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function newTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `tb-tab-${crypto.randomUUID()}`;
  }
  return `tb-tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function tagKeyForTab(tag: string): string {
  return normalizeTitle(tag);
}

export function createNoteTab(path: string, id: string = newTabId()): EditorNoteTab {
  return { id, kind: "note", path };
}

export function createTagTab(tag: string, id: string = newTabId()): EditorTagTab {
  return { id, kind: "tag", tag };
}

export function findNoteTabIndexByPath(tabs: readonly EditorTab[], path: string): number {
  const norm = normalizePath(path);
  return tabs.findIndex((t) => t.kind === "note" && normalizePath(t.path) === norm);
}

export function findTagTabIndex(tabs: readonly EditorTab[], tag: string): number {
  const key = tagKeyForTab(tag);
  return tabs.findIndex((t) => t.kind === "tag" && tagKeyForTab(t.tag) === key);
}

export type AddTabResult = {
  tabs: EditorTab[];
  activeTabId: string;
  focusedExisting: boolean;
};

/**
 * Adds or focuses a note tab. Dedupes by path. `newTab: true` always appends unless path already open.
 * `newTab: false` with existing tabs replaces the active slot when it is a note, or converts a tag slot to a note.
 */
export function addOrFocusNoteTab(
  tabs: readonly EditorTab[],
  activeTabId: string | null,
  path: string,
  options: { newTab: boolean },
): AddTabResult {
  const existingIdx = findNoteTabIndexByPath(tabs, path);
  if (existingIdx >= 0) {
    const t = tabs[existingIdx]!;
    return { tabs: [...tabs], activeTabId: t.id, focusedExisting: true };
  }

  if (options.newTab || tabs.length === 0) {
    const nt = createNoteTab(path);
    return { tabs: [...tabs, nt], activeTabId: nt.id, focusedExisting: false };
  }

  if (!activeTabId) {
    const nt = createNoteTab(path);
    return { tabs: [nt], activeTabId: nt.id, focusedExisting: false };
  }

  const ai = tabs.findIndex((t) => t.id === activeTabId);
  if (ai < 0) {
    const nt = createNoteTab(path);
    return { tabs: [...tabs, nt], activeTabId: nt.id, focusedExisting: false };
  }

  const cur = tabs[ai]!;
  const next = tabs.slice();
  if (cur.kind === "note") {
    next[ai] = { ...cur, path };
    return { tabs: next, activeTabId: cur.id, focusedExisting: false };
  }
  next[ai] = createNoteTab(path, cur.id);
  return { tabs: next, activeTabId: cur.id, focusedExisting: false };
}

export function addOrFocusTagTab(
  tabs: readonly EditorTab[],
  activeTabId: string | null,
  tag: string,
  options: { newTab: boolean },
): AddTabResult {
  const existingIdx = findTagTabIndex(tabs, tag);
  if (existingIdx >= 0) {
    const t = tabs[existingIdx]!;
    return { tabs: [...tabs], activeTabId: t.id, focusedExisting: true };
  }

  if (options.newTab || tabs.length === 0) {
    const tt = createTagTab(tag);
    return { tabs: [...tabs, tt], activeTabId: tt.id, focusedExisting: false };
  }

  if (!activeTabId) {
    const tt = createTagTab(tag);
    return { tabs: [tt], activeTabId: tt.id, focusedExisting: false };
  }

  const ai = tabs.findIndex((t) => t.id === activeTabId);
  if (ai < 0) {
    const tt = createTagTab(tag);
    return { tabs: [...tabs, tt], activeTabId: tt.id, focusedExisting: false };
  }

  const cur = tabs[ai]!;
  const next = tabs.slice();
  if (cur.kind === "tag") {
    next[ai] = { ...cur, tag };
    return { tabs: next, activeTabId: cur.id, focusedExisting: false };
  }
  next[ai] = createTagTab(tag, cur.id);
  return { tabs: next, activeTabId: cur.id, focusedExisting: false };
}

export type RemoveTabResult = {
  tabs: EditorTab[];
  activeTabId: string;
};

/** Returns null when tabs.length <= 1 (last tab must remain). */
export function removeTabAtId(
  tabs: readonly EditorTab[],
  activeTabId: string,
  tabIdToRemove: string,
): RemoveTabResult | null {
  if (tabs.length <= 1) return null;
  const ri = tabs.findIndex((t) => t.id === tabIdToRemove);
  if (ri < 0) return null;
  const nextTabs = tabs.filter((t) => t.id !== tabIdToRemove);
  let nextActive = activeTabId;
  if (activeTabId === tabIdToRemove) {
    const ni = ri > 0 ? ri - 1 : 0;
    nextActive = nextTabs[ni]!.id;
  }
  return { tabs: nextTabs, activeTabId: nextActive };
}

export function renameNotePathInTabs(
  tabs: readonly EditorTab[],
  oldPath: string,
  newPath: string,
): EditorTab[] {
  const o = normalizePath(oldPath);
  return tabs.map((t) =>
    t.kind === "note" && normalizePath(t.path) === o ? { ...t, path: newPath } : t,
  );
}

export function dropTabsForMissingPaths(
  tabs: readonly EditorTab[],
  activeTabId: string | null,
  existingPaths: ReadonlySet<string>,
): { tabs: EditorTab[]; activeTabId: string | null } {
  const pathsOk = (p: string) => existingPaths.has(normalizePath(p));
  const filtered = tabs.filter((t) => (t.kind === "tag" ? true : pathsOk(t.path)));
  if (filtered.length === 0) {
    return { tabs: [], activeTabId: null };
  }
  let nextActive = activeTabId;
  if (!nextActive || !filtered.some((t) => t.id === nextActive)) {
    nextActive = filtered[0]!.id;
  }
  return { tabs: filtered, activeTabId: nextActive };
}
