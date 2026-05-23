import type { SemanticEvalDocument, SemanticEvalQuery } from "./datasets.js";

export interface SemanticEvalWikiLinkDocument extends SemanticEvalDocument {
  title: string;
}

export function buildSemanticEvalWikiLinks(
  documents: SemanticEvalWikiLinkDocument[],
  queries: SemanticEvalQuery[],
  options: { maxLinksPerDocument?: number } = {},
): Map<string, string[]> {
  const maxLinksPerDocument = options.maxLinksPerDocument ?? 5;
  const titleById = new Map(documents.map((doc) => [doc.id, doc.title]));
  const textById = new Map(documents.map((doc) => [doc.id, doc.text]));
  const linksByDocId = new Map<string, Set<string>>();

  const addLink = (fromId: string, toId: string): void => {
    if (fromId === toId) return;
    const title = titleById.get(toId);
    if (!title) return;
    const links = linksByDocId.get(fromId) ?? new Set<string>();
    if (links.size >= maxLinksPerDocument) return;
    links.add(title);
    linksByDocId.set(fromId, links);
  };

  for (const query of queries) {
    const relevantIds = Object.entries(query.relevant)
      .filter(([docId, score]) => score > 0 && titleById.has(docId))
      .map(([docId]) => docId);
    for (const fromId of relevantIds) {
      for (const toId of relevantIds) {
        addLink(fromId, toId);
      }
    }
  }

  const candidates = documents
    .map((doc) => ({ id: doc.id, title: doc.title.trim() }))
    .filter((doc) => doc.title.length >= 3 && doc.title.length <= 80 && !/[\[\]\n]/.test(doc.title))
    .sort((a, b) => b.title.length - a.title.length);

  const candidatesByFirstChar = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const first = Array.from(candidate.title)[0];
    if (!first) continue;
    const bucket = candidatesByFirstChar.get(first) ?? [];
    bucket.push(candidate);
    candidatesByFirstChar.set(first, bucket);
  }

  for (const doc of documents) {
    const links = linksByDocId.get(doc.id);
    if (links && links.size >= maxLinksPerDocument) continue;

    const text = textById.get(doc.id) ?? "";
    const candidateIds = new Set<string>();
    for (const char of new Set(Array.from(text))) {
      for (const candidate of candidatesByFirstChar.get(char) ?? []) {
        candidateIds.add(candidate.id);
      }
    }

    for (const candidateId of candidateIds) {
      if ((linksByDocId.get(doc.id)?.size ?? 0) >= maxLinksPerDocument) break;
      const title = titleById.get(candidateId);
      if (!title || candidateId === doc.id) continue;
      if (text.includes(title)) addLink(doc.id, candidateId);
    }
  }

  const out = new Map<string, string[]>();
  for (const [docId, links] of linksByDocId.entries()) {
    if (links.size > 0) out.set(docId, [...links]);
  }
  return out;
}
