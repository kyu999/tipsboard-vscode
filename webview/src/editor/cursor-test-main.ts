import "@fortawesome/fontawesome-free/css/all.min.css";
import "katex/dist/katex.min.css";
import "@/shared/i18n/config";
import "@/index.css";
import { EditorSelection } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import { createEditor } from "./index";
import { COMPREHENSIVE_CURSOR_MARKDOWN } from "./cursor-test-fixtures";
import type { CursorTestApi } from "./cursor-test-helpers";

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

function lineCoords(lineNumber: number, column = 0): { x: number; y: number } | null {
  const currentView = getView();
  const line = currentView.state.doc.line(lineNumber);
  const pos = line.from + Math.min(column, line.length);
  const coords = currentView.coordsAtPos(pos);
  if (!coords) return null;
  return { x: coords.left + 2, y: coords.top + 2 };
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
  clickLine(lineNumber, column = 0) {
    const currentView = getView();
    const coords = lineCoords(lineNumber, column);
    if (!coords) throw new Error(`Could not resolve coords for line ${lineNumber}`);
    const target = document.elementFromPoint(coords.x, coords.y);
    if (!target) throw new Error(`No element at line ${lineNumber}`);
    const content = currentView.contentDOM;
    content.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: coords.x,
        clientY: coords.y,
        button: 0,
      }),
    );
    content.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        clientX: coords.x,
        clientY: coords.y,
        button: 0,
      }),
    );
    content.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: coords.x,
        clientY: coords.y,
        button: 0,
      }),
    );
    currentView.focus();
  },
  pressKey(key) {
    const currentView = getView();
    currentView.focus();
    currentView.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  },
  cursorCoords() {
    const currentView = getView();
    const head = currentView.state.selection.main.head;
    const coords = currentView.coordsAtPos(head);
    if (!coords) return null;
    return { x: coords.left, y: coords.top };
  },
};

mount();
