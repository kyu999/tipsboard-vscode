import { EditorSelection } from "@codemirror/state";
import { expect, type Page } from "@playwright/test";
import type { EditorView } from "@codemirror/view";

export interface CursorTestApi {
  mount: (doc?: string) => void;
  setCursor: (lineNumber: number, column?: number) => void;
  cursorLine: () => number;
  cursorColumn: () => number;
  docLine: (lineNumber: number) => string;
  clickLine: (lineNumber: number, column?: number) => void;
  pressKey: (key: string) => void;
  cursorCoords: () => { x: number; y: number } | null;
  expectedLineCoords: (lineNumber: number, column?: number) => { x: number; y: number } | null;
}

declare global {
  interface Window {
    __tipsboardCursorTest: CursorTestApi;
  }
}

/** Character offset at the start of a 1-based line number in a joined markdown doc. */
export function lineStart(doc: string, lineNumber: number): number {
  const lines = doc.split("\n");
  if (lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`lineStart: line ${lineNumber} out of range (1..${lines.length})`);
  }
  let offset = 0;
  for (let i = 0; i < lineNumber - 1; i += 1) {
    offset += lines[i]!.length + 1;
  }
  return offset;
}

export function expectedArrowTarget(line: number, direction: "down" | "up"): number {
  return direction === "down" ? line + 1 : line - 1;
}

export async function mountDoc(page: Page, markdown: string): Promise<void> {
  await page.evaluate((doc) => {
    window.__tipsboardCursorTest.mount(doc);
  }, markdown);
}

export async function setCursor(page: Page, lineNumber: number, column = 0): Promise<void> {
  await page.evaluate(
    ({ line, col }) => {
      window.__tipsboardCursorTest.setCursor(line, col);
    },
    { line: lineNumber, col: column },
  );
}

export async function clickLine(page: Page, lineNumber: number, column = 0): Promise<void> {
  await page.evaluate(
    ({ line, col }) => {
      window.__tipsboardCursorTest.clickLine(line, col);
    },
    { line: lineNumber, col: column },
  );
}

export async function expectCursorLine(page: Page, lineNumber: number): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => window.__tipsboardCursorTest.cursorLine()))
    .toBe(lineNumber);
}

export async function expectCursorPosition(
  page: Page,
  lineNumber: number,
  column: number,
): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => window.__tipsboardCursorTest.cursorLine()))
    .toBe(lineNumber);
  await expect
    .poll(async () => page.evaluate(() => window.__tipsboardCursorTest.cursorColumn()))
    .toBe(column);
}

export async function cursorBox(page: Page): Promise<{ x: number; y: number }> {
  const coords = await page.evaluate(() => window.__tipsboardCursorTest.cursorCoords());
  if (!coords) throw new Error("cursorCoords returned null");
  return coords;
}

export async function walkLogicalLines(
  page: Page,
  fromLine: number,
  toLine: number,
  direction: "down" | "up",
  skip: ReadonlySet<number> = new Set(),
  arrowDownOverrides: ReadonlyMap<number, number> = new Map(),
): Promise<void> {
  const step = direction === "down" ? 1 : -1;
  const key = direction === "down" ? "ArrowDown" : "ArrowUp";
  await setCursor(page, fromLine, 0);

  let current = fromLine;
  while (current !== toLine) {
    if (!skip.has(current)) {
      await page.keyboard.press(key);
      const expected =
        direction === "down" && arrowDownOverrides.has(current)
          ? arrowDownOverrides.get(current)!
          : current + step;
      await expectCursorLine(page, expected);
      current = expected;
    } else {
      current += step;
      if (current !== toLine) {
        await setCursor(page, current, 0);
      }
    }
  }
}

export async function expectClickCursorStable(
  page: Page,
  lineNumber: number,
  column: number,
  maxYDeltaPx = 12,
): Promise<void> {
  const expected = await page.evaluate(
    ({ line, col }) => window.__tipsboardCursorTest.expectedLineCoords(line, col),
    { line: lineNumber, col: column },
  );
  const actual = await cursorBox(page);
  if (!expected) throw new Error(`Could not resolve expected coords for line ${lineNumber}`);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(maxYDeltaPx);
}

function lineCoordsInView(view: EditorView, lineNumber: number, column = 0): { x: number; y: number } | null {
  try {
    const line = view.state.doc.line(lineNumber);
    const pos = line.from + Math.min(column, line.length);
    const coords = view.coordsAtPos(pos);
    if (!coords) return null;
    return { x: coords.left + 2, y: coords.top + 2 };
  } catch {
    return null;
  }
}

function documentYFromLineBlock(view: EditorView, lineNumber: number): number | null {
  try {
    const line = view.state.doc.line(lineNumber);
    return view.lineBlockAt(line.from).top;
  } catch {
    return null;
  }
}

function cmLineElementForDocLine(view: EditorView, lineNumber: number): HTMLElement | null {
  for (const el of view.contentDOM.querySelectorAll(".cm-line")) {
    if (!(el instanceof HTMLElement)) continue;
    try {
      const line = view.state.doc.lineAt(view.posAtDOM(el, 0));
      if (line.number === lineNumber) return el;
    } catch {
      continue;
    }
  }
  return null;
}

/** jsdom: synthesize mousedown on the logical line's `.cm-line` (mirrors cursor-test-main). */
export function simulateClickLine(view: EditorView, lineNumber: number, column = 0): void {
  const line = view.state.doc.line(lineNumber);
  const pos = line.from + Math.min(column, line.length);
  const lineEl = cmLineElementForDocLine(view, lineNumber);
  const rect = view.scrollDOM.getBoundingClientRect();
  const docY = documentYFromLineBlock(view, lineNumber);
  const clientY =
    docY != null ? rect.top + docY - view.scrollDOM.scrollTop + 4 : rect.top + lineNumber * 20;
  const coords = lineCoordsInView(view, lineNumber, column);
  const clientX = coords?.x ?? rect.left + 24 + column * 8;

  if (lineEl) {
    for (const type of ["mousedown", "mouseup", "click"] as const) {
      lineEl.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
        }),
      );
    }
    view.focus();
    if (view.state.doc.lineAt(view.state.selection.main.head).number === lineNumber) {
      return;
    }
  }

  view.dispatch({ selection: EditorSelection.cursor(pos) });
  view.focus();
}
