/** @vitest-environment jsdom */

import { describe, expect, it, afterEach } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import { type DecorationSet, EditorView } from "@codemirror/view";

import { tipsboardLanguage } from "./tipsboard-language";
import {
  buildTipsboardDecorationSetForTesting,
  tipsboardTableDecorations,
  tipsboardDecorations,
  tipsboardTheme,
} from "./tipsboard-decorations";
import { rangeFullyContainedInAny } from "./tipsboard-markdown-ranges";

async function flushLayout(view: EditorView): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  view.requestMeasure();
}

function makeView(
  doc: string,
  existingTitles: Iterable<string> = [],
  cursorPos = doc.length,
): EditorView {
  const parent = document.createElement("div");
  parent.style.height = "480px";
  parent.style.width = "640px";
  parent.style.overflow = "auto";
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [tipsboardLanguage, ...tipsboardDecorations(existingTitles), tipsboardTheme],
  });
  const view = new EditorView({ state, parent });
  view.dispatch({ selection: EditorSelection.cursor(cursorPos) });
  view.requestMeasure();
  return view;
}

function markClassesAt(set: DecorationSet, pos: number, docLen: number): string[] {
  const out: string[] = [];
  set.between(0, docLen, (from, to, deco) => {
    if (!(pos >= from && pos < to)) return;
    const spec = (deco as { spec?: { class?: string } }).spec;
    if (spec?.class) out.push(spec.class);
  });
  return out;
}

function classesAtText(
  set: DecorationSet,
  doc: string,
  needle: string,
  offset = 0,
): string[] {
  const pos = doc.indexOf(needle);
  expect(pos, `Missing test text: ${needle}`).toBeGreaterThanOrEqual(0);
  return markClassesAt(set, pos + offset, doc.length);
}

function expectClassAtText(
  set: DecorationSet,
  doc: string,
  needle: string,
  className: string,
  offset = 0,
) {
  expect(classesAtText(set, doc, needle, offset)).toContain(className);
}

function expectNoClassAtText(
  set: DecorationSet,
  doc: string,
  needle: string,
  className: string,
  offset = 0,
) {
  expect(classesAtText(set, doc, needle, offset)).not.toContain(className);
}

function widgetNames(set: DecorationSet, docLen: number): string[] {
  const out: string[] = [];
  set.between(0, docLen, (_from, _to, deco) => {
    const spec = (deco as { spec?: { widget?: { constructor?: { name?: string } } } }).spec;
    const name = spec?.widget?.constructor?.name;
    if (name) out.push(name);
  });
  return out;
}

function hasWidgetDecorationAtRange(set: DecorationSet, from: number, to: number): boolean {
  let found = false;
  set.between(from, to, (rangeFrom, rangeTo, deco) => {
    const spec = (deco as { spec?: { widget?: unknown } }).spec;
    if (rangeFrom === from && rangeTo === to && spec?.widget) {
      found = true;
    }
  });
  return found;
}

describe("rangeFullyContainedInAny", () => {
  it("treats intersecting ranges that are not subsets as not contained", () => {
    const outer = { from: 10, to: 40 };
    expect(rangeFullyContainedInAny({ from: 5, to: 50 }, [outer])).toBe(false);
    expect(rangeFullyContainedInAny({ from: 15, to: 30 }, [outer])).toBe(true);
  });
});

describe("Tipsboard markdown decorations with KaTeX spans", () => {
  const opened: EditorView[] = [];
  afterEach(() => {
    for (const v of opened.splice(0)) {
      v.destroy();
    }
  });

  it("still decorates ### on a line that partially overlaps inline \\(…\\)", async () => {
    const doc = String.raw`intro line

### Heading with \(x\) tail

$$
a^2
$$

more text
`;
    const view = makeView(doc);
    opened.push(view);
    await flushLayout(view);
    const deco = buildTipsboardDecorationSetForTesting(view);
    const headingLine = view.state.doc.line(3);
    const probe = headingLine.from + "### Heading with ".length;
    const classes = markClassesAt(deco, probe, view.state.doc.length);
    expect(classes.some((c) => c.includes("cm-tipsboard-h3"))).toBe(true);
  });

  it("applies page-title line when inline math is present but the first line is not inside a display $$ block", async () => {
    const doc = String.raw`### \(note\) style title

$$
y
$$
`;
    const view = makeView(doc);
    opened.push(view);
    await flushLayout(view);
    const deco = buildTipsboardDecorationSetForTesting(view);
    const line1 = view.state.doc.line(1);
    const probe = line1.from + 4;
    const classes = markClassesAt(deco, probe, view.state.doc.length);
    expect(classes.some((c) => c.includes("cm-page-title-line"))).toBe(true);
  });

  it("still decorates ### outside a ```md fence that contains inner # text", async () => {
    const doc = "### Outside heading\n\n```md\n# inner\n```\n";
    const view = makeView(doc);
    opened.push(view);
    await flushLayout(view);
    const deco = buildTipsboardDecorationSetForTesting(view);
    const line1 = view.state.doc.line(1);
    const probe = line1.from + "### ".length;
    const classes = markClassesAt(deco, probe, view.state.doc.length);
    expect(classes.some((c) => c.includes("cm-tipsboard-h3"))).toBe(true);
  });

  it("shows fenced code delimiters while editing inside the fenced block", async () => {
    const doc = "```md\nconst value = 1\n```\n";
    const openingFenceFrom = doc.indexOf("```md");
    const openingFenceTo = openingFenceFrom + "```".length;
    const languageFrom = openingFenceTo;
    const languageTo = languageFrom + "md".length;
    const closingFenceFrom = doc.lastIndexOf("```");
    const closingFenceTo = closingFenceFrom + "```".length;

    const inactiveView = makeView(doc);
    opened.push(inactiveView);
    await flushLayout(inactiveView);
    const inactiveDeco = buildTipsboardDecorationSetForTesting(inactiveView);

    expect(hasWidgetDecorationAtRange(inactiveDeco, openingFenceFrom, openingFenceTo)).toBe(true);
    expect(hasWidgetDecorationAtRange(inactiveDeco, languageFrom, languageTo)).toBe(true);
    expect(hasWidgetDecorationAtRange(inactiveDeco, closingFenceFrom, closingFenceTo)).toBe(true);

    const activeView = makeView(doc, [], doc.indexOf("const value"));
    opened.push(activeView);
    await flushLayout(activeView);
    const activeDeco = buildTipsboardDecorationSetForTesting(activeView);

    expect(hasWidgetDecorationAtRange(activeDeco, openingFenceFrom, openingFenceTo)).toBe(false);
    expect(hasWidgetDecorationAtRange(activeDeco, languageFrom, languageTo)).toBe(false);
    expect(hasWidgetDecorationAtRange(activeDeco, closingFenceFrom, closingFenceTo)).toBe(false);
  });

  it("keeps paragraph inline decorations when the paragraph also contains inline math", async () => {
    const doc = String.raw`Math Expressions
Tipsboard supports KaTeX-style mathematical expressions inside Markdown notes.
**You** can write both inline equations and block equations while keeping \( f(t) \) in plain Markdown files.
`;
    const view = makeView(doc);
    opened.push(view);
    await flushLayout(view);
    const deco = buildTipsboardDecorationSetForTesting(view);

    expectClassAtText(deco, doc, "Math Expressions", "cm-page-title-line");
    expectClassAtText(deco, doc, "You", "cm-tipsboard-bold");
  });

  it("keeps every markdown decoration independent from neighboring KaTeX spans", async () => {
    const doc = String.raw`Math Expressions
# H1 with \(a\)
## H2 with \(a\)
### H3 with \(a\)
#### H4 with \(a\)
##### H5 with \(a\)
###### H6 with \(a\)

**You** can write *inline equations* and ~~strike text~~ with ${"`code`"} near \( f(t) \), [Home], [Missing], [Docs https://example.com], [https://example.org], https://example.net, and #math.
> Quote beside \(q\)

  Indented beside \(i\)
- Bullet beside \(b\)
1. Ordered beside \(o\)

![Alt](https://example.com/image.png)

${"```"}md
const value = 1
${"```"}

| A | B |
|---|---|
| 1 | 2 |

${"```"}mermaid
graph TD
A-->B
${"```"}

$$
x^2
$$

---
`;
    const view = makeView(doc, ["home"]);
    opened.push(view);
    await flushLayout(view);
    const inlineDeco = buildTipsboardDecorationSetForTesting(view);
    const blockDeco = view.state.field(tipsboardTableDecorations);
    const inlineWidgets = widgetNames(inlineDeco, doc.length);
    const blockWidgets = widgetNames(blockDeco, doc.length);

    expectClassAtText(inlineDeco, doc, "Math Expressions", "cm-page-title-line");
    expectClassAtText(inlineDeco, doc, "H1 with", "cm-tipsboard-h1");
    expectClassAtText(inlineDeco, doc, "H2 with", "cm-tipsboard-h2");
    expectClassAtText(inlineDeco, doc, "H3 with", "cm-tipsboard-h3");
    expectClassAtText(inlineDeco, doc, "H4 with", "cm-tipsboard-h4");
    expectClassAtText(inlineDeco, doc, "H5 with", "cm-tipsboard-h5");
    expectClassAtText(inlineDeco, doc, "H6 with", "cm-tipsboard-h6");
    expectClassAtText(inlineDeco, doc, "You", "cm-tipsboard-bold");
    expectClassAtText(inlineDeco, doc, "inline equations", "cm-tipsboard-italic");
    expectClassAtText(inlineDeco, doc, "strike text", "cm-tipsboard-strike");
    expectClassAtText(inlineDeco, doc, "`code`", "cm-tipsboard-inline-code", 1);
    expectClassAtText(inlineDeco, doc, "Home", "cm-tipsboard-link");
    expectClassAtText(inlineDeco, doc, "Missing", "cm-tipsboard-missing-link");
    expectClassAtText(inlineDeco, doc, "Docs", "cm-tipsboard-external-link");
    expectClassAtText(inlineDeco, doc, "https://example.org", "cm-tipsboard-external-link");
    expectClassAtText(inlineDeco, doc, "https://example.net", "cm-tipsboard-external-link");
    expectClassAtText(inlineDeco, doc, "#math", "cm-tipsboard-tag");
    expectClassAtText(inlineDeco, doc, "Quote beside", "cm-tipsboard-quote");
    expectClassAtText(inlineDeco, doc, "Indented beside", "cm-tipsboard-indent");
    expectClassAtText(inlineDeco, doc, "1. Ordered", "cm-tipsboard-ordered-marker");
    expectClassAtText(inlineDeco, doc, "const value", "cm-tipsboard-code");
    expect(inlineWidgets).toContain("BulletWidget");
    expect(inlineWidgets).toContain("MarkdownImageWidget");
    expect(blockWidgets).toContain("KaTeXWidget");
    expect(blockWidgets).toContain("TableWidget");
    expect(blockWidgets).toContain("MermaidWidget");
    expect(blockWidgets).toContain("DividerWidget");
  });

  it("does not apply markdown emphasis inside rendered math spans", async () => {
    const doc = String.raw`Text \( **not bold** \) and **bold** outside.
`;
    const view = makeView(doc);
    opened.push(view);
    await flushLayout(view);
    const deco = buildTipsboardDecorationSetForTesting(view);

    expectNoClassAtText(deco, doc, "not bold", "cm-tipsboard-bold");
    expectClassAtText(deco, doc, "bold** outside", "cm-tipsboard-bold");
  });

  it("decorates vault attachment links when the caret is on another line", async () => {
    const doc = "Title\n[PDF_example](assets/files/file_2eb0a2fc-8df6-4bb2-bd00-e1a32ff33e35.pdf)\n";
    const view = makeView(doc, [], 0);
    opened.push(view);
    await flushLayout(view);
    const deco = buildTipsboardDecorationSetForTesting(view);

    expectClassAtText(deco, doc, "PDF_example", "cm-tipsboard-vault-attachment-link");
  });

  it("shows raw vault attachment markdown on the active line", async () => {
    const doc = "Title\n[PDF_example](assets/files/file_2eb0a2fc-8df6-4bb2-bd00-e1a32ff33e35.pdf)\n";
    const attachLineStart = doc.indexOf("[PDF_example]");
    const view = makeView(doc, [], attachLineStart + 2);
    opened.push(view);
    await flushLayout(view);
    const deco = buildTipsboardDecorationSetForTesting(view);

    expectNoClassAtText(deco, doc, "PDF_example", "cm-tipsboard-vault-attachment-link");
  });
});
