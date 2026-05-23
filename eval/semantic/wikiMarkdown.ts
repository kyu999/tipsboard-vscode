export interface SemanticEvalWikiMarkdownInput {
  datasetName: string;
  sourceUrl: string;
  id: string;
  title: string;
  text: string;
  relatedTitles: string[];
}

export function markdownForSemanticEvalDocument(doc: SemanticEvalWikiMarkdownInput): string {
  const title = normalizeHeading(doc.title || doc.id);
  const bodyLines = wikiBodyLines(doc.text);
  const summary = summaryFromText(doc.text);
  const relatedLinks = doc.relatedTitles.map((relatedTitle) => `- [${sanitizeInternalLinkTitle(relatedTitle)}]`);

  return [
    title,
    "",
    "# Overview",
    "",
    "## Summary",
    "",
    summary,
    "",
    "### Body",
    "",
    ...bodyLines,
    "",
    "#### Related Notes",
    "",
    ...(relatedLinks.length > 0 ? relatedLinks : ["No related notes were derived from qrels or title mentions."]),
    "",
    "##### Dataset Metadata",
    "",
    `- Dataset: ${doc.datasetName}`,
    `- Source URL: ${doc.sourceUrl}`,
    `- Document ID: ${doc.id}`,
    "",
  ].join("\n");
}

export function normalizeHeading(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text || "Untitled";
}

function wikiBodyLines(text: string): string[] {
  const lines = text.trim().split(/\r?\n/);
  const out: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (out[out.length - 1] !== "") out.push("");
      continue;
    }
    const heading = sectionHeadingFromLine(line);
    if (heading) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(`#### ${heading}`);
      out.push("");
      continue;
    }
    out.push(line);
  }
  return trimEmptyEdges(out);
}

function sectionHeadingFromLine(line: string): string | undefined {
  const match = /^(.{1,32})[.。]$/.exec(line);
  if (!match) return undefined;
  const heading = match[1]?.trim();
  if (!heading || /[、,]/.test(heading)) return undefined;
  return heading;
}

function summaryFromText(text: string): string {
  const firstParagraph = text
    .split(/\r?\n\s*\r?\n/, 1)[0]
    ?.replace(/\s+/g, " ")
    .trim();
  if (!firstParagraph) return "No summary text was available in the source dataset.";
  return firstParagraph.length > 360 ? `${firstParagraph.slice(0, 360).trim()}...` : firstParagraph;
}

function sanitizeInternalLinkTitle(title: string): string {
  return normalizeHeading(title).replace(/[\[\]\n]/g, " ");
}

function trimEmptyEdges(lines: string[]): string[] {
  const out = [...lines];
  while (out[0] === "") out.shift();
  while (out[out.length - 1] === "") out.pop();
  return out;
}
