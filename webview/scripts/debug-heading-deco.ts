/**
 * Temporary debug: npx tsx scripts/debug-heading-deco.ts (from webview/)
 */
import { JSDOM } from "jsdom";
import { EditorState, EditorSelection } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { EditorView } from "@codemirror/view";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});

Object.defineProperty(globalThis, "window", { value: dom.window, writable: true, configurable: true });
Object.defineProperty(globalThis, "document", {
  value: dom.window.document,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});
(globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver ??= dom.window
  .MutationObserver as typeof MutationObserver;

const { tipsboardLanguage } = await import("../src/editor/tipsboard-language");
const {
  buildTipsboardDecorationSetForTesting,
  tipsboardDecorations,
  tipsboardTheme,
} = await import("../src/editor/tipsboard-decorations");

const docText = String.raw`intro line

### Heading with \(x\) tail

$$
a^2
$$

more text
`;

function markClassesAt(set: DecorationSet, pos: number, docLen: number): string[] {
  const out: string[] = [];
  set.between(0, docLen, (from, to, deco) => {
    if (!(pos >= from && pos < to)) return;
    const spec = (deco as { spec?: { class?: string } }).spec;
    if (spec?.class) out.push(spec.class);
  });
  return out;
}

const parent = dom.window.document.createElement("div");
parent.style.height = "480px";
parent.style.width = "640px";
dom.window.document.body.appendChild(parent);

const state = EditorState.create({
  doc: docText,
  extensions: [tipsboardLanguage, ...tipsboardDecorations([]), tipsboardTheme],
});

const view = new EditorView({ state, parent });
view.dispatch({ selection: EditorSelection.cursor(docText.length) });

const deco = buildTipsboardDecorationSetForTesting(view);
const headingLine = view.state.doc.line(3);
const probe20 = headingLine.from + "### He".length;
const probeBeforeMath = headingLine.from + "### Heading with ".length;

console.log("visibleRanges", view.visibleRanges.map(({ from, to }) => ({ from, to })));
console.log("probe20", probe20, markClassesAt(deco, probe20, docText.length));
console.log("probeBeforeMath", probeBeforeMath, markClassesAt(deco, probeBeforeMath, docText.length));

deco.between(headingLine.from, headingLine.to, (from, to, d) => {
  const spec = (d as { spec?: { class?: string } }).spec;
  console.log("deco-range", from, to, spec?.class ?? "(no class)");
});

view.destroy();
