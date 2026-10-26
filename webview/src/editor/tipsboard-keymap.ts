import { indentLess, indentMore } from "@codemirror/commands";
import { selectedCompletion } from "@codemirror/autocomplete";
import { EditorSelection } from "@codemirror/state";
import { type EditorView, type KeyBinding } from "@codemirror/view";
import { formatIconSyntax } from "@/domain/links/iconSyntax";

const UNORDERED_LIST_ITEM_RE = /^([ \t]*)([-+*])\s+\S.*$/;
const UNORDERED_LIST_MARKER_RE = /^([ \t]*)([-+*])\s/;

export interface TipsboardKeymapConfig {
  currentUserPageTitle?: string | null;
  getCurrentUserPageTitle?: () => string | null | undefined;
}

function continueBullet(view: EditorView): boolean {
  const range = view.state.selection.main;
  if (!range.empty || view.state.selection.ranges.length > 1) return false;
  const line = view.state.doc.lineAt(range.from);
  const offset = range.from - line.from;
  if (offset !== line.text.length) return false;
  const match = line.text.match(UNORDERED_LIST_ITEM_RE);
  if (!match) return false;
  const insertion = `\n${match[1] ?? ""}${match[2] ?? "-"} `;
  view.dispatch({
    changes: { from: range.from, insert: insertion },
    selection: { anchor: range.from + insertion.length },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

function outdentBulletOnBackspace(view: EditorView): boolean {
  const range = view.state.selection.main;
  if (!range.empty || view.state.selection.ranges.length > 1) return false;
  const line = view.state.doc.lineAt(range.from);
  const offset = range.from - line.from;
  const match = line.text.match(UNORDERED_LIST_MARKER_RE);
  if (!match) return false;
  const indent = match[1] ?? "";
  const markerEnd = indent.length + 2;
  if (offset !== markerEnd || indent.length === 0) return false;
  const removeCount = indent.endsWith("\t") ? 1 : Math.min(2, indent.length);
  view.dispatch({
    changes: {
      from: line.from + indent.length - removeCount,
      to: line.from + indent.length,
    },
    selection: { anchor: line.from + offset - removeCount },
    scrollIntoView: true,
    userEvent: "delete.backward",
  });
  return true;
}

function findOpenBracketOffset(lineText: string, cursorOffset: number): number {
  for (let index = cursorOffset - 1; index >= 0; index -= 1) {
    const char = lineText[index];
    if (char === "]") return -1;
    if (char === "[" && !isEscaped(lineText, index)) return index;
  }
  return -1;
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount++;
  }
  return slashCount % 2 === 1;
}

function insertIconSyntax(view: EditorView, currentUserPageTitle?: string | null): boolean {
  const range = view.state.selection.main;
  if (!range.empty || view.state.selection.ranges.length > 1) return false;

  const completion = selectedCompletion(view.state);
  const line = view.state.doc.lineAt(range.from);
  const offset = range.from - line.from;
  const title = completion?.label ?? currentUserPageTitle?.trim();
  if (!title) return false;

  const openBracketOffset = findOpenBracketOffset(line.text, offset);
  const from = openBracketOffset >= 0 ? line.from + openBracketOffset : range.from;
  const insert = formatIconSyntax(title);
  view.dispatch({
    changes: { from, to: range.from, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

/** Any vertical step larger than this many default line heights is treated as a layout jump. */
const LAYOUT_JUMP_LINE_FACTOR = 1.5;

function findVerticalScrollParent(element: HTMLElement): HTMLElement | null {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

/**
 * Entering or leaving a rendered block (table, Mermaid, display math) swaps it between widget and
 * source, which changes its height. Scroll by that height change so the caret lands right next to
 * the row it left instead of visually jumping several lines.
 */
function keepCaretNextToPreviousRow(
  view: EditorView,
  before: { top: number; bottom: number },
  contentHeightBefore: number,
  forward: boolean,
): void {
  view.requestMeasure({
    read(currentView) {
      const heightChange = currentView.contentDOM.getBoundingClientRect().height - contentHeightBefore;
      const threshold = currentView.defaultLineHeight * LAYOUT_JUMP_LINE_FACTOR;
      if (Math.abs(heightChange) < threshold) return 0;
      const after = currentView.coordsAtPos(currentView.state.selection.main.head);
      if (!after) return 0;
      const desiredTop = forward ? before.bottom : before.top - (after.bottom - after.top);
      const offset = after.top - desiredTop;
      return Math.abs(offset) < threshold ? 0 : offset;
    },
    write(offset, currentView) {
      if (offset === 0) return;
      const scroller = findVerticalScrollParent(currentView.scrollDOM);
      if (scroller) scroller.scrollTop += offset;
      else currentView.scrollDOM.ownerDocument.defaultView?.scrollBy(0, offset);
    },
  });
}

function occupiesSingleVisualRow(view: EditorView, line: { from: number; to: number }): boolean {
  const start = view.coordsAtPos(line.from, 1);
  const end = view.coordsAtPos(line.to, -1);
  return !start || !end || Math.abs(end.top - start.top) < 1;
}

/**
 * ArrowUp / ArrowDown move by visual (wrapped) rows like CodeMirror's default. Overrides:
 * - when the default motion would leave the current line but skip the adjacent line (a rendered
 *   block widget hides its source rows), step onto that adjacent line so the block opens for editing;
 * - when an unwrapped line would not be left at all (layout unavailable), step onto the adjacent line.
 */
function moveCaretVertically(view: EditorView, forward: boolean): boolean {
  const range = view.state.selection.main;
  if (!range.empty || view.state.selection.ranges.length > 1) return false;

  const doc = view.state.doc;
  const currentLine = doc.lineAt(range.head);
  const adjacentNumber = currentLine.number + (forward ? 1 : -1);
  if (adjacentNumber < 1 || adjacentNumber > doc.lines) return false;

  let target = view.moveVertically(range, forward);
  const targetLineNumber = doc.lineAt(target.head).number;
  const skipsAdjacentLine = targetLineNumber !== currentLine.number && targetLineNumber !== adjacentNumber;
  const stuckOnUnwrappedLine =
    targetLineNumber === currentLine.number && occupiesSingleVisualRow(view, currentLine);
  if (skipsAdjacentLine || stuckOnUnwrappedLine) {
    const adjacent = doc.line(adjacentNumber);
    const column = Math.min(range.head - currentLine.from, adjacent.length);
    target = EditorSelection.cursor(adjacent.from + column, 0, undefined, target.goalColumn);
  }

  const before = view.coordsAtPos(range.head);
  const contentHeightBefore = view.contentDOM.getBoundingClientRect().height;
  view.dispatch({
    selection: EditorSelection.create([target]),
    scrollIntoView: true,
    userEvent: "select",
  });
  if (before) keepCaretNextToPreviousRow(view, before, contentHeightBefore, forward);
  return true;
}

export function tipsboardKeymap(config: TipsboardKeymapConfig = {}): KeyBinding[] {
  return [
    { key: "ArrowDown", run: (view) => moveCaretVertically(view, true) },
    { key: "ArrowUp", run: (view) => moveCaretVertically(view, false) },
    { key: "Enter", run: continueBullet },
    { key: "Backspace", run: outdentBulletOnBackspace },
    { key: "Tab", run: indentMore },
    { key: "Shift-Tab", run: indentLess },
    {
      key: "Ctrl-i",
      mac: "Ctrl-i",
      run: (view) =>
        insertIconSyntax(
          view,
          config.getCurrentUserPageTitle?.() ?? config.currentUserPageTitle,
        ),
    },
  ];
}
