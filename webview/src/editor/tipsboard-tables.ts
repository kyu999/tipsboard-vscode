export type MarkdownTableAlignment = "left" | "center" | "right" | null;

export interface MarkdownTableBlock {
  from: number;
  to: number;
  header: string[];
  alignments: MarkdownTableAlignment[];
  rows: string[][];
}

interface MarkdownLine {
  text: string;
  from: number;
  to: number;
}

export function findMarkdownTables(markdown: string): MarkdownTableBlock[] {
  const lines = splitLines(markdown);
  const tables: MarkdownTableBlock[] = [];
  let inCodeBlock = false;

  for (let index = 0; index < lines.length - 1; index++) {
    const line = lines[index]!;
    if (isFenceLine(line.text)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      continue;
    }

    const header = parseTableRow(line.text);
    const delimiter = parseDelimiterRow(lines[index + 1]!.text);
    if (!header || !delimiter || header.length < 2 || delimiter.length < 2) {
      continue;
    }

    const rows: string[][] = [];
    let endIndex = index + 1;
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex++) {
      const rowLine = lines[rowIndex]!;
      if (isFenceLine(rowLine.text)) {
        break;
      }
      const row = parseTableRow(rowLine.text);
      if (!row) {
        break;
      }
      rows.push(row);
      endIndex = rowIndex;
    }

    const columnCount = Math.max(
      header.length,
      delimiter.length,
      ...rows.map((row) => row.length),
    );
    const endLine = lines[endIndex]!;
    tables.push({
      from: line.from,
      to: endLine.to,
      header: padCells(header, columnCount),
      alignments: padAlignments(delimiter, columnCount),
      rows: rows.map((row) => padCells(row, columnCount)),
    });
    index = endIndex;
  }

  return tables;
}

function splitLines(markdown: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let from = 0;

  for (const line of markdown.split("\n")) {
    const to = from + line.length;
    lines.push({ text: line, from, to });
    from = to + 1;
  }

  return lines;
}

function isFenceLine(line: string): boolean {
  // Only backticks toggle "code" for table scanning. Tilde fences (~~~) are not toggled here:
  // a lone `~~~` line often appears inside ``` blocks as an example and would corrupt `inCodeBlock`,
  // hiding real tables below. Mermaid `~~~` blocks are filtered out at decoration time instead.
  return /^\s*```/.test(line);
}

function parseTableRow(line: string): string[] | null {
  if (!line.includes("|")) {
    return null;
  }

  const cells = splitEscapedPipes(line);
  if (cells.length > 0 && cells[0]!.trim() === "") {
    cells.shift();
  }
  if (cells.length > 0 && cells[cells.length - 1]!.trim() === "") {
    cells.pop();
  }

  if (cells.length < 2) {
    return null;
  }

  return cells.map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function parseDelimiterRow(line: string): MarkdownTableAlignment[] | null {
  const cells = parseTableRow(line);
  if (!cells) {
    return null;
  }

  const alignments: MarkdownTableAlignment[] = [];
  for (const cell of cells) {
    const compact = cell.replace(/\s+/g, "");
    if (!/^:?-{3,}:?$/.test(compact)) {
      return null;
    }
    alignments.push(alignmentForDelimiter(compact));
  }

  return alignments;
}

function splitEscapedPipes(line: string): string[] {
  const cells: string[] = [];
  let current = "";

  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (char === "|" && !isEscaped(line, index)) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);

  return cells;
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let pos = index - 1; pos >= 0 && text[pos] === "\\"; pos--) {
    slashCount++;
  }
  return slashCount % 2 === 1;
}

function alignmentForDelimiter(delimiter: string): MarkdownTableAlignment {
  const starts = delimiter.startsWith(":");
  const ends = delimiter.endsWith(":");
  if (starts && ends) return "center";
  if (ends) return "right";
  if (starts) return "left";
  return null;
}

function padCells(cells: string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => cells[index] ?? "");
}

function padAlignments(
  alignments: MarkdownTableAlignment[],
  columnCount: number,
): MarkdownTableAlignment[] {
  return Array.from(
    { length: columnCount },
    (_, index) => alignments[index] ?? null,
  );
}
