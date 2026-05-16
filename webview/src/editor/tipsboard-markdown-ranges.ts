import { type EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

export interface TextRange {
  from: number;
  to: number;
}

const ALWAYS_SKIP_NODES = new Set([
  "FencedCode",
  "IndentedCode",
  "InlineCode",
  "LinkReference",
  "HTMLBlock",
]);

function shouldSkipNode(
  state: EditorState,
  name: string,
  from: number,
  to: number,
): boolean {
  if (ALWAYS_SKIP_NODES.has(name)) {
    return true;
  }

  const text = state.doc.sliceString(from, to);

  if (name === "Link") {
    return /^\[[\s\S]*\]\s*(?:\(|\[)/.test(text);
  }

  if (name === "Image") {
    return /^!\[[\s\S]*\]\s*(?:\(|\[)/.test(text);
  }

  return false;
}

export function collectCustomSyntaxSkipRanges(
  state: EditorState,
  from: number,
  to: number,
): TextRange[] {
  const ranges: TextRange[] = [];

  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (shouldSkipNode(state, node.name, node.from, node.to)) {
        ranges.push({ from: node.from, to: node.to });
      }
    },
  });

  return ranges;
}

export function isCustomSyntaxIgnoredPosition(
  state: EditorState,
  pos: number,
): boolean {
  const initialNode = syntaxTree(state).resolveInner(pos, -1);
  let node: typeof initialNode | null = initialNode;
  while (node) {
    if (shouldSkipNode(state, node.name, node.from, node.to)) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

export function intersectsRanges(
  from: number,
  to: number,
  ranges: readonly TextRange[],
): boolean {
  for (const range of ranges) {
    if (from < range.to && to > range.from) {
      return true;
    }
  }

  return false;
}

/** True when [inner.from, inner.to) lies entirely inside some range in outers. */
export function rangeFullyContainedInAny(
  inner: TextRange,
  outers: readonly TextRange[],
): boolean {
  for (const o of outers) {
    if (inner.from >= o.from && inner.to <= o.to) return true;
  }
  return false;
}
