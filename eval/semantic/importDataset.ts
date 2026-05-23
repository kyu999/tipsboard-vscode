import { promises as fs } from "node:fs";
import path from "node:path";

import {
  SEMANTIC_EVAL_DATASETS,
  type SemanticEvalDataset,
  type SemanticEvalDatasetId,
  type SemanticEvalDocument,
  type SemanticEvalQuery,
} from "./datasets.js";
import {
  applySemanticEvalFetchLimits,
  cacheSatisfiesFetchLimits,
  readSemanticEvalFetchLimits,
} from "./fetchLimits.js";
import { createProgressReporter, logSemanticEvalProgress } from "./progress.js";

interface RowsResponse<T> {
  rows: Array<{ row_idx: number; row: T }>;
  num_rows_total: number;
}

interface JmtebRetrievalCorpusRow {
  docid: string;
  text: string;
}

interface JmtebRetrievalQueryRow {
  query: string;
  relevant_docs: string[];
}

interface BeirCorpusRow {
  _id: string;
  title: string;
  text: string;
}

interface BeirQueryRow {
  _id: string;
  text: string;
}

interface BeirQrelRow {
  "query-id": number | string;
  "corpus-id": number | string;
  score: number;
}

const DATASETS_SERVER_ROWS_URL = "https://datasets-server.huggingface.co/rows";
const ROWS_PAGE_SIZE = 100;
const FETCH_RETRY_ATTEMPTS = 5;
const FETCH_PAGE_DELAY_MS = 350;

export async function loadSemanticEvalDataset(
  datasetId: SemanticEvalDatasetId,
  cacheDir: string,
): Promise<SemanticEvalDataset> {
  await fs.mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `${datasetId}.json`);
  const limits = readSemanticEvalFetchLimits(datasetId);
  if (process.env.TIPSBOARD_SEMANTIC_EVAL_REFRESH_DATASET !== "1") {
    const cached = await readCachedDataset(cachePath);
    if (cached && cacheSatisfiesFetchLimits(cached, limits)) {
      const dataset = applySemanticEvalFetchLimits(cached, limits);
      const trimmed =
        dataset.documents.length !== cached.documents.length || dataset.queries.length !== cached.queries.length;
      logSemanticEvalProgress(
        trimmed
          ? `Loaded dataset cache with fetch limits: ${datasetId} (${dataset.documents.length} docs, ${dataset.queries.length} queries; cache file had ${cached.documents.length}/${cached.queries.length})`
          : `Loaded dataset cache: ${datasetId} (${dataset.documents.length} docs, ${dataset.queries.length} queries)`,
      );
      return dataset;
    }
    if (cached) {
      logSemanticEvalProgress(
        `Dataset cache is smaller than requested${formatFetchLimits(limits)} (${cached.documents.length} docs, ${cached.queries.length} queries); re-fetching`,
      );
    }
  }

  logSemanticEvalProgress(`Fetching dataset: ${datasetId}${formatFetchLimits(limits)}`);
  const fetched = await loadUncachedSemanticEvalDataset(datasetId, limits);
  const dataset = applySemanticEvalFetchLimits(fetched, limits);
  await fs.writeFile(cachePath, `${JSON.stringify(dataset)}\n`, "utf8");
  logSemanticEvalProgress(`Cached dataset: ${datasetId} (${dataset.documents.length} docs, ${dataset.queries.length} queries)`);
  return dataset;
}

async function loadUncachedSemanticEvalDataset(
  datasetId: SemanticEvalDatasetId,
  limits: ReturnType<typeof readSemanticEvalFetchLimits>,
): Promise<SemanticEvalDataset> {
  switch (datasetId) {
    case "beir-scifact":
      return loadBeirSciFact(limits);
    case "jmteb-lite-mldr":
      return loadJmtebLiteRetrieval({
        datasetId,
        corpusConfig: "mldr-retrieval-corpus",
        queryConfig: "mldr-retrieval-query",
        limits,
      });
  }
}

async function loadJmtebLiteRetrieval(options: {
  datasetId: Extract<SemanticEvalDatasetId, "jmteb-lite-mldr">;
  corpusConfig: string;
  queryConfig: string;
  limits: ReturnType<typeof readSemanticEvalFetchLimits>;
}): Promise<SemanticEvalDataset> {
  const corpusRows = await fetchDatasetRows<JmtebRetrievalCorpusRow>({
    dataset: "sbintuitions/JMTEB-lite",
    config: options.corpusConfig,
    split: "corpus",
    maxRows: options.limits.maxDocuments,
    pageDelayMs: FETCH_PAGE_DELAY_MS,
  });
  const queryRows = await fetchDatasetRows<JmtebRetrievalQueryRow>({
    dataset: "sbintuitions/JMTEB-lite",
    config: options.queryConfig,
    split: "test",
    maxRows: options.limits.maxQueries,
  });

  const documents = corpusRows.map(({ row }) => ({
    id: row.docid,
    title: titleFromText(row.text, row.docid),
    text: row.text,
  }));
  const docIds = new Set(documents.map((doc) => doc.id));
  const queries = queryRows
    .filter(({ row }) => row.query.trim() && row.relevant_docs.length > 0)
    .map(({ row, row_idx }) => ({
      id: `q${row_idx}`,
      text: row.query,
      relevant: Object.fromEntries(row.relevant_docs.map((docId) => [docId, 1])),
    }));

  return {
    definition: SEMANTIC_EVAL_DATASETS[options.datasetId],
    documents,
    queries: filterQueriesForDocumentSet(queries, docIds),
  };
}

async function loadBeirSciFact(limits: ReturnType<typeof readSemanticEvalFetchLimits>): Promise<SemanticEvalDataset> {
  const corpusRows = await fetchDatasetRows<BeirCorpusRow>({
    dataset: "BeIR/scifact",
    config: "corpus",
    split: "corpus",
    maxRows: limits.maxDocuments,
  });
  const queryRows = await fetchDatasetRows<BeirQueryRow>({
    dataset: "BeIR/scifact",
    config: "queries",
    split: "queries",
    maxRows: limits.maxQueries,
  });
  const qrelRows = await fetchDatasetRows<BeirQrelRow>({
    dataset: "BeIR/scifact-qrels",
    config: "default",
    split: "test",
  });

  const qrelsByQuery = new Map<string, Record<string, number>>();
  for (const { row } of qrelRows) {
    if (row.score <= 0) continue;
    const queryId = String(row["query-id"]);
    const corpusId = String(row["corpus-id"]);
    const relevant = qrelsByQuery.get(queryId) ?? {};
    relevant[corpusId] = row.score;
    qrelsByQuery.set(queryId, relevant);
  }

  const documents = corpusRows.map(({ row }) => ({
    id: row._id,
    title: row.title || row._id,
    text: row.text,
  }));
  const docIds = new Set(documents.map((doc) => doc.id));
  const queries = queryRows
    .map(({ row }) => ({
      id: row._id,
      text: row.text,
      relevant: qrelsByQuery.get(row._id) ?? {},
    }))
    .filter((query) => query.text.trim() && Object.keys(query.relevant).length > 0);

  return {
    definition: SEMANTIC_EVAL_DATASETS["beir-scifact"],
    documents,
    queries: filterQueriesForDocumentSet(queries, docIds),
  };
}

function titleFromText(text: string, fallback: string): string {
  const firstLine = text.split(/\n/, 1)[0]?.trim();
  if (!firstLine) return fallback;
  return firstLine.length > 80 ? `${firstLine.slice(0, 80).trim()}...` : firstLine;
}

function filterQueriesForDocumentSet(
  queries: SemanticEvalQuery[],
  docIds: Set<string>,
): SemanticEvalQuery[] {
  const filtered = queries.filter((query) => {
    const relevantIds = Object.entries(query.relevant)
      .filter(([, score]) => score > 0)
      .map(([docId]) => docId);
    return relevantIds.length > 0 && relevantIds.every((docId) => docIds.has(docId));
  });
  if (filtered.length < queries.length) {
    logSemanticEvalProgress(
      `Filtered queries for corpus subset: ${filtered.length}/${queries.length} kept`,
    );
  }
  return filtered;
}

function formatFetchLimits(limits: ReturnType<typeof readSemanticEvalFetchLimits>): string {
  const parts: string[] = [];
  if (limits.maxDocuments !== undefined) parts.push(`maxDocs=${limits.maxDocuments}`);
  if (limits.maxQueries !== undefined) parts.push(`maxQueries=${limits.maxQueries}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDatasetRows<T>(options: {
  dataset: string;
  config: string;
  split: string;
  maxRows?: number;
  pageDelayMs?: number;
}): Promise<Array<{ row_idx: number; row: T }>> {
  const out: Array<{ row_idx: number; row: T }> = [];
  const maxRows = options.maxRows;
  let total: number | undefined;
  let progress: ReturnType<typeof createProgressReporter> | undefined;
  for (let offset = 0; total === undefined || offset < total; offset += ROWS_PAGE_SIZE) {
    if (maxRows !== undefined && out.length >= maxRows) break;

    const pageLength = maxRows === undefined
      ? ROWS_PAGE_SIZE
      : Math.min(ROWS_PAGE_SIZE, maxRows - out.length);
    if (pageLength <= 0) break;

    const url = new URL(DATASETS_SERVER_ROWS_URL);
    url.searchParams.set("dataset", options.dataset);
    url.searchParams.set("config", options.config);
    url.searchParams.set("split", options.split);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("length", String(pageLength));

    const response = await fetchDatasetRowsPage(url, options);
    const body = await response.json() as RowsResponse<T>;
    total = body.num_rows_total;
    const progressTotal = maxRows === undefined ? total : Math.min(maxRows, total);
    progress ??= createProgressReporter({
      label: `fetch ${options.config}/${options.split}`,
      total: progressTotal,
      minIntervalMs: 500,
    });
    out.push(...body.rows);
    progress.update(Math.min(out.length, progressTotal), "rows");

    if (maxRows !== undefined && out.length >= maxRows) break;
    if (offset + pageLength >= total) break;
    if (options.pageDelayMs && options.pageDelayMs > 0) {
      await sleep(options.pageDelayMs);
    }
  }
  progress?.done("done");
  return out;
}

async function fetchDatasetRowsPage(
  url: URL,
  options: { dataset: string; config: string; split: string },
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= FETCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      const error = new Error(
        `Could not fetch ${options.dataset}/${options.config}/${options.split}: HTTP ${response.status}`,
      );
      if (!retryable || attempt === FETCH_RETRY_ATTEMPTS) throw error;
      lastError = error;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === FETCH_RETRY_ATTEMPTS) throw lastError;
    }
    const backoffMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
    logSemanticEvalProgress(
      `HF rows API retry ${attempt}/${FETCH_RETRY_ATTEMPTS - 1} for ${options.config}/${options.split} (${backoffMs}ms)`,
    );
    await sleep(backoffMs);
  }
  throw lastError ?? new Error(`Could not fetch ${options.dataset}/${options.config}/${options.split}`);
}

async function readCachedDataset(cachePath: string): Promise<SemanticEvalDataset | undefined> {
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    return JSON.parse(raw) as SemanticEvalDataset;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
