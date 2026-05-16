export interface MermaidBlock {
  from: number;
  to: number;
  code: string;
}

interface MarkdownLine {
  text: string;
  from: number;
  to: number;
}

interface OpeningFence {
  marker: "`" | "~";
  length: number;
}

export function findMermaidBlocks(markdown: string): MermaidBlock[] {
  const lines = splitLines(markdown);
  const blocks: MermaidBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const openingLine = lines[index]!;
    const opening = parseOpeningFence(openingLine.text);
    if (!opening) {
      continue;
    }

    const closeIndex = findClosingFenceIndex(lines, index + 1, opening);
    if (closeIndex === null) {
      continue;
    }

    if (!isMermaidFence(openingLine.text)) {
      index = closeIndex;
      continue;
    }

    const closingLine = lines[closeIndex]!;
    const codeLines = lines
      .slice(index + 1, closeIndex)
      .map((line) => line.text);
    blocks.push({
      from: openingLine.from,
      to: closingLine.to,
      code: codeLines.join("\n"),
    });
    index = closeIndex;
  }

  return blocks;
}

function findClosingFenceIndex(
  lines: readonly MarkdownLine[],
  startIndex: number,
  opening: OpeningFence,
): number | null {
  for (let closeIndex = startIndex; closeIndex < lines.length; closeIndex += 1) {
      const closingLine = lines[closeIndex]!;
      if (!isClosingFence(closingLine.text, opening)) {
        continue;
      }
      return closeIndex;
  }

  return null;
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

function parseOpeningFence(line: string): OpeningFence | null {
  const match = line.trim().match(/^(`{3,}|~{3,})(.*)$/);
  if (!match) {
    return null;
  }

  const fence = match[1]!;
  return {
    marker: fence[0] as "`" | "~",
    length: fence.length,
  };
}

function isMermaidFence(line: string): boolean {
  const match = line.trim().match(/^(`{3,}|~{3,})(.*)$/);
  const rest = match?.[2]?.trim() ?? "";
  return rest.split(/\s+/, 1)[0]?.toLowerCase() === "mermaid";
}

function isClosingFence(line: string, opening: OpeningFence): boolean {
  const trimmed = line.trim();
  const markerRe = opening.marker === "`" ? "`" : "~";
  return new RegExp(`^${markerRe}{${opening.length},}$`).test(trimmed);
}
