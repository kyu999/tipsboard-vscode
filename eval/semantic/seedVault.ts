import { promises as fs } from "node:fs";
import path from "node:path";

import { type SemanticEvalDatasetId } from "./datasets.js";
import { loadSemanticEvalDataset } from "./importDataset.js";
import { createProgressReporter, logSemanticEvalProgress } from "./progress.js";
import { markdownForSemanticEvalDocument, normalizeHeading } from "./wikiMarkdown.js";
import { buildSemanticEvalWikiLinks } from "./wikiLinks.js";

export interface SeededSemanticEvalVault {
  vaultPath: string;
  datasetName: string;
  documentCount: number;
  queryCount: number;
  docIdByPath: Map<string, string>;
  queries: Array<{
    id: string;
    text: string;
    relevant: Record<string, number>;
  }>;
  cleanup(): Promise<void>;
}

/** Tipsboard vault for manual UI inspection: `eval/.cache/vaults/<datasetId>/` */
export function semanticEvalVaultPath(cacheDir: string, datasetId: SemanticEvalDatasetId): string {
  return path.join(cacheDir, "vaults", datasetId);
}

export async function seedSemanticEvalVault(options: {
  datasetId: SemanticEvalDatasetId;
  cacheDir: string;
}): Promise<SeededSemanticEvalVault> {
  const dataset = await loadSemanticEvalDataset(options.datasetId, options.cacheDir);
  const vaultPath = semanticEvalVaultPath(options.cacheDir, options.datasetId);
  await refreshVaultDirectory(vaultPath);

  const pagesDir = path.join(vaultPath, "pages");
  await fs.mkdir(pagesDir, { recursive: true });

  const docIdByPath = new Map<string, string>();
  const usedNames = new Set<string>();
  const usedTitles = new Set<string>();
  const documents = dataset.documents.map((doc) => ({
    ...doc,
    title: uniqueTitle(normalizeHeading(doc.title || doc.id), usedTitles),
  }));
  const relatedTitlesByDocId = buildSemanticEvalWikiLinks(documents, dataset.queries);

  logSemanticEvalProgress(`Seeding vault: ${dataset.definition.name}`);
  logSemanticEvalProgress(`Vault path: ${vaultPath}`);
  const progress = createProgressReporter({
    label: "write wiki pages",
    total: documents.length,
    minIntervalMs: 500,
  });
  for (const [index, doc] of documents.entries()) {
    const fileName = uniqueFileName(`${String(index + 1).padStart(5, "0")}-${safeFileSegment(doc.id)}`, usedNames);
    const relativePath = `pages/${fileName}`;
    docIdByPath.set(relativePath, doc.id);
    await fs.writeFile(
      path.join(vaultPath, relativePath),
      markdownForSemanticEvalDocument({
        datasetName: dataset.definition.name,
        sourceUrl: dataset.definition.sourceUrl,
        id: doc.id,
        title: doc.title,
        text: doc.text,
        relatedTitles: relatedTitlesByDocId.get(doc.id) ?? [],
      }),
      "utf8",
    );
    progress.update(index + 1);
  }
  progress.done("done");

  return {
    vaultPath,
    datasetName: dataset.definition.name,
    documentCount: documents.length,
    queryCount: dataset.queries.length,
    docIdByPath,
    queries: dataset.queries,
    async cleanup(): Promise<void> {
      // Vault stays under eval/.cache/vaults/ for local Tipsboard inspection.
    },
  };
}

async function refreshVaultDirectory(vaultPath: string): Promise<void> {
  await fs.rm(vaultPath, { recursive: true, force: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await fs.mkdir(vaultPath, { recursive: true });
}

function safeFileSegment(value: string): string {
  const segment = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return segment || "doc";
}

function uniqueTitle(base: string, usedTitles: Set<string>): string {
  let title = base;
  for (let counter = 2; usedTitles.has(title); counter += 1) {
    title = `${base} (${counter})`;
  }
  usedTitles.add(title);
  return title;
}

function uniqueFileName(base: string, usedNames: Set<string>): string {
  let name = `${base}.md`;
  for (let counter = 2; usedNames.has(name); counter += 1) {
    name = `${base}-${counter}.md`;
  }
  usedNames.add(name);
  return name;
}
