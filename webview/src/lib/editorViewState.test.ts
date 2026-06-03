import { describe, expect, it } from "vitest";

import {
  clampEditorViewState,
  deleteEditorViewStateFromCache,
  getEditorViewStateFromCache,
  moveEditorViewStateInCache,
  normalizeEditorViewStateKey,
  setEditorViewStateInCache,
  type EditorViewState,
} from "./editorViewState";

function sampleState(overrides: Partial<EditorViewState> = {}): EditorViewState {
  return {
    anchor: 10,
    head: 20,
    scrollTop: 100,
    containerScrollTop: 200,
    ...overrides,
  };
}

describe("editorViewState", () => {
  it("normalizes path keys", () => {
    expect(normalizeEditorViewStateKey("a\\b.md")).toBe("a/b.md");
  });

  it("clamps selection offsets to doc length", () => {
    expect(clampEditorViewState(sampleState({ anchor: 50, head: 80 }), 30)).toEqual({
      anchor: 30,
      head: 30,
      scrollTop: 100,
      containerScrollTop: 200,
    });
  });

  it("clamps negative scroll values to zero", () => {
    expect(clampEditorViewState(sampleState({ scrollTop: -5, containerScrollTop: -1 }), 100)).toEqual({
      anchor: 10,
      head: 20,
      scrollTop: 0,
      containerScrollTop: 0,
    });
  });

  it("moves cache entries on path rename", () => {
    const cache = new Map<string, EditorViewState>();
    setEditorViewStateInCache(cache, "old.md", sampleState());
    moveEditorViewStateInCache(cache, "old.md", "new.md");
    expect(getEditorViewStateFromCache(cache, "old.md")).toBeUndefined();
    expect(getEditorViewStateFromCache(cache, "new.md")).toEqual(sampleState());
  });

  it("deletes cache entries", () => {
    const cache = new Map<string, EditorViewState>();
    setEditorViewStateInCache(cache, "note.md", sampleState());
    deleteEditorViewStateFromCache(cache, "note.md");
    expect(getEditorViewStateFromCache(cache, "note.md")).toBeUndefined();
  });
});
