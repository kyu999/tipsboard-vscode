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
