import { describe, expect, it } from "vitest";
import {
  NAV_MEMORY_STACK_LIMIT,
  cloneNavMemory,
  navMemoryEqual,
  pushNavStackLimited,
  type NavMemory,
} from "./navMemory";

function sampleMemory(overrides: Partial<NavMemory> = {}): NavMemory {
  return {
    selectedPath: "/pages/a.md",
    viewMode: "list",
    kanbanFocus: { boardId: null, columnId: null, notePath: null },
    userGuideOpen: false,
    listSearchFilter: null,
    openTabs: [{ id: "t1", kind: "note", path: "/pages/a.md" }],
    activeTabId: "t1",
    query: "",
    searchMode: "keyword",
    showSearchResults: false,
    ...overrides,
  };
}

describe("navMemory stacks", () => {
  it("cloneNavMemory deep-copies openTabs", () => {
    const original = sampleMemory({
      openTabs: [
        { id: "a", kind: "note", path: "/pages/x.md" },
        { id: "b", kind: "tag", tag: "t" },
      ],
    });
    const copy = cloneNavMemory(original);
    copy.openTabs[0]!.path = "/pages/changed.md";
    expect(original.openTabs[0]!.path).toBe("/pages/x.md");
  });

  it("cloneNavMemory preserves search mode", () => {
    const copy = cloneNavMemory(sampleMemory({ searchMode: "semantic" }));
    expect(copy.searchMode).toBe("semantic");
  });

  it("navMemoryEqual compares search mode", () => {
    expect(navMemoryEqual(sampleMemory({ searchMode: "keyword" }), sampleMemory({ searchMode: "semantic" }))).toBe(
      false,
    );
  });

  it("pushNavStackLimited drops oldest when over limit", () => {
    const stack: NavMemory[] = [];
    for (let i = 0; i < NAV_MEMORY_STACK_LIMIT + 5; i += 1) {
      pushNavStackLimited(stack, sampleMemory({ query: String(i) }));
    }
    expect(stack.length).toBe(NAV_MEMORY_STACK_LIMIT);
    expect(stack[0]?.query).toBe("5");
    expect(stack[stack.length - 1]?.query).toBe(String(NAV_MEMORY_STACK_LIMIT + 4));
  });
});
