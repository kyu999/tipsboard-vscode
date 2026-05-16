import { indentLess, indentMore } from "@codemirror/commands";
import { selectedCompletion } from "@codemirror/autocomplete";
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

export function tipsboardKeymap(config: TipsboardKeymapConfig = {}): KeyBinding[] {
  return [
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
