import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { extractTitle } from "./vault.js";

const PAGES_PREFIX = "pages";
const SEMANTIC_DIR = ".tipsboard/semantic";
const MANIFEST_FILE = "manifest.json";
const CHUNKS_FILE = "chunks.json";
const VECTORS_FILE = "vectors.f32";
const SCHEMA_VERSION = 1;
const DEFAULT_MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const TARGET_CHUNK_CHARS = 1600;
const CHUNK_OVERLAP_CHARS = 200;
const MAX_RESULTS = 20;

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
}

interface SemanticIndex {
  manifest: SemanticIndexManifest;
  chunks: SemanticChunk[];
  vectors: number[][];
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
}

function loadTransformersModule(resolverBasePath: string): {
  env?: { cacheDir?: string };
  pipeline: (...args: unknown[]) => Promise<unknown>;
} {
  const require = createRequire(resolverBasePath);
  return require("@huggingface/transformers") as {
    env?: { cacheDir?: string };
    pipeline: (...args: unknown[]) => Promise<unknown>;
  };
}

export function createTransformersEmbeddingProvider(
  cacheDir: string,
  resolverBasePath: string,
  modelId: string = DEFAULT_MODEL_ID,
): EmbeddingProvider {
  let pipelinePromise: Promise<unknown> | undefined;

  async function getPipeline(): Promise<unknown> {
    pipelinePromise ??= (async () => {
      const mod = loadTransformersModule(resolverBasePath);
      if (mod.env) mod.env.cacheDir = cacheDir;
      return mod.pipeline("feature-extraction", modelId, { dtype: "q8" });
    })();
    return pipelinePromise;
  }

  return {
    modelId,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const pipe = (await getPipeline()) as (input: string | string[], options?: unknown) => Promise<unknown>;
      const output = await pipe(texts, { pooling: "mean", normalize: true });
      return tensorToVectors(output, texts.length);
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

  const index = await ensureSemanticIndex(vaultPath, provider);
  const [queryVector] = await provider.embed([trimmed]);
  if (!queryVector) {
    return { results: [], indexedChunkCount: index.chunks.length, modelId: provider.modelId };
  }

  const queryLower = trimmed.toLocaleLowerCase();
  const scored = index.chunks.map((chunk, i) => {
    const semanticScore = cosineSimilarity(queryVector, index.vectors[i] ?? []);
    const boost = titleHeadingBoost(chunk, queryLower);
    return {
      chunk,
      score: semanticScore * 0.85 + boost * 0.15,
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

export async function rebuildSemanticIndex(vaultPath: string, provider: EmbeddingProvider): Promise<SemanticIndexManifest> {
  const chunks = await buildVaultChunks(vaultPath);
  const vectors = await embedChunks(chunks, provider);
  const manifest = await writeSemanticIndex(vaultPath, provider.modelId, chunks, vectors, undefined);
  return manifest;
}

export async function ensureSemanticIndex(vaultPath: string, provider: EmbeddingProvider): Promise<SemanticIndex> {
  const chunks = await buildVaultChunks(vaultPath);
  const existing = await readSemanticIndex(vaultPath).catch(() => null);
  if (
    existing &&
    existing.manifest.modelId === provider.modelId &&
    existing.chunks.length === chunks.length &&
    existing.chunks.every((chunk, i) => chunk.hash === chunks[i]?.hash && chunk.path === chunks[i]?.path)
  ) {
    return existing;
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

  const embedded = await embedChunks(pending.map((entry) => entry.chunk), provider);
  for (const [i, entry] of pending.entries()) {
    vectors[entry.index] = embedded[i] ?? [];
  }

  const manifest = await writeSemanticIndex(vaultPath, provider.modelId, chunks, vectors, existing?.manifest);
  return { manifest, chunks, vectors };
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
    const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
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

async function embedChunks(chunks: SemanticChunk[], provider: EmbeddingProvider): Promise<number[][]> {
  const vectors: number[][] = [];
  const batchSize = 8;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    vectors.push(...await provider.embed(batch.map(textForEmbedding)));
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
