export interface EditorViewState {
  anchor: number;
  head: number;
  scrollTop: number;
  containerScrollTop: number;
}

export const EDITOR_VIEW_STATE_CACHE_LIMIT = 50;

export function normalizeEditorViewStateKey(path: string): string {
  return path.replace(/\\/g, "/");
}

function clampOffset(offset: number, docLength: number): number {
  if (docLength <= 0) return 0;
  return Math.max(0, Math.min(offset, docLength));
}

export function clampEditorViewState(state: EditorViewState, docLength: number): EditorViewState {
  const anchor = clampOffset(state.anchor, docLength);
  const head = clampOffset(state.head, docLength);
  return {
    anchor,
    head,
    scrollTop: Math.max(0, state.scrollTop),
    containerScrollTop: Math.max(0, state.containerScrollTop),
  };
}

export function getEditorViewStateFromCache(
  cache: Map<string, EditorViewState>,
  path: string,
): EditorViewState | undefined {
  return cache.get(normalizeEditorViewStateKey(path));
}

export function setEditorViewStateInCache(
  cache: Map<string, EditorViewState>,
  path: string,
  state: EditorViewState,
  limit = EDITOR_VIEW_STATE_CACHE_LIMIT,
): void {
  const key = normalizeEditorViewStateKey(path);
  if (cache.has(key)) cache.delete(key);
  cache.set(key, state);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function moveEditorViewStateInCache(
  cache: Map<string, EditorViewState>,
  fromPath: string,
  toPath: string,
): void {
  const fromKey = normalizeEditorViewStateKey(fromPath);
  const toKey = normalizeEditorViewStateKey(toPath);
  if (fromKey === toKey) return;
  const state = cache.get(fromKey);
  if (!state) return;
  cache.delete(fromKey);
  setEditorViewStateInCache(cache, toKey, state);
}

export function deleteEditorViewStateFromCache(cache: Map<string, EditorViewState>, path: string): void {
  cache.delete(normalizeEditorViewStateKey(path));
}
