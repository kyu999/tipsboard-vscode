import { describe, expect, it } from "vitest";
import {
  addOrFocusNoteTab,
  addOrFocusTagTab,
  findNoteTabIndexByPath,
  findTagTabIndex,
  removeTabAtId,
  renameNotePathInTabs,
} from "./editorTabs";

describe("editorTabs", () => {
  it("addOrFocusNoteTab dedupes by path", () => {
    const a = addOrFocusNoteTab([], null, "pages/A.md", { newTab: false });
    expect(a.tabs).toHaveLength(1);
    expect(a.focusedExisting).toBe(false);
    const b = addOrFocusNoteTab(a.tabs, a.activeTabId, "pages/B.md", { newTab: true });
    expect(b.tabs).toHaveLength(2);
    const c = addOrFocusNoteTab(b.tabs, b.activeTabId, "pages/A.md", { newTab: true });
    expect(c.tabs).toHaveLength(2);
    expect(c.activeTabId).toBe(a.tabs[0]!.id);
    expect(c.focusedExisting).toBe(true);
  });

  it("addOrFocusNoteTab replaces active note when newTab false", () => {
    const a = addOrFocusNoteTab([], null, "pages/A.md", { newTab: false });
    const b = addOrFocusNoteTab(a.tabs, a.activeTabId, "pages/B.md", { newTab: false });
    expect(b.tabs).toHaveLength(1);
    expect(findNoteTabIndexByPath(b.tabs, "pages/B.md")).toBe(0);
    expect(findNoteTabIndexByPath(b.tabs, "pages/A.md")).toBe(-1);
  });

  it("removeTabAtId refuses when only one tab", () => {
    const a = addOrFocusNoteTab([], null, "pages/A.md", { newTab: false });
    expect(removeTabAtId(a.tabs, a.activeTabId, a.activeTabId)).toBeNull();
  });

  it("removeTabAtId picks neighbor when closing active", () => {
    const a = addOrFocusNoteTab([], null, "pages/A.md", { newTab: false });
    const b = addOrFocusNoteTab(a.tabs, a.activeTabId, "pages/B.md", { newTab: true });
    const removed = removeTabAtId(b.tabs, b.activeTabId, b.activeTabId);
    expect(removed).not.toBeNull();
    expect(removed!.tabs).toHaveLength(1);
    expect(findNoteTabIndexByPath(removed!.tabs, "pages/A.md")).toBe(0);
  });

  it("addOrFocusTagTab dedupes", () => {
    const a = addOrFocusTagTab([], null, "work", { newTab: false });
    const b = addOrFocusTagTab(a.tabs, a.activeTabId, "work", { newTab: true });
    expect(b.tabs).toHaveLength(1);
    expect(b.focusedExisting).toBe(true);
  });

  it("findTagTabIndex matches normalized tag", () => {
    const a = addOrFocusTagTab([], null, "  Work Item  ", { newTab: false });
    expect(findTagTabIndex(a.tabs, "work item")).toBe(0);
  });

  it("renameNotePathInTabs updates path", () => {
    const a = addOrFocusNoteTab([], null, "old.md", { newTab: false });
    const next = renameNotePathInTabs(a.tabs, "old.md", "new.md");
    expect(findNoteTabIndexByPath(next, "new.md")).toBe(0);
  });
});
