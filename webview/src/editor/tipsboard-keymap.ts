import { indentLess, indentMore } from "@codemirror/commands";
import { selectedCompletion } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type EditorState } from "@codemirror/state";
import { type EditorView, type KeyBinding } from "@codemirror/view";
import { formatIconSyntax } from "@/domain/links/iconSyntax";
import { findRenderableMathSpans } from "./tipsboard-katex-math";
import { findMermaidBlocks } from "./tipsboard-mermaid";
import { findMarkdownTables } from "./tipsboard-tables";

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

type ReplacementBlockSpan = { from: number; to: number };

function collectHorizontalRuleSpans(state: EditorState): ReplacementBlockSpan[] {
  const out: ReplacementBlockSpan[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "HorizontalRule") {
        out.push({ from: node.from, to: node.to });
      }
    },
  });

  return out;
}

function collectFencedCodeSpans(state: EditorState, mermaidBlocks: readonly ReplacementBlockSpan[]): ReplacementBlockSpan[] {
  const out: ReplacementBlockSpan[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "FencedCode") return;
      if (mermaidBlocks.some((mb) => mb.from === node.from)) return;
      out.push({ from: node.from, to: node.to });
    },
  });

  return out;
}

function collectTipsboardReplacementBlockSpans(
  view: EditorView,
): readonly ReplacementBlockSpan[] {
  const state = view.state;
  const text = state.doc.toString();
  const mermaidBlocks = findMermaidBlocks(text);
  const tables = findMarkdownTables(text).filter((table) =>
    mermaidBlocks.every((mb) => !(table.from >= mb.from && table.to <= mb.to)),
  );
  const displayMathSpans = findRenderableMathSpans(text, state).filter((span) => {
    if (!span.displayMode) return false;
    if (mermaidBlocks.some((mb) => span.from >= mb.from && span.to <= mb.to)) return false;
    if (tables.some((t) => span.from >= t.from && span.to <= t.to)) return false;
    return true;
  });

  const horizontalRules = collectHorizontalRuleSpans(state);
  const fencedCodeBlocks = collectFencedCodeSpans(state, mermaidBlocks);

  const spans: ReplacementBlockSpan[] = [
    ...fencedCodeBlocks,
    ...tables.map(({ from, to }) => ({ from, to })),
    ...mermaidBlocks.map(({ from, to }) => ({ from, to })),
    ...displayMathSpans.map(({ from, to }) => ({ from, to })),
    ...horizontalRules,
  ].sort((a, b) => a.from - b.from || b.to - a.to - (b.from - a.from));

  return spans;
}

function isBlankLine(state: EditorState, lineNumber: number): boolean {
  if (lineNumber < 1 || lineNumber > state.doc.lines) return false;
  return state.doc.line(lineNumber).text.length === 0;
}

/**
 * Moves by one document line across Markdown tables, fenced code blocks, fenced Mermaid blocks,
 * and display-mode KaTeX spans where decorations can make default vertical motion skip hidden
 * or visually wrapped source rows.
 *
 * Wrapped paragraphs still use CodeMirror defaults when outside these spans.
 */
function moveReplacementBlockBoundaryLine(view: EditorView, direction: "down" | "up"): boolean {
  const range = view.state.selection.main;
  if (!range.empty || view.state.selection.ranges.length > 1) return false;

  const doc = view.state.doc;
  const currentLine = doc.lineAt(range.head);
  const currentColumn = range.head - currentLine.from;
  const spans = collectTipsboardReplacementBlockSpans(view);

  for (const span of spans) {
    const startLine = doc.lineAt(span.from);
    const endLine = doc.lineAt(Math.max(span.from, span.to - 1));
    let targetLineNumber: number | null = null;

    if (direction === "down") {
      if (currentLine.number === startLine.number - 1) {
        targetLineNumber = startLine.number;
      } else if (
        currentLine.number === startLine.number - 2 &&
        isBlankLine(view.state, startLine.number - 1)
      ) {
        targetLineNumber = startLine.number - 1;
      } else if (currentLine.number >= startLine.number && currentLine.number < endLine.number) {
        targetLineNumber = currentLine.number + 1;
      } else if (currentLine.number === endLine.number && endLine.number < doc.lines) {
        targetLineNumber = endLine.number + 1;
      }
    } else if (currentLine.number === endLine.number + 1) {
      targetLineNumber = endLine.number;
    } else if (
      currentLine.number === endLine.number + 2 &&
      isBlankLine(view.state, endLine.number + 1)
    ) {
      targetLineNumber = endLine.number + 1;
    } else if (currentLine.number > startLine.number && currentLine.number <= endLine.number) {
      targetLineNumber = currentLine.number - 1;
    } else if (currentLine.number === startLine.number && startLine.number > 1) {
      targetLineNumber = startLine.number - 1;
    }

    if (targetLineNumber === null) continue;

    const targetLine = doc.line(targetLineNumber);
    view.dispatch({
      selection: EditorSelection.cursor(
        targetLine.from + Math.min(currentColumn, targetLine.length),
      ),
      scrollIntoView: true,
      userEvent: "select",
    });
    return true;
  }

  return false;
}

export function tipsboardKeymap(config: TipsboardKeymapConfig = {}): KeyBinding[] {
  return [
    { key: "ArrowDown", run: (view) => moveReplacementBlockBoundaryLine(view, "down") },
    { key: "ArrowUp", run: (view) => moveReplacementBlockBoundaryLine(view, "up") },
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
