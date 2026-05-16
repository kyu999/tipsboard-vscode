import "@fortawesome/fontawesome-free/css/all.min.css";
import "katex/dist/katex.min.css";
import "@/shared/i18n/config";
import "@/index.css";
import { EditorSelection } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import { createEditor } from "./index";
import { COMPREHENSIVE_CURSOR_MARKDOWN } from "./cursor-test-fixtures";

interface CursorTestApi {
  mount: (doc?: string) => void;
  setCursor: (lineNumber: number, column?: number) => void;
  cursorLine: () => number;
  cursorColumn: () => number;
  docLine: (lineNumber: number) => string;
}

declare global {
  interface Window {
    __tipsboardCursorTest: CursorTestApi;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root");
const root: HTMLElement = rootElement;

let view: EditorView | null = null;

function mount(doc = COMPREHENSIVE_CURSOR_MARKDOWN): void {
  view?.destroy();
  root.replaceChildren();

  const shell = document.createElement("main");
  shell.style.width = "760px";
  shell.style.margin = "24px auto";
  root.append(shell);

  view = createEditor({
    doc,
    parent: shell,
    currentUserPageTitle: "Cursor Movement Fixture",
    onLinkClick: () => {},
    getLinkSuggestions: () => [],
    existingNormalizedTitles: ["home"],
  });
}

function getView(): EditorView {
  if (!view) throw new Error("Cursor test editor is not mounted");
  return view;
}

window.__tipsboardCursorTest = {
  mount,
  setCursor(lineNumber, column = 0) {
    const currentView = getView();
    const line = currentView.state.doc.line(lineNumber);
    currentView.dispatch({
      selection: EditorSelection.cursor(line.from + column),
      scrollIntoView: true,
    });
    currentView.focus();
  },
  cursorLine() {
    const currentView = getView();
    return currentView.state.doc.lineAt(currentView.state.selection.main.head).number;
  },
  cursorColumn() {
    const currentView = getView();
    const head = currentView.state.selection.main.head;
    const line = currentView.state.doc.lineAt(head);
    return head - line.from;
  },
  docLine(lineNumber) {
    return getView().state.doc.line(lineNumber).text;
  },
};

mount();
