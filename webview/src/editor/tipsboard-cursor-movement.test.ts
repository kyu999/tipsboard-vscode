/** @vitest-environment jsdom */

import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it } from "vitest";
import { type EditorView } from "@codemirror/view";

import { createEditor } from "./index";
import {
  BOUNDARY_ARROW_CASES,
  BOUNDARY_BLOCKS_ANCHORS,
  BOUNDARY_BLOCKS_LINE_COUNT,
  BOUNDARY_BLOCKS_MARKDOWN,
  BRACKET_MATH_ANCHORS,
  BRACKET_MATH_MARKDOWN,
  CLICK_TARGET_ANCHORS,
  CLICK_TARGET_MARKDOWN,
  COMPREHENSIVE_CURSOR_ANCHORS,
  COMPREHENSIVE_CURSOR_LINE_COUNT,
  COMPREHENSIVE_CURSOR_MARKDOWN,
  DECORATED_CURSOR_MARKDOWN,
  DISPLAY_MATH_CURSOR_MARKDOWN,
  MERMAID_ONLY_ANCHORS,
  MERMAID_ONLY_MARKDOWN,
  TABLE_WITH_LINKS_ANCHORS,
  TABLE_WITH_LINKS_MARKDOWN,
  TALL_MATH_SPACER_ANCHORS,
  TALL_MATH_SPACER_MARKDOWN,
  WRAPPED_PARAGRAPH_ANCHORS,
  WRAPPED_PARAGRAPH_MARKDOWN,
} from "./cursor-test-fixtures";
import { expectedArrowTarget, lineStart } from "./cursor-test-helpers";

function createTestEditor(doc: string): EditorView {
  const parent = document.createElement("div");
  parent.style.height = "480px";
  parent.style.width = "720px";
  parent.style.overflow = "auto";
  document.body.appendChild(parent);

  return createEditor({
    doc,
    parent,
    currentUserPageTitle: "Cursor Movement Fixture",
    onLinkClick: () => {},
    getLinkSuggestions: () => [],
    existingNormalizedTitles: ["home"],
  });
}

function setCursorLine(view: EditorView, lineNumber: number, column = 0): void {
  const line = view.state.doc.line(lineNumber);
  view.dispatch({ selection: EditorSelection.cursor(line.from + column) });
}

function cursorLine(view: EditorView): number {
  return view.state.doc.lineAt(view.state.selection.main.head).number;
}

function pressArrow(view: EditorView, key: "ArrowDown" | "ArrowUp"): void {
  view.focus();
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

describe("Tipsboard editor cursor movement", () => {
  const opened: EditorView[] = [];

  afterEach(() => {
    for (const view of opened.splice(0)) {
      view.destroy();
      view.dom.remove();
    }
  });

  it("mounts the decorated cursor movement fixture at stable line anchors", () => {
    const view = createTestEditor(DECORATED_CURSOR_MARKDOWN);
    opened.push(view);

    setCursorLine(view, 3, 3);
    expect(cursorLine(view)).toBe(3);
    expect(view.state.doc.line(4).text).toBe("- first bullet");
    expect(view.state.doc.line(5).text).toContain("second bullet");
  });

  it("keeps table row fixture lines addressable before browser-level arrow tests", () => {
    const view = createTestEditor(DECORATED_CURSOR_MARKDOWN);
    opened.push(view);

    setCursorLine(view, 6, 2);
    expect(cursorLine(view)).toBe(6);
    expect(view.state.doc.line(7).text).toBe("| --- | --- |");
    expect(view.state.doc.line(8).text).toBe("| Alpha | 1 |");
  });

  it("keeps fenced block fixture lines addressable before browser-level arrow tests", () => {
    const view = createTestEditor(DECORATED_CURSOR_MARKDOWN);
    opened.push(view);

    setCursorLine(view, 9, 0);
    expect(cursorLine(view)).toBe(9);
    expect(view.state.doc.line(10).text).toBe("flowchart TD");
    expect(view.state.doc.line(11).text).toBe("  A --> B");
    expect(view.state.doc.line(12).text).toBe("```");
  });

  it("keeps long wrapped paragraphs in the fixture for browser-level visual-line tests", () => {
    const longLine = "A long paragraph ".repeat(40).trim();
    const doc = `Title\n${longLine}\nNext paragraph`;
    const view = createTestEditor(doc);
    opened.push(view);

    view.dispatch({
      selection: EditorSelection.cursor(lineStart(doc, 2) + 10),
    });

    expect(cursorLine(view)).toBe(2);
    expect(view.state.doc.line(2).text.length).toBeGreaterThan(400);
  });

  it("keeps display math source lines addressable before browser-level arrow tests", () => {
    const view = createTestEditor(DISPLAY_MATH_CURSOR_MARKDOWN);
    opened.push(view);

    setCursorLine(view, 3, 0);
    expect(cursorLine(view)).toBe(3);
    expect(view.state.doc.line(4).text).toBe(String.raw`\begin{aligned}`);
    expect(view.state.doc.line(5).text).toBe(String.raw`a &= b + c \\`);
    expect(view.state.doc.line(8).text).toBe("$$");
  });

  it("keeps comprehensive decorated fixture lines addressable before browser-level arrow tests", () => {
    const view = createTestEditor(COMPREHENSIVE_CURSOR_MARKDOWN);
    opened.push(view);

    expect(view.state.doc.lines).toBe(COMPREHENSIVE_CURSOR_LINE_COUNT);

    setCursorLine(view, COMPREHENSIVE_CURSOR_ANCHORS.h1, 2);
    expect(cursorLine(view)).toBe(COMPREHENSIVE_CURSOR_ANCHORS.h1);
    expect(view.state.doc.line(COMPREHENSIVE_CURSOR_ANCHORS.h6).text).toContain("~~strike~~");
    expect(view.state.doc.line(COMPREHENSIVE_CURSOR_ANCHORS.imageRemote).text).toContain(
      "https://example.com/image.png",
    );
    expect(view.state.doc.line(COMPREHENSIVE_CURSOR_ANCHORS.tableHeader).text).toBe(
      "| Name | Value | Link |",
    );
    expect(view.state.doc.line(COMPREHENSIVE_CURSOR_ANCHORS.tableSecondRow).text).toBe(
      "| Beta | 2 | [Missing] |",
    );
    expect(view.state.doc.line(COMPREHENSIVE_CURSOR_ANCHORS.mermaidLine).text).toBe(
      "flowchart TD",
    );
    expect(view.state.doc.line(COMPREHENSIVE_CURSOR_ANCHORS.displayMathFirstLine).text).toBe(
      String.raw`\begin{aligned}`,
    );
    expect(view.state.doc.line(COMPREHENSIVE_CURSOR_ANCHORS.bracketMathBody).text).toBe(
      String.raw`\int_0^1 x^2 dx`,
    );
    expect(view.state.doc.line(COMPREHENSIVE_CURSOR_ANCHORS.divider).text).toBe("---");
    expect(
      view.state.doc.line(COMPREHENSIVE_CURSOR_ANCHORS.wrappedParagraph).text.length,
    ).toBeGreaterThan(600);
  });

  it("keeps boundary blocks fixture anchors addressable", () => {
    const view = createTestEditor(BOUNDARY_BLOCKS_MARKDOWN);
    opened.push(view);

    expect(view.state.doc.lines).toBe(BOUNDARY_BLOCKS_LINE_COUNT);
    setCursorLine(view, BOUNDARY_BLOCKS_ANCHORS.tableHeader, 0);
    expect(cursorLine(view)).toBe(BOUNDARY_BLOCKS_ANCHORS.tableHeader);
    setCursorLine(view, BOUNDARY_BLOCKS_ANCHORS.mermaidFenceOpen, 0);
    expect(cursorLine(view)).toBe(BOUNDARY_BLOCKS_ANCHORS.mermaidFenceOpen);
    setCursorLine(view, BOUNDARY_BLOCKS_ANCHORS.bracketMathBody, 0);
    expect(cursorLine(view)).toBe(BOUNDARY_BLOCKS_ANCHORS.bracketMathBody);
  });

  it("keeps click-target fixture anchors addressable", () => {
    const view = createTestEditor(CLICK_TARGET_MARKDOWN);
    opened.push(view);

    for (const line of Object.values(CLICK_TARGET_ANCHORS)) {
      setCursorLine(view, line, 0);
      expect(cursorLine(view)).toBe(line);
    }
  });

  it("keeps mermaid-only, table-links, bracket-math, and tall-math fixtures addressable", () => {
    const cases = [
      { doc: MERMAID_ONLY_MARKDOWN, anchors: MERMAID_ONLY_ANCHORS },
      { doc: TABLE_WITH_LINKS_MARKDOWN, anchors: TABLE_WITH_LINKS_ANCHORS },
      { doc: BRACKET_MATH_MARKDOWN, anchors: BRACKET_MATH_ANCHORS },
      { doc: TALL_MATH_SPACER_MARKDOWN, anchors: TALL_MATH_SPACER_ANCHORS },
      { doc: WRAPPED_PARAGRAPH_MARKDOWN, anchors: WRAPPED_PARAGRAPH_ANCHORS },
    ];

    for (const { doc, anchors } of cases) {
      const view = createTestEditor(doc);
      opened.push(view);
      for (const line of Object.values(anchors)) {
        if (typeof line !== "number") continue;
        setCursorLine(view, line, 0);
        expect(cursorLine(view)).toBe(line);
      }
    }
  });

  it("ArrowDown does not skip table rows in decorated fixture (jsdom)", () => {
    const view = createTestEditor(DECORATED_CURSOR_MARKDOWN);
    opened.push(view);

    setCursorLine(view, 6, 2);
    pressArrow(view, "ArrowDown");
    expect(cursorLine(view)).toBe(7);
    pressArrow(view, "ArrowDown");
    expect(cursorLine(view)).toBe(8);
  });

  it("ArrowDown does not skip fenced mermaid rows in decorated fixture (jsdom)", () => {
    const view = createTestEditor(DECORATED_CURSOR_MARKDOWN);
    opened.push(view);

    setCursorLine(view, 9, 0);
    pressArrow(view, "ArrowDown");
    expect(cursorLine(view)).toBe(10);
    pressArrow(view, "ArrowDown");
    expect(cursorLine(view)).toBe(11);
    pressArrow(view, "ArrowDown");
    expect(cursorLine(view)).toBe(12);
  });

  it.each(BOUNDARY_ARROW_CASES)(
    "boundary Arrow $key from line $from to $to (jsdom)",
    ({ from, to, key }) => {
      const view = createTestEditor(BOUNDARY_BLOCKS_MARKDOWN);
      opened.push(view);

      setCursorLine(view, from, 0);
      pressArrow(view, key);
      expect(cursorLine(view)).toBe(to);
    },
  );

  it("boundary helper computes expected arrow targets", () => {
    expect(expectedArrowTarget(5, "down")).toBe(6);
    expect(expectedArrowTarget(5, "up")).toBe(4);
  });
});
