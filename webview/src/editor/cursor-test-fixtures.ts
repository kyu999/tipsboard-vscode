export const DECORATED_CURSOR_MARKDOWN = [
  "Cursor Movement Fixture",
  "Plain paragraph before decorated content.",
  "## Heading with [[Home]]",
  "- first bullet",
  String.raw`- second bullet with **bold** and \(x + y\)`,
  "| Name | Value |",
  "| --- | --- |",
  "| Alpha | 1 |",
  "```mermaid",
  "flowchart TD",
  "  A --> B",
  "```",
  "Final paragraph after widgets.",
  "",
].join("\n");

export const DISPLAY_MATH_CURSOR_MARKDOWN = [
  "Math Cursor Fixture",
  "Before math.",
  "$$",
  String.raw`\begin{aligned}`,
  String.raw`a &= b + c \\`,
  String.raw`d &= e + f`,
  String.raw`\end{aligned}`,
  "$$",
  "After math.",
  "",
].join("\n");

const COMPREHENSIVE_CURSOR_LINES = [
  "Comprehensive Cursor Fixture",
  "",
  "# H1 with [[Home]]",
  "## H2 with [Missing]",
  "### H3 with [Docs https://example.com]",
  "#### H4 with https://example.org and #tag",
  "##### H5 with `inline code`",
  "###### H6 with **bold**, *italic*, and ~~strike~~",
  "",
  "> Quote line beside inline math \\(q + 1\\)",
  "  Indented prose beside inline math \\(i + 1\\)",
  "- Bullet with [[Home]] and \\(b + 1\\)",
  "  - Nested bullet with **bold** text",
  "1. Ordered item with [https://example.net]",
  "2. Ordered item with bare https://example.net/path",
  "",
  "![Remote alt](https://example.com/image.png)",
  "![Second remote alt](https://example.org/second-image.png)",
  "",
  "```ts",
  "const value = `literal with **markdown** and \\(math\\)`;",
  "console.log(value);",
  "```",
  "",
  "| Name | Value | Link |",
  "| :--- | ---: | :---: |",
  "| Alpha | 1 | [[Home]] |",
  "| Beta | 2 | [Missing] |",
  "",
  "```mermaid",
  "flowchart TD",
  "  Start --> Stop",
  "```",
  "",
  "$$",
  String.raw`\begin{aligned}`,
  String.raw`a &= b + c \\`,
  String.raw`d &= e + f`,
  String.raw`\end{aligned}`,
  "$$",
  "",
  String.raw`\[`,
  String.raw`\int_0^1 x^2 dx`,
  String.raw`\]`,
  "",
  "---",
  "",
  "A long wrapped paragraph " +
    "with internal links [[Home]], missing links [Missing], external links https://example.com/wrap, " +
    "inline math \\(w + 1\\), `code`, **bold**, *italic*, and tags #wrap ".repeat(10).trim(),
  "Final paragraph after all decorated blocks.",
  "",
];

export const COMPREHENSIVE_CURSOR_MARKDOWN = COMPREHENSIVE_CURSOR_LINES.join("\n");

function lineNumberOf(lineText: string): number {
  const index = COMPREHENSIVE_CURSOR_LINES.indexOf(lineText);
  if (index < 0) {
    throw new Error(`Missing comprehensive cursor fixture line: ${lineText}`);
  }
  return index + 1;
}

function lineNumberOfAfter(lineText: string, afterLineNumber: number): number {
  const index = COMPREHENSIVE_CURSOR_LINES.findIndex(
    (line, lineIndex) => lineIndex + 1 > afterLineNumber && line === lineText,
  );
  if (index < 0) {
    throw new Error(`Missing comprehensive cursor fixture line after ${afterLineNumber}: ${lineText}`);
  }
  return index + 1;
}

const displayMathOpenLine = lineNumberOf("$$");
const displayMathCloseLine = lineNumberOfAfter("$$", displayMathOpenLine);

export const COMPREHENSIVE_CURSOR_ANCHORS = {
  title: lineNumberOf("Comprehensive Cursor Fixture"),
  h1: lineNumberOf("# H1 with [[Home]]"),
  h2: lineNumberOf("## H2 with [Missing]"),
  h3: lineNumberOf("### H3 with [Docs https://example.com]"),
  h4: lineNumberOf("#### H4 with https://example.org and #tag"),
  h5: lineNumberOf("##### H5 with `inline code`"),
  h6: lineNumberOf("###### H6 with **bold**, *italic*, and ~~strike~~"),
  quote: lineNumberOf("> Quote line beside inline math \\(q + 1\\)"),
  indented: lineNumberOf("  Indented prose beside inline math \\(i + 1\\)"),
  bullet: lineNumberOf("- Bullet with [[Home]] and \\(b + 1\\)"),
  nestedBullet: lineNumberOf("  - Nested bullet with **bold** text"),
  ordered: lineNumberOf("1. Ordered item with [https://example.net]"),
  orderedBareUrl: lineNumberOf("2. Ordered item with bare https://example.net/path"),
  imageRemote: lineNumberOf("![Remote alt](https://example.com/image.png)"),
  imageVault: lineNumberOf("![Second remote alt](https://example.org/second-image.png)"),
  codeFenceOpen: lineNumberOf("```ts"),
  codeLine: lineNumberOf("const value = `literal with **markdown** and \\(math\\)`;"),
  codeLogLine: lineNumberOf("console.log(value);"),
  codeFenceClose: lineNumberOfAfter("```", lineNumberOf("```ts")),
  tableHeader: lineNumberOf("| Name | Value | Link |"),
  tableDelimiter: lineNumberOf("| :--- | ---: | :---: |"),
  tableFirstRow: lineNumberOf("| Alpha | 1 | [[Home]] |"),
  tableSecondRow: lineNumberOf("| Beta | 2 | [Missing] |"),
  mermaidFenceOpen: lineNumberOf("```mermaid"),
  mermaidLine: lineNumberOf("flowchart TD"),
  mermaidEdgeLine: lineNumberOf("  Start --> Stop"),
  mermaidFenceClose: lineNumberOfAfter("```", lineNumberOf("```mermaid")),
  displayMathOpen: displayMathOpenLine,
  displayMathFirstLine: lineNumberOf(String.raw`\begin{aligned}`),
  displayMathSecondLine: lineNumberOf(String.raw`a &= b + c \\`),
  displayMathThirdLine: lineNumberOf(String.raw`d &= e + f`),
  displayMathFourthLine: lineNumberOf(String.raw`\end{aligned}`),
  displayMathClose: displayMathCloseLine,
  bracketMathOpen: lineNumberOf(String.raw`\[`),
  bracketMathBody: lineNumberOf(String.raw`\int_0^1 x^2 dx`),
  bracketMathClose: lineNumberOf(String.raw`\]`),
  divider: lineNumberOf("---"),
  wrappedParagraph: lineNumberOf(COMPREHENSIVE_CURSOR_LINES[47]!),
  finalParagraph: lineNumberOf("Final paragraph after all decorated blocks."),
} as const;

export const COMPREHENSIVE_CURSOR_LINE_COUNT = COMPREHENSIVE_CURSOR_LINES.length;

function buildLineAnchors(
  lines: readonly string[],
  namedLines: Record<string, string>,
  namedAfter?: Record<string, { text: string; afterLine: number }>,
): Record<string, number> {
  const lineNumberOfIn = (lineText: string): number => {
    const index = lines.indexOf(lineText);
    if (index < 0) throw new Error(`Missing fixture line: ${lineText}`);
    return index + 1;
  };
  const lineNumberOfAfterIn = (lineText: string, afterLineNumber: number): number => {
    const index = lines.findIndex(
      (line, lineIndex) => lineIndex + 1 > afterLineNumber && line === lineText,
    );
    if (index < 0) throw new Error(`Missing fixture line after ${afterLineNumber}: ${lineText}`);
    return index + 1;
  };

  const out: Record<string, number> = {};
  for (const [key, text] of Object.entries(namedLines)) {
    out[key] = lineNumberOfIn(text);
  }
  if (namedAfter) {
    for (const [key, { text, afterLine }] of Object.entries(namedAfter)) {
      out[key] = lineNumberOfAfterIn(text, afterLine);
    }
  }
  return out;
}

const BOUNDARY_BLOCKS_LINES = [
  "Boundary Blocks Fixture",
  "Prose before table.",
  "| Col A | Col B |",
  "| --- | --- |",
  "| One | 1 |",
  "",
  "```mermaid",
  "flowchart TD",
  "  A --> B",
  "```",
  "",
  "$$",
  "x^2 + y^2",
  "$$",
  "",
  String.raw`\[`,
  String.raw`\int_0^1 x\, dx`,
  String.raw`\]`,
  "",
  "---",
  "",
  "After divider prose.",
  "",
] as const;

export const BOUNDARY_BLOCKS_MARKDOWN = BOUNDARY_BLOCKS_LINES.join("\n");
export const BOUNDARY_BLOCKS_LINE_COUNT = BOUNDARY_BLOCKS_LINES.length;
const boundaryNamed = buildLineAnchors(BOUNDARY_BLOCKS_LINES, {
  title: "Boundary Blocks Fixture",
  proseBeforeTable: "Prose before table.",
  tableHeader: "| Col A | Col B |",
  tableDelimiter: "| --- | --- |",
  tableRow: "| One | 1 |",
  mermaidFenceOpen: "```mermaid",
  mermaidLine: "flowchart TD",
  dollarMathBody: "x^2 + y^2",
  bracketMathBody: String.raw`\int_0^1 x\, dx`,
  divider: "---",
  proseAfterDivider: "After divider prose.",
});
export const BOUNDARY_BLOCKS_ANCHORS = {
  ...boundaryNamed,
  blankBeforeMermaid: 6,
  mermaidFenceClose: 10,
  blankBeforeDollarMath: 11,
  dollarMathOpen: 12,
  dollarMathClose: 14,
  blankBeforeBracketMath: 15,
  bracketMathOpen: 16,
  bracketMathClose: 18,
  blankBeforeDivider: 19,
  blankAfterDivider: 21,
} as const;

const CLICK_TARGET_LINES = [
  "Click Target Fixture",
  "Heading before table.",
  "| A | B |",
  "| --- | --- |",
  "| 1 | 2 |",
  "Blank after table.",
  "",
  "Before mermaid.",
  "```mermaid",
  "graph TD",
  "A-->B",
  "```",
  "After mermaid blank.",
  "",
  "Before dollar math.",
  "$$",
  "a^2",
  "$$",
  "After dollar math blank.",
  "",
  "Before bracket math.",
  String.raw`\[`,
  "b^2",
  String.raw`\]`,
  "After bracket math blank.",
  "",
  "---",
  "After divider.",
  "",
] as const;

export const CLICK_TARGET_MARKDOWN = CLICK_TARGET_LINES.join("\n");
export const CLICK_TARGET_LINE_COUNT = CLICK_TARGET_LINES.length;
export const CLICK_TARGET_ANCHORS = buildLineAnchors(CLICK_TARGET_LINES, {
  title: "Click Target Fixture",
  headingBeforeTable: "Heading before table.",
  tableHeader: "| A | B |",
  tableRow: "| 1 | 2 |",
  blankAfterTable: "Blank after table.",
  beforeMermaid: "Before mermaid.",
  mermaidFenceOpen: "```mermaid",
  afterMermaidBlank: "After mermaid blank.",
  beforeDollarMath: "Before dollar math.",
  dollarMathOpen: "$$",
  afterDollarMathBlank: "After dollar math blank.",
  beforeBracketMath: "Before bracket math.",
  bracketMathOpen: String.raw`\[`,
  afterBracketMathBlank: "After bracket math blank.",
  divider: "---",
  afterDivider: "After divider.",
});

const MERMAID_ONLY_LINES = [
  "Mermaid Only Fixture",
  "Prose before mermaid.",
  "```mermaid",
  "flowchart LR",
  "  X --> Y",
  "```",
  "Prose after mermaid.",
  "",
] as const;

export const MERMAID_ONLY_MARKDOWN = MERMAID_ONLY_LINES.join("\n");
export const MERMAID_ONLY_ANCHORS = buildLineAnchors(MERMAID_ONLY_LINES, {
  title: "Mermaid Only Fixture",
  proseBefore: "Prose before mermaid.",
  mermaidFenceOpen: "```mermaid",
  mermaidLine: "flowchart LR",
  mermaidFenceClose: "```",
  proseAfter: "Prose after mermaid.",
});

const TABLE_WITH_LINKS_LINES = [
  "Table Links Fixture",
  "| Label | Target |",
  "| --- | --- |",
  "| [[Home]] | [Docs https://example.com] |",
  "| [Missing] | https://example.org |",
  "",
] as const;

export const TABLE_WITH_LINKS_MARKDOWN = TABLE_WITH_LINKS_LINES.join("\n");
export const TABLE_WITH_LINKS_ANCHORS = buildLineAnchors(TABLE_WITH_LINKS_LINES, {
  title: "Table Links Fixture",
  tableHeader: "| Label | Target |",
  wikiLinkRow: "| [[Home]] | [Docs https://example.com] |",
  externalRow: "| [Missing] | https://example.org |",
});

const BRACKET_MATH_LINES = [
  "Bracket Math Fixture",
  "Before bracket math.",
  String.raw`\[`,
  String.raw`\sum_{i=1}^{n} i`,
  String.raw`\]`,
  "After bracket math.",
  "",
] as const;

export const BRACKET_MATH_MARKDOWN = BRACKET_MATH_LINES.join("\n");
export const BRACKET_MATH_ANCHORS = buildLineAnchors(BRACKET_MATH_LINES, {
  title: "Bracket Math Fixture",
  beforeMath: "Before bracket math.",
  bracketOpen: String.raw`\[`,
  bracketBody: String.raw`\sum_{i=1}^{n} i`,
  bracketClose: String.raw`\]`,
  afterMath: "After bracket math.",
});

const TALL_MATH_SPACER_LINES = [
  "Untitled",
  "##### Rendered result:",
  "$$",
  String.raw`\frac{\partial}{\partial t} \psi(\mathbf{x}, t)`,
  "=",
  String.raw`\left(`,
  String.raw`-\frac{\hbar^2}{2m}\nabla^2`,
  "+",
  String.raw`V(\mathbf{x})`,
  String.raw`\right)`,
  String.raw`\psi(\mathbf{x}, t)`,
  "$$",
  "",
  "- research notes",
] as const;

export const TALL_MATH_SPACER_MARKDOWN = TALL_MATH_SPACER_LINES.join("\n");
export const TALL_MATH_SPACER_ANCHORS = buildLineAnchors(TALL_MATH_SPACER_LINES, {
  title: "Untitled",
  renderedHeading: "##### Rendered result:",
  dollarMathOpen: "$$",
  researchNotes: "- research notes",
  blankAfterMath: "",
});

const WRAPPED_PARAGRAPH_LINES = [
  "Wrapped Paragraph Fixture",
  "A long wrapped paragraph " +
    "with internal links [[Home]], missing links [Missing], and tags #wrap ".repeat(12).trim(),
  "Next paragraph.",
  "",
] as const;

export const WRAPPED_PARAGRAPH_MARKDOWN = WRAPPED_PARAGRAPH_LINES.join("\n");
export const WRAPPED_PARAGRAPH_ANCHORS = buildLineAnchors(WRAPPED_PARAGRAPH_LINES, {
  title: "Wrapped Paragraph Fixture",
  wrappedLine: WRAPPED_PARAGRAPH_LINES[1]!,
  nextParagraph: "Next paragraph.",
});

const MATH_EXPRESSIONS_MULTI_BLOCK_LINES = [
  "Math Expressions",
  "Tipsboard supports [KaTeX]-style mathematical expressions inside Markdown notes.",
  "**You** can write both inline equations and block equations while keeping everything in plain Markdown files.",
  "",
  "**Block equation example:**",
  "```md",
  "$$",
  String.raw`\hat{f}(\xi)`,
  "=",
  String.raw`\int_{-\infty}^{\infty}`,
  String.raw`f(x)\,`,
  String.raw`e^{-2\pi i x \xi}`,
  String.raw`\,dx`,
  "$$",
  "```",
  "",
  "**Rendered result:**",
  "",
  "$$",
  String.raw`\hat{f}(\xi)`,
  "=",
  String.raw`\int_{-\infty}^{\infty}`,
  String.raw`f(x)\,`,
  String.raw`e^{-2\pi i x \xi}`,
  String.raw`\,dx`,
  "$$",
  "",
  "---",
  "",
  "",
  "**More advanced expressions are also supported:**",
  "",
  "```md",
  "$$",
  String.raw`\frac{\partial}{\partial t} \psi(\mathbf{x}, t)`,
  "=",
  String.raw`\left(`,
  String.raw`-\frac{\hbar^2}{2m}\nabla^2`,
  "+",
  String.raw`V(\mathbf{x})`,
  String.raw`\right)`,
  String.raw`\psi(\mathbf{x}, t)`,
  "$$",
  "```",
  "",
  "##### Rendered result:",
  "",
  "$$",
  String.raw`\frac{\partial}{\partial t} \psi(\mathbf{x}, t)`,
  "=",
  String.raw`\left(`,
  String.raw`-\frac{\hbar^2}{2m}\nabla^2`,
  "+",
  String.raw`V(\mathbf{x})`,
  String.raw`\right)`,
  String.raw`\psi(\mathbf{x}, t)`,
  "$$",
  "",
  "This makes Tipsboard suitable for:",
  "",
  "- research notes",
] as const;

export const MATH_EXPRESSIONS_MULTI_BLOCK_MARKDOWN = MATH_EXPRESSIONS_MULTI_BLOCK_LINES.join("\n");
export const MATH_EXPRESSIONS_MULTI_BLOCK_ANCHORS = {
  ...buildLineAnchors(
    MATH_EXPRESSIONS_MULTI_BLOCK_LINES,
    {
      title: "Math Expressions",
      researchNotes: "- research notes",
      suitableFor: "This makes Tipsboard suitable for:",
      renderedHeading: "##### Rendered result:",
    },
    {
      secondRenderedDollarOpen: { text: "$$", afterLine: 47 },
    },
  ),
  multiBlockCursorLine: MATH_EXPRESSIONS_MULTI_BLOCK_LINES.length,
} as const;

const FENCED_MATH_BELOW_RENDERED_LINES = [
  "Untitled2",
  "```md",
  "$$",
  String.raw`\hat{f}(\xi)`,
  "=",
  String.raw`\int_{-\infty}^{\infty}`,
  String.raw`f(x)\,`,
  String.raw`e^{-2\pi i x \xi}`,
  String.raw`\,dx`,
  "$$",
  "```",
  "$$",
  String.raw`\hat{f}(\xi)`,
  "=",
  String.raw`\int_{-\infty}^{\infty}`,
  String.raw`f(x)\,`,
  String.raw`e^{-2\pi i x \xi}`,
  String.raw`\,dx`,
  "$$",
  "```md",
  "$$",
  String.raw`\frac{\partial}{\partial t} \psi(\mathbf{x}, t)`,
  "=",
  String.raw`\left(`,
  String.raw`-\frac{\hbar^2}{2m}\nabla^2`,
  "+",
  String.raw`V(\mathbf{x})`,
  String.raw`\right)`,
  String.raw`\psi(\mathbf{x}, t)`,
  "$$",
  "```",
] as const;

export const FENCED_MATH_BELOW_RENDERED_MARKDOWN = FENCED_MATH_BELOW_RENDERED_LINES.join("\n");
export const FENCED_MATH_BELOW_RENDERED_LINE_COUNT = FENCED_MATH_BELOW_RENDERED_LINES.length;

const FENCED_MATH_PROSE_BELOW_LINES = [
  ...FENCED_MATH_BELOW_RENDERED_LINES,
  "",
  "# Document with Mermaid (for testing)",
  "",
  "Normal prose before the diagrams.",
  "",
] as const;

export const FENCED_MATH_PROSE_BELOW_MARKDOWN = FENCED_MATH_PROSE_BELOW_LINES.join("\n");
export const FENCED_MATH_PROSE_BELOW_ANCHORS = {
  ...buildLineAnchors(FENCED_MATH_PROSE_BELOW_LINES, {
    proseLine: "Normal prose before the diagrams.",
    heading: "# Document with Mermaid (for testing)",
  }),
  blankBeforeHeading: 32,
  fenceCloseLine: 31,
  proseCursorLine: 35,
} as const;

const MATH_EXPRESSIONS_BULLETS_LINES = [
  ...MATH_EXPRESSIONS_MULTI_BLOCK_LINES.slice(0, 48),
  "This makes Tipsboard suitable for:",
  "",
  "- research notes",
  "- engineering documentation",
  "- mathematics",
  "- physics",
  "- technical writing",
  "- academic knowledge bases",
] as const;

export const MATH_EXPRESSIONS_BULLETS_MARKDOWN = MATH_EXPRESSIONS_BULLETS_LINES.join("\n");
export const MATH_EXPRESSIONS_BULLETS_ANCHORS = buildLineAnchors(MATH_EXPRESSIONS_BULLETS_LINES, {
  lastBullet: "- academic knowledge bases",
  firstBullet: "- research notes",
});

/** ArrowDown/Up cases: one logical line step across boundary blocks (widget inactive). */
export const BOUNDARY_ARROW_CASES = [
  { from: BOUNDARY_BLOCKS_ANCHORS.proseBeforeTable, to: BOUNDARY_BLOCKS_ANCHORS.tableHeader, key: "ArrowDown" as const },
  { from: BOUNDARY_BLOCKS_ANCHORS.tableRow, to: BOUNDARY_BLOCKS_ANCHORS.blankBeforeMermaid, key: "ArrowDown" as const },
  { from: BOUNDARY_BLOCKS_ANCHORS.blankBeforeMermaid, to: BOUNDARY_BLOCKS_ANCHORS.mermaidFenceOpen, key: "ArrowDown" as const },
  { from: BOUNDARY_BLOCKS_ANCHORS.mermaidFenceClose, to: BOUNDARY_BLOCKS_ANCHORS.blankBeforeDollarMath, key: "ArrowDown" as const },
  { from: BOUNDARY_BLOCKS_ANCHORS.dollarMathClose, to: BOUNDARY_BLOCKS_ANCHORS.blankBeforeBracketMath, key: "ArrowDown" as const },
  { from: BOUNDARY_BLOCKS_ANCHORS.bracketMathClose, to: BOUNDARY_BLOCKS_ANCHORS.blankBeforeDivider, key: "ArrowDown" as const },
  { from: BOUNDARY_BLOCKS_ANCHORS.proseAfterDivider, to: BOUNDARY_BLOCKS_ANCHORS.blankAfterDivider, key: "ArrowUp" as const },
  { from: BOUNDARY_BLOCKS_ANCHORS.divider, to: BOUNDARY_BLOCKS_ANCHORS.blankBeforeDivider, key: "ArrowUp" as const },
  { from: BOUNDARY_BLOCKS_ANCHORS.dollarMathOpen, to: BOUNDARY_BLOCKS_ANCHORS.dollarMathBody, key: "ArrowDown" as const },
  { from: BOUNDARY_BLOCKS_ANCHORS.bracketMathOpen, to: BOUNDARY_BLOCKS_ANCHORS.bracketMathBody, key: "ArrowDown" as const },
] as const;
