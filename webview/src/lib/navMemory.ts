import type { EditorTab } from "./editorTabs";

export interface NavMemory {
  selectedPath: string | null;
  viewMode: "list" | "kanban" | "attachments";
  kanbanFocus: {
    boardId: string | null;
    columnId: string | null;
    notePath: string | null;
  };
  userGuideOpen: boolean;
  listSearchFilter: string | null;
  openTabs: EditorTab[];
  activeTabId: string | null;
  query: string;
  showSearchResults: boolean;
}

export const NAV_MEMORY_STACK_LIMIT = 50;

export function navMemoryEqual(a: NavMemory, b: NavMemory): boolean {
  return (
    a.selectedPath === b.selectedPath &&
    a.viewMode === b.viewMode &&
    a.kanbanFocus.boardId === b.kanbanFocus.boardId &&
    a.kanbanFocus.columnId === b.kanbanFocus.columnId &&
    a.kanbanFocus.notePath === b.kanbanFocus.notePath &&
    a.userGuideOpen === b.userGuideOpen &&
    a.listSearchFilter === b.listSearchFilter &&
    a.activeTabId === b.activeTabId &&
    a.query === b.query &&
    a.showSearchResults === b.showSearchResults &&
    JSON.stringify(a.openTabs) === JSON.stringify(b.openTabs)
  );
}

export function cloneNavMemory(entry: NavMemory): NavMemory {
  return {
    selectedPath: entry.selectedPath,
    viewMode: entry.viewMode,
    kanbanFocus: { ...entry.kanbanFocus },
    userGuideOpen: entry.userGuideOpen,
    listSearchFilter: entry.listSearchFilter,
    openTabs: entry.openTabs.map((t) => ({ ...t })),
    activeTabId: entry.activeTabId,
    query: entry.query,
    showSearchResults: entry.showSearchResults,
  };
}

export function pushNavStackLimited(stack: NavMemory[], entry: NavMemory, limit = NAV_MEMORY_STACK_LIMIT): void {
  stack.push(entry);
  if (stack.length > limit) stack.shift();
}
