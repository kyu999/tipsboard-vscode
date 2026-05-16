import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { findRenderableMathSpans } from "./tipsboard-katex-math";
import { tipsboardLanguage } from "./tipsboard-language";

function stateFrom(markdown: string): EditorState {
  return EditorState.create({
    doc: markdown,
    extensions: tipsboardLanguage,
  });
}

describe("findRenderableMathSpans", () => {
  it("detects display dollar blocks", () => {
    const s = stateFrom("intro\n\n$$x^2$$\n");
    const spans = findRenderableMathSpans(s.doc.toString(), s);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.tex).toBe("x^2");
    expect(spans[0]!.displayMode).toBe(true);
  });

  it("detects bracket display and inline", () => {
    const s = stateFrom("\\[ a+b \\] and \\(\\frac{1}{2}\\)");
    const spans = findRenderableMathSpans(s.doc.toString(), s);
    expect(spans).toHaveLength(2);
    expect(spans[0]!.tex).toBe("a+b");
    expect(spans[0]!.displayMode).toBe(true);
    expect(spans[1]!.tex).toBe("\\frac{1}{2}");
    expect(spans[1]!.displayMode).toBe(false);
  });

  it("ignores math inside fenced code", () => {
    const s = stateFrom("```\n$$x$$\n```\n");
    const spans = findRenderableMathSpans(s.doc.toString(), s);
    expect(spans).toHaveLength(0);
  });
});
