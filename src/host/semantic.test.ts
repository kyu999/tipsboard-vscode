import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildNoteChunks,
  cosineSimilarity,
  semanticSearch,
  type EmbeddingProvider,
} from "./semantic.js";

const mockProvider: EmbeddingProvider = {
  modelId: "mock-embedding",
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const lower = text.toLocaleLowerCase();
      if (lower.includes("cache") || lower.includes("stale")) return [1, 0];
      if (lower.includes("retry") || lower.includes("backoff")) return [0, 1];
      return [0.25, 0.25];
    });
  },
};

describe("semantic host helpers", () => {
  it("splits notes by markdown headings and ignores fenced headings", () => {
    const chunks = buildNoteChunks({
      path: "pages/react.md",
      title: "React",
      body: [
        "React",
        "",
        "## Suspense",
        "Loading boundaries",
        "```",
        "## Not a heading",
        "```",
        "",
        "## Cache",
        "SWR and stale-while-revalidate",
      ].join("\n"),
      updatedAt: 1,
      createdAt: 1,
    });

    expect(chunks.map((chunk) => chunk.heading)).toEqual(["React", "Suspense", "Cache"]);
    expect(chunks[1]?.content).toContain("## Not a heading");
    expect(chunks[2]?.startLine).toBe(9);
  });

  it("splits notes by h4 and h5 headings", () => {
    const chunks = buildNoteChunks({
      path: "pages/deep.md",
      title: "Deep",
      body: [
        "Deep",
        "",
        "##### Intro",
        "Opening",
        "",
        "##### Details",
        "More text",
      ].join("\n"),
      updatedAt: 1,
      createdAt: 1,
    });

    expect(chunks.map((chunk) => chunk.heading)).toEqual(["Deep", "Intro", "Details"]);
  });

  it("calculates cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 1], [1, 1])).toBeCloseTo(1);
  });

  it("builds a local index and searches chunks by vector similarity", async () => {
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "tipsboard-semantic-"));
    await fs.mkdir(path.join(vaultPath, "pages"), { recursive: true });
    await fs.writeFile(
      path.join(vaultPath, "pages", "api.md"),
      ["API Notes", "", "## Cache", "Prevent stale responses with cache invalidation."].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(vaultPath, "pages", "retry.md"),
      ["Retry Notes", "", "## Backoff", "Retry requests with exponential backoff."].join("\n"),
      "utf8",
    );

    const response = await semanticSearch(vaultPath, "stale response", mockProvider);

    expect(response.indexedChunkCount).toBeGreaterThan(0);
    expect(response.results[0]?.path).toBe("pages/api.md");
    expect(response.results[0]?.heading).toBe("Cache");
    await expect(fs.stat(path.join(vaultPath, ".tipsboard", "semantic", "manifest.json"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(vaultPath, ".tipsboard", "semantic", "vectors.f32"))).resolves.toBeTruthy();
  });

  it("recursively indexes workspace markdown and includes path context in document embeddings", async () => {
    const embeddedDocuments: string[] = [];
    const provider: EmbeddingProvider = {
      modelId: "capture-embedding",
      async embed(texts: string[]): Promise<number[][]> {
        return texts.map(() => [1, 0]);
      },
      async embedDocuments(texts: string[]): Promise<number[][]> {
        embeddedDocuments.push(...texts);
        return texts.map(() => [1, 0]);
      },
      async embedQuery(): Promise<number[]> {
        return [1, 0];
      },
    };
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "tipsboard-semantic-path-"));
    await fs.mkdir(path.join(vaultPath, "docs", "auth"), { recursive: true });
    await fs.mkdir(path.join(vaultPath, ".tipsboard"), { recursive: true });
    await fs.writeFile(
      path.join(vaultPath, "docs", "auth", "oauth.md"),
      ["OAuth", "", "Token exchange notes"].join("\n"),
      "utf8",
    );
    await fs.writeFile(path.join(vaultPath, ".tipsboard", "ignored.md"), "Ignored\n", "utf8");

    const response = await semanticSearch(vaultPath, "oauth", provider);

    expect(response.results.map((result) => result.path)).toEqual(["docs/auth/oauth.md"]);
    expect(embeddedDocuments.some((text) => text.includes("Path: docs > auth > oauth"))).toBe(true);
    expect(embeddedDocuments.every((text) => !text.includes("Ignored"))).toBe(true);
  });

  it("uses hybrid lexical ranking by default", async () => {
    const flatProvider: EmbeddingProvider = {
      modelId: "flat-embedding",
      async embed(texts: string[]): Promise<number[][]> {
        return texts.map(() => [1, 0]);
      },
    };
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "tipsboard-semantic-hybrid-"));
    await fs.mkdir(path.join(vaultPath, "pages"), { recursive: true });
    await fs.writeFile(
      path.join(vaultPath, "pages", "generic.md"),
      ["Generic Notes", "", "This page talks about generic observability concepts."].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(vaultPath, "pages", "otel.md"),
      ["OpenTelemetry Notes", "", "OpenTelemetry traces connect services across distributed systems."].join("\n"),
      "utf8",
    );

    const response = await semanticSearch(vaultPath, "OpenTelemetry", flatProvider);

    expect(response.results[0]?.path).toBe("pages/otel.md");
  });

  it("reranks exact title matches above body-only phrase matches", async () => {
    const flatProvider: EmbeddingProvider = {
      modelId: "flat-embedding",
      async embed(texts: string[]): Promise<number[][]> {
        return texts.map(() => [1, 0]);
      },
    };
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "tipsboard-semantic-rerank-title-"));
    await fs.mkdir(path.join(vaultPath, "pages"), { recursive: true });
    await fs.writeFile(
      path.join(vaultPath, "pages", "title.md"),
      ["OpenTelemetry", "", "Short note."].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(vaultPath, "pages", "body.md"),
      ["Tracing Notes", "", "OpenTelemetry appears in this body text."].join("\n"),
      "utf8",
    );

    const response = await semanticSearch(vaultPath, "OpenTelemetry", flatProvider, {
      denseWeight: 0,
      bm25Weight: 0,
    });

    expect(response.results[0]?.path).toBe("pages/title.md");
  });

  it("penalizes repeated chunks from the same note during reranking", async () => {
    const flatProvider: EmbeddingProvider = {
      modelId: "flat-embedding",
      async embed(texts: string[]): Promise<number[][]> {
        return texts.map(() => [1, 0]);
      },
    };
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "tipsboard-semantic-rerank-note-"));
    await fs.mkdir(path.join(vaultPath, "pages"), { recursive: true });
    await fs.writeFile(
      path.join(vaultPath, "pages", "alpha.md"),
      ["Alpha", "", "## Cache One", "cache", "", "## Cache Two", "cache"].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(vaultPath, "pages", "beta.md"),
      ["Beta", "", "## Cache Alternative", "cache"].join("\n"),
      "utf8",
    );

    const response = await semanticSearch(vaultPath, "cache", flatProvider, {
      limit: 2,
      denseWeight: 0,
      bm25Weight: 0,
    });

    expect(new Set(response.results.map((result) => result.path))).toEqual(new Set(["pages/alpha.md", "pages/beta.md"]));
  });

  it("uses recency as a lightweight reranking signal", async () => {
    const flatProvider: EmbeddingProvider = {
      modelId: "flat-embedding",
      async embed(texts: string[]): Promise<number[][]> {
        return texts.map(() => [1, 0]);
      },
    };
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "tipsboard-semantic-rerank-recency-"));
    await fs.mkdir(path.join(vaultPath, "pages"), { recursive: true });
    const oldPath = path.join(vaultPath, "pages", "old.md");
    const newPath = path.join(vaultPath, "pages", "new.md");
    await fs.writeFile(oldPath, ["Old", "", "General note."].join("\n"), "utf8");
    await fs.writeFile(newPath, ["New", "", "General note."].join("\n"), "utf8");
    await fs.utimes(oldPath, new Date("2024-01-01T00:00:00Z"), new Date("2024-01-01T00:00:00Z"));
    await fs.utimes(newPath, new Date("2025-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"));

    const response = await semanticSearch(vaultPath, "unmatched", flatProvider, {
      denseWeight: 0,
      bm25Weight: 0,
    });

    expect(response.results[0]?.path).toBe("pages/new.md");
  });
});
