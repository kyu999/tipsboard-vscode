import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { extractTitle } from "./vault.js";
import {
  applySemanticTransformersEnv,
  offlineSemanticModelHint,
  type TransformersEnvLike,
} from "./semanticTransformersEnv.js";

const PAGES_PREFIX = "pages";
const SEMANTIC_DIR = ".tipsboard/semantic";
const MANIFEST_FILE = "manifest.json";
const CHUNKS_FILE = "chunks.json";
const VECTORS_FILE = "vectors.f32";
const SCHEMA_VERSION = 1;
const DEFAULT_MODEL_ID = "Xenova/multilingual-e5-base";
const TARGET_CHUNK_CHARS = 1600;
const CHUNK_OVERLAP_CHARS = 200;
const MAX_RESULTS = 20;
/** Markdown headings treated as section boundaries (# through #####). */
const MAX_HEADING_LEVEL = 5;

export interface SemanticChunk {
  id: string;
  path: string;
  title: string;
  heading: string;
  headings: string[];
  content: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  hash: string;
  updatedAt: number;
  createdAt: number;
}

export interface SemanticIndexManifest {
  schemaVersion: 1;
  modelId: string;
  dimension: number;
  chunkCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SemanticSearchResult {
  path: string;
  title: string;
  heading: string;
  snippet: string;
  score: number;
  startLine: number;
  endLine: number;
}

export interface SemanticSearchResponse {
  results: SemanticSearchResult[];
  indexedChunkCount: number;
  modelId: string;
}

export interface EmbeddingProvider {
  modelId: string;
  embed(texts: string[]): Promise<number[][]>;
  embedDocuments?(texts: string[]): Promise<number[][]>;
  embedQuery?(text: string): Promise<number[]>;
}

interface SemanticIndex {
  manifest: SemanticIndexManifest;
  chunks: SemanticChunk[];
  vectors: number[][];
}

export interface SemanticIndexSyncResult {
  chunkCount: number;
  modelId: string;
  newlyEmbeddedCount: number;
  reusedChunkCount: number;
  updatedAt: number;
}

interface NoteForChunking {
  path: string;
  title: string;
  body: string;
  updatedAt: number;
  createdAt: number;
}

export interface SemanticSearchOptions {
  limit?: number;
  mode?: SemanticSearchMode;
  denseWeight?: number;
  bm25Weight?: number;
  onEmbeddingProgress?: (progress: SemanticIndexProgress) => void;
}

export type SemanticSearchMode = "dense" | "hybrid";

export interface SemanticIndexProgress {
  completed: number;
  total: number;
}

export interface SemanticIndexBuildOptions {
  onEmbeddingProgress?: (progress: SemanticIndexProgress) => void;
}

export interface TransformersEmbeddingProviderOptions {
  cacheDir: string;
  resolverBasePath: string;
  modelId?: string;
  allowRemoteModels?: boolean;
}

function loadTransformersModule(resolverBasePath: string): {
  env?: TransformersEnvLike;
  pipeline: (...args: unknown[]) => Promise<unknown>;
} {
  const require = createRequire(resolverBasePath);
  return require("@huggingface/transformers") as {
    env?: TransformersEnvLike;
    pipeline: (...args: unknown[]) => Promise<unknown>;
  };
}

export function createTransformersEmbeddingProvider(
  options: TransformersEmbeddingProviderOptions,
): EmbeddingProvider {
  const cacheDir = options.cacheDir;
  const resolverBasePath = options.resolverBasePath;
  const modelId = options.modelId?.trim() || DEFAULT_MODEL_ID;
  const allowRemoteModels = options.allowRemoteModels ?? true;
  let pipelinePromise: Promise<unknown> | undefined;
  const profile = embeddingModelProfile(modelId);

  async function getPipeline(): Promise<unknown> {
    pipelinePromise ??= (async () => {
      const mod = loadTransformersModule(resolverBasePath);
      applySemanticTransformersEnv(mod.env, {
        cacheDir,
        allowRemoteModels,
        localModelPath: "",
      });
      try {
        return await mod.pipeline("feature-extraction", modelId, { dtype: "q8" });
      } catch (error) {
        if (!allowRemoteModels) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`${message}\n\n${offlineSemanticModelHint(cacheDir, modelId)}`, { cause: error });
        }
        throw error;
      }
    })();
    return pipelinePromise;
  }

  async function embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const pipe = (await getPipeline()) as (input: string | string[], options?: unknown) => Promise<unknown>;
    const output = await pipe(texts, { pooling: profile.pooling, normalize: true });
    return tensorToVectors(output, texts.length);
  }

  return {
    modelId,
    async embed(texts: string[]): Promise<number[][]> {
      return embedTexts(texts);
    },
    async embedDocuments(texts: string[]): Promise<number[][]> {
      return embedTexts(texts.map((text) => `${profile.documentPrefix}${text}`));
    },
    async embedQuery(text: string): Promise<number[]> {
      const [vector] = await embedTexts([`${profile.queryPrefix}${text}`]);
      return vector ?? [];
    },
  };
}

export async function semanticSearch(
  vaultPath: string,
  query: string,
  provider: EmbeddingProvider,
  options: SemanticSearchOptions = {},
): Promise<SemanticSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], indexedChunkCount: 0, modelId: provider.modelId };
  }

  const index = await ensureSemanticIndex(vaultPath, provider, {
    onEmbeddingProgress: options.onEmbeddingProgress,
  });
  const queryVector = provider.embedQuery ? await provider.embedQuery(trimmed) : (await provider.embed([trimmed]))[0];
  if (!queryVector) {
    return { results: [], indexedChunkCount: index.chunks.length, modelId: provider.modelId };
  }

  const queryLower = trimmed.toLocaleLowerCase();
  const denseScores = index.chunks.map((_, i) => cosineSimilarity(queryVector, index.vectors[i] ?? []));
  const bm25Scores = options.mode === "hybrid" ? bm25ScoresForQuery(trimmed, index.chunks) : [];
  const normalizedDenseScores = normalizeScores(denseScores);
  const normalizedBm25Scores = normalizeScores(bm25Scores);
  const denseWeight = clampWeight(options.denseWeight ?? 0.75);
  const bm25Weight = clampWeight(options.bm25Weight ?? 0.25);
  const scored = index.chunks.map((chunk, i) => {
    const semanticScore = denseScores[i] ?? 0;
    const denseRankScore = normalizedDenseScores[i] ?? 0;
    const bm25RankScore = normalizedBm25Scores[i] ?? 0;
    const boost = titleHeadingBoost(chunk, queryLower);
    const hybridScore = options.mode === "hybrid"
      ? denseRankScore * denseWeight + bm25RankScore * bm25Weight
      : semanticScore;
    return {
      chunk,
      score: hybridScore * 0.85 + boost * 0.15,
    };
  });

  const limit = Math.max(1, Math.min(options.limit ?? MAX_RESULTS, 100));
  const results = scored
    .sort((a, b) => b.score - a.score || a.chunk.title.localeCompare(b.chunk.title))
    .slice(0, limit)
    .map(({ chunk, score }) => ({
      path: chunk.path,
      title: chunk.title,
      heading: chunk.heading,
      snippet: buildSnippet(chunk.content),
      score,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
    }));

  return {
    results,
    indexedChunkCount: index.chunks.length,
    modelId: provider.modelId,
  };
}

export async function updateSemanticIndex(
  vaultPath: string,
  provider: EmbeddingProvider,
  options: SemanticIndexBuildOptions = {},
): Promise<SemanticIndexSyncResult> {
  const index = await ensureSemanticIndex(vaultPath, provider, options);
  return toSemanticIndexSyncResult(index);
}

export async function rebuildSemanticIndex(
  vaultPath: string,
  provider: EmbeddingProvider,
  options: SemanticIndexBuildOptions = {},
): Promise<SemanticIndexSyncResult> {
  const chunks = await buildVaultChunks(vaultPath);
  const vectors = await embedChunks(chunks, provider, options.onEmbeddingProgress);
  const manifest = await writeSemanticIndex(vaultPath, provider.modelId, chunks, vectors, undefined);
  return {
    chunkCount: manifest.chunkCount,
    modelId: manifest.modelId,
    newlyEmbeddedCount: chunks.length,
    reusedChunkCount: 0,
    updatedAt: manifest.updatedAt,
  };
}

export async function ensureSemanticIndex(
  vaultPath: string,
  provider: EmbeddingProvider,
  options: SemanticIndexBuildOptions = {},
): Promise<SemanticIndex & { newlyEmbeddedCount: number; reusedChunkCount: number }> {
  const chunks = await buildVaultChunks(vaultPath);
  const existing = await readSemanticIndex(vaultPath).catch(() => null);
  if (
    existing &&
    existing.manifest.modelId === provider.modelId &&
    existing.chunks.length === chunks.length &&
    existing.chunks.every((chunk, i) => chunk.hash === chunks[i]?.hash && chunk.path === chunks[i]?.path)
  ) {
    return {
      ...existing,
      newlyEmbeddedCount: 0,
      reusedChunkCount: chunks.length,
    };
  }

  const reusedByKey = new Map<string, { chunk: SemanticChunk; vector: number[] }>();
  if (existing?.manifest.modelId === provider.modelId) {
    for (const [i, chunk] of existing.chunks.entries()) {
      const vector = existing.vectors[i];
      if (vector) reusedByKey.set(stableChunkKey(chunk), { chunk, vector });
    }
  }

  const vectors: number[][] = new Array(chunks.length);
  const pending: Array<{ index: number; chunk: SemanticChunk }> = [];
  for (const [i, chunk] of chunks.entries()) {
    const reusable = reusedByKey.get(stableChunkKey(chunk));
    if (reusable && reusable.chunk.hash === chunk.hash) {
      vectors[i] = reusable.vector;
    } else {
      pending.push({ index: i, chunk });
    }
  }

  const embedded = await embedChunks(pending.map((entry) => entry.chunk), provider, options.onEmbeddingProgress);
  for (const [i, entry] of pending.entries()) {
    vectors[entry.index] = embedded[i] ?? [];
  }

  const manifest = await writeSemanticIndex(vaultPath, provider.modelId, chunks, vectors, existing?.manifest);
  return {
    manifest,
    chunks,
    vectors,
    newlyEmbeddedCount: pending.length,
    reusedChunkCount: chunks.length - pending.length,
  };
}

function toSemanticIndexSyncResult(
  index: SemanticIndex & { newlyEmbeddedCount: number; reusedChunkCount: number },
): SemanticIndexSyncResult {
  return {
    chunkCount: index.manifest.chunkCount,
    modelId: index.manifest.modelId,
    newlyEmbeddedCount: index.newlyEmbeddedCount,
    reusedChunkCount: index.reusedChunkCount,
    updatedAt: index.manifest.updatedAt,
  };
}

export function buildNoteChunks(note: NoteForChunking): SemanticChunk[] {
  const baseSections = splitMarkdownSections(note);
  const splitSections = baseSections.flatMap((section) => splitOversizedSection(section));
  return splitSections.map((section, chunkIndex) => {
    const hash = sha256(
      JSON.stringify({
        path: note.path,
        title: note.title,
        heading: section.heading,
        headings: section.headings,
        content: section.content,
      }),
    );
    return {
      id: sha256(`${note.path}\0${chunkIndex}\0${hash}`),
      path: note.path,
      title: note.title,
      heading: section.heading,
      headings: section.headings,
      content: section.content,
      chunkIndex,
      startLine: section.startLine,
      endLine: section.endLine,
      hash,
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
    };
  });
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function buildVaultChunks(vaultPath: string): Promise<SemanticChunk[]> {
  const pagesDir = path.join(vaultPath, PAGES_PREFIX);
  const entries = await fs.readdir(pagesDir, { withFileTypes: true }).catch(() => []);
  const notes: NoteForChunking[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLocaleLowerCase().endsWith(".md")) continue;
    const relativePath = `${PAGES_PREFIX}/${entry.name}`;
    const abs = path.join(vaultPath, relativePath);
    const [body, stats] = await Promise.all([
      fs.readFile(abs, "utf8"),
      fs.stat(abs),
    ]).catch(() => [null, null] as const);
    if (body === null || stats === null) continue;
    notes.push({
      path: relativePath.replace(/\\/g, "/"),
      title: extractTitle(body),
      body,
      updatedAt: stats.mtimeMs,
      createdAt: stats.birthtimeMs || stats.ctimeMs,
    });
  }
  notes.sort((a, b) => a.path.localeCompare(b.path));
  return notes.flatMap((note) => buildNoteChunks(note));
}

interface MarkdownSection {
  heading: string;
  headings: string[];
  content: string;
  startLine: number;
  endLine: number;
}

function splitMarkdownSections(note: NoteForChunking): MarkdownSection[] {
  const lines = note.body.split("\n");
  const sections: MarkdownSection[] = [];
  let currentStart = 1;
  let currentHeading = note.title;
  let currentHeadings: string[] = [];
  let inCodeBlock = false;

  const pushSection = (endLine: number): void => {
    const content = lines.slice(currentStart - 1, endLine).join("\n").trim();
    if (!content) return;
    sections.push({
      heading: currentHeading,
      headings: currentHeadings.length > 0 ? [...currentHeadings] : [note.title],
      content,
      startLine: currentStart,
      endLine,
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = new RegExp(`^(#{1,${MAX_HEADING_LEVEL}})\\s+(.+?)\\s*$`).exec(line);
    if (!match) continue;
    const lineNo = i + 1;
    if (lineNo > currentStart) {
      pushSection(lineNo - 1);
    }
    const level = match[1]!.length;
    const heading = match[2]!.trim();
    currentHeadings = [...currentHeadings.slice(0, level - 1), heading];
    currentHeading = heading || note.title;
    currentStart = lineNo;
  }

  pushSection(lines.length);
  if (sections.length === 0 && note.body.trim()) {
    return [{
      heading: note.title,
      headings: [note.title],
      content: note.body.trim(),
      startLine: 1,
      endLine: lines.length,
    }];
  }
  return sections;
}

function splitOversizedSection(section: MarkdownSection): MarkdownSection[] {
  if (section.content.length <= TARGET_CHUNK_CHARS) return [section];
  const out: MarkdownSection[] = [];
  let start = 0;
  while (start < section.content.length) {
    const end = Math.min(section.content.length, start + TARGET_CHUNK_CHARS);
    const content = section.content.slice(start, end).trim();
    if (content) {
      out.push({
        ...section,
        content,
      });
    }
    if (end >= section.content.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }
  return out;
}

async function embedChunks(
  chunks: SemanticChunk[],
  provider: EmbeddingProvider,
  onProgress?: (progress: SemanticIndexProgress) => void,
): Promise<number[][]> {
  const vectors: number[][] = [];
  const batchSize = 8;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(textForEmbedding);
    vectors.push(...await (provider.embedDocuments ? provider.embedDocuments(texts) : provider.embed(texts)));
    onProgress?.({ completed: Math.min(i + batch.length, chunks.length), total: chunks.length });
  }
  return vectors;
}

function textForEmbedding(chunk: SemanticChunk): string {
  return [
    `Title: ${chunk.title}`,
    chunk.headings.length > 0 ? `Headings: ${chunk.headings.join(" > ")}` : "",
    chunk.content,
  ].filter(Boolean).join("\n\n");
}

interface EmbeddingModelProfile {
  pooling: "mean" | "cls";
  queryPrefix: string;
  documentPrefix: string;
}

function embeddingModelProfile(modelId: string): EmbeddingModelProfile {
  const normalized = modelId.toLocaleLowerCase();
  if (normalized.includes("bge-m3")) {
    return { pooling: "cls", queryPrefix: "", documentPrefix: "" };
  }
  if (normalized.includes("multilingual-e5")) {
    return { pooling: "mean", queryPrefix: "query: ", documentPrefix: "passage: " };
  }
  if (normalized.includes("gte-multilingual")) {
    return { pooling: "cls", queryPrefix: "", documentPrefix: "" };
  }
  return { pooling: "mean", queryPrefix: "", documentPrefix: "" };
}

function bm25ScoresForQuery(query: string, chunks: SemanticChunk[]): number[] {
  const queryTerms = tokenizeForBm25(query);
  if (queryTerms.length === 0) return chunks.map(() => 0);

  const tokenizedDocs = chunks.map((chunk) => tokenizeForBm25(textForEmbedding(chunk)));
  const docFreq = new Map<string, number>();
  for (const terms of tokenizedDocs) {
    for (const term of new Set(terms)) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const avgDocLength = tokenizedDocs.reduce((sum, terms) => sum + terms.length, 0) / Math.max(1, tokenizedDocs.length);
  const queryTermSet = new Set(queryTerms);
  return tokenizedDocs.map((terms) => bm25Score(queryTermSet, terms, docFreq, chunks.length, avgDocLength));
}

function bm25Score(
  queryTerms: Set<string>,
  documentTerms: string[],
  docFreq: Map<string, number>,
  documentCount: number,
  avgDocLength: number,
): number {
  if (documentTerms.length === 0) return 0;
  const termFreq = new Map<string, number>();
  for (const term of documentTerms) {
    termFreq.set(term, (termFreq.get(term) ?? 0) + 1);
  }

  const k1 = 1.2;
  const b = 0.75;
  let score = 0;
  for (const term of queryTerms) {
    const tf = termFreq.get(term) ?? 0;
    if (tf === 0) continue;
    const df = docFreq.get(term) ?? 0;
    const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
    const denominator = tf + k1 * (1 - b + b * (documentTerms.length / Math.max(1, avgDocLength)));
    score += idf * ((tf * (k1 + 1)) / denominator);
  }
  return score;
}

function tokenizeForBm25(text: string): string[] {
  const tokens: string[] = [];
  const matches = text.toLocaleLowerCase().match(/[a-z0-9._-]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu) ?? [];
  for (const match of matches) {
    if (/^[a-z0-9._-]+$/.test(match)) {
      tokens.push(match);
      continue;
    }
    const chars = Array.from(match);
    if (chars.length === 1) {
      tokens.push(chars[0]!);
      continue;
    }
    for (let i = 0; i < chars.length - 1; i += 1) {
      tokens.push(`${chars[i]}${chars[i + 1]}`);
    }
  }
  return tokens;
}

function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 0);
  return scores.map((score) => (score - min) / (max - min));
}

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function titleHeadingBoost(chunk: SemanticChunk, queryLower: string): number {
  if (!queryLower) return 0;
  const title = chunk.title.toLocaleLowerCase();
  const heading = chunk.heading.toLocaleLowerCase();
  if (title.includes(queryLower)) return 1;
  if (heading.includes(queryLower)) return 0.75;
  return 0;
}

function buildSnippet(content: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > 220 ? `${text.slice(0, 220).trim()}...` : text;
}

async function readSemanticIndex(vaultPath: string): Promise<SemanticIndex> {
  const dir = path.join(vaultPath, SEMANTIC_DIR);
  const [manifestRaw, chunksRaw] = await Promise.all([
    fs.readFile(path.join(dir, MANIFEST_FILE), "utf8"),
    fs.readFile(path.join(dir, CHUNKS_FILE), "utf8"),
  ]);
  const manifest = JSON.parse(manifestRaw) as SemanticIndexManifest;
  const chunks = JSON.parse(chunksRaw) as SemanticChunk[];
  if (manifest.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported semantic index schema");
  const vectors = await readVectors(path.join(dir, VECTORS_FILE), manifest.dimension, chunks.length);
  return { manifest, chunks, vectors };
}

async function writeSemanticIndex(
  vaultPath: string,
  modelId: string,
  chunks: SemanticChunk[],
  vectors: number[][],
  previous: SemanticIndexManifest | undefined,
): Promise<SemanticIndexManifest> {
  const dimension = vectors.find((vector) => vector.length > 0)?.length ?? previous?.dimension ?? 0;
  const now = Date.now();
  const manifest: SemanticIndexManifest = {
    schemaVersion: SCHEMA_VERSION,
    modelId,
    dimension,
    chunkCount: chunks.length,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  const dir = path.join(vaultPath, SEMANTIC_DIR);
  await fs.mkdir(dir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(dir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(dir, CHUNKS_FILE), `${JSON.stringify(chunks, null, 2)}\n`, "utf8"),
    writeVectors(path.join(dir, VECTORS_FILE), vectors, dimension),
  ]);
  return manifest;
}

async function readVectors(filePath: string, dimension: number, count: number): Promise<number[][]> {
  if (dimension <= 0 || count === 0) return [];
  const buf = await fs.readFile(filePath);
  const expectedBytes = dimension * count * 4;
  if (buf.byteLength !== expectedBytes) throw new Error("Semantic vector index is corrupt");
  const vectors: number[][] = [];
  for (let row = 0; row < count; row += 1) {
    const vector: number[] = [];
    for (let col = 0; col < dimension; col += 1) {
      vector.push(buf.readFloatLE((row * dimension + col) * 4));
    }
    vectors.push(vector);
  }
  return vectors;
}

async function writeVectors(filePath: string, vectors: number[][], dimension: number): Promise<void> {
  const buf = Buffer.alloc(vectors.length * dimension * 4);
  for (const [row, vector] of vectors.entries()) {
    for (let col = 0; col < dimension; col += 1) {
      buf.writeFloatLE(vector[col] ?? 0, (row * dimension + col) * 4);
    }
  }
  await fs.writeFile(filePath, buf);
}

function stableChunkKey(chunk: Pick<SemanticChunk, "path" | "chunkIndex">): string {
  return `${chunk.path}\0${chunk.chunkIndex}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function tensorToVectors(output: unknown, expectedRows: number): number[][] {
  const tensor = output as {
    data?: ArrayLike<number>;
    dims?: number[];
    tolist?: () => unknown;
  };
  if (typeof tensor.tolist === "function") {
    return normalizeTensorList(tensor.tolist(), expectedRows);
  }
  if (!tensor.data || !tensor.dims || tensor.dims.length === 0) {
    throw new Error("Embedding provider returned an unsupported tensor");
  }
  const rows = tensor.dims.length === 1 ? 1 : tensor.dims[0] ?? expectedRows;
  const dimension = tensor.dims[tensor.dims.length - 1] ?? 0;
  const vectors: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const vector: number[] = [];
    for (let col = 0; col < dimension; col += 1) {
      vector.push(Number(tensor.data[row * dimension + col] ?? 0));
    }
    vectors.push(vector);
  }
  return vectors;
}

function normalizeTensorList(value: unknown, expectedRows: number): number[][] {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === "number")) {
    return [value.map(Number)];
  }
  if (expectedRows === 1 && Array.isArray(value[0]) && Array.isArray(value[0][0])) {
    return [(value[0] as unknown[]).map(Number)];
  }
  return value.map((row) => {
    if (!Array.isArray(row)) return [];
    if (row.every((item) => typeof item === "number")) return row.map(Number);
    if (Array.isArray(row[0])) return (row[0] as unknown[]).map(Number);
    return [];
  });
}
