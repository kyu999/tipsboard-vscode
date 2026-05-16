import type { EditorView } from "@codemirror/view";

export function getCaretLineNumbers(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    lines.add(view.state.doc.lineAt(range.head).number);
  }
  return lines;
}
