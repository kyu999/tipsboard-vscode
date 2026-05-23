import { describe, expect, it } from "vitest";

import { SEMANTIC_EVAL_DATASETS, type SemanticEvalDataset } from "./datasets.js";
import { applySemanticEvalFetchLimits, cacheSatisfiesFetchLimits } from "./fetchLimits.js";

describe("applySemanticEvalFetchLimits", () => {
  const base: SemanticEvalDataset = {
    definition: SEMANTIC_EVAL_DATASETS["beir-scifact"],
    documents: [
      { id: "d1", title: "A", text: "one" },
      { id: "d2", title: "B", text: "two" },
      { id: "d3", title: "C", text: "three" },
    ],
    queries: [
      { id: "q1", text: "q1", relevant: { d1: 1 } },
      { id: "q2", text: "q2", relevant: { d2: 1, d3: 1 } },
      { id: "q3", text: "q3", relevant: { d99: 1 } },
    ],
  };

  it("trims documents and queries from a larger cache", () => {
    const applied = applySemanticEvalFetchLimits(base, { maxDocuments: 1, maxQueries: 1 });
    expect(applied.documents.map((doc) => doc.id)).toEqual(["d1"]);
    expect(applied.queries.map((query) => query.id)).toEqual(["q1"]);
  });

  it("drops queries whose relevant docs are outside the document subset", () => {
    const applied = applySemanticEvalFetchLimits(base, { maxDocuments: 2 });
    expect(applied.queries.map((query) => query.id)).toEqual(["q1"]);
  });
});

describe("cacheSatisfiesFetchLimits", () => {
  it("requires a larger cache when limits increase", () => {
    const small = { documents: [{ id: "d1", title: "", text: "" }], queries: [{ id: "q1", text: "", relevant: { d1: 1 } }] };
    expect(cacheSatisfiesFetchLimits(small, { maxDocuments: 500 })).toBe(false);
    expect(cacheSatisfiesFetchLimits(small, { maxDocuments: 1 })).toBe(true);
  });
});
