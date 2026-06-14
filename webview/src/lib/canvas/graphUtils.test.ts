import { describe, expect, it } from "vitest";
import type { CanvasDocument } from "@/types";
import {
  addChildProblem,
  buildCanvasGraphIndex,
  computeNodeLinkDegrees,
  connectExistingNode,
  getBecauseParents,
  getRootProblemIds,
  getSolutionChildren,
  isLeafProblem,
  isProblemSolutionCovered,
  isValidConnection,
  problemHasAcceptedSolution,
  problemHasSolution,
  problemNeedsSolution,
  addChildSolution,
} from "./graphUtils";
import { computeGraphLayout } from "./graphLayout";
import { buildOutlineForest, flattenOutlineNodes } from "./outlineTree";

const doc: CanvasDocument = {
  version: 1,
  nodes: [
    { id: "p1", type: "problem", title: "売上が低い" },
    { id: "p2", type: "problem", title: "新規顧客が少ない" },
    { id: "p3", type: "problem", title: "会員登録率が低い" },
    { id: "p4", type: "problem", title: "SEOが弱い" },
    { id: "s1", type: "solution", title: "記事を増やす", decision: "accepted" },
  ],
  edges: [
    { id: "e1", from: "p1", to: "p2", type: "because" },
    { id: "e2", from: "p3", to: "p2", type: "because" },
    { id: "e3", from: "p2", to: "p4", type: "because" },
    { id: "e4", from: "p4", to: "s1", type: "solved_by" },
  ],
};

describe("graphUtils", () => {
  it("finds root problems", () => {
    const index = buildCanvasGraphIndex(doc);
    expect(getRootProblemIds(index).sort()).toEqual(["p1", "p3"]);
  });

  it("counts incident links per node", () => {
    const degrees = computeNodeLinkDegrees(doc);
    expect(degrees.get("p2")).toBe(3);
    expect(degrees.get("p4")).toBe(2);
    expect(degrees.get("p1")).toBe(1);
  });

  it("lists parents and solution children", () => {
    const index = buildCanvasGraphIndex(doc);
    expect(getBecauseParents(index, "p2").map((n) => n.id).sort()).toEqual(["p1", "p3"]);
    expect(getSolutionChildren(index, "p4").map((n) => n.id)).toEqual(["s1"]);
    expect(problemHasAcceptedSolution(index, "p4")).toBe(true);
    expect(problemHasAcceptedSolution(index, "p1")).toBe(false);
    expect(problemHasAcceptedSolution(index, "p2")).toBe(false);
  });

  it("requires solution on leaf problems for coverage", () => {
    const withoutDecision: CanvasDocument = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === "s1" ? { ...n, decision: undefined } : n)),
    };
    const index = buildCanvasGraphIndex(withoutDecision);
    expect(isProblemSolutionCovered(index, "p4")).toBe(true);
    expect(problemNeedsSolution(index, "p1")).toBe(false);
  });

  it("requires solutions only on leaf problems and rolls up coverage", () => {
    const index = buildCanvasGraphIndex(doc);
    expect(isLeafProblem(index, "p4")).toBe(true);
    expect(isLeafProblem(index, "p2")).toBe(false);
    expect(isLeafProblem(index, "p3")).toBe(false);
    expect(isProblemSolutionCovered(index, "p4")).toBe(true);
    expect(isProblemSolutionCovered(index, "p2")).toBe(true);
    expect(isProblemSolutionCovered(index, "p1")).toBe(true);
    expect(isProblemSolutionCovered(index, "p3")).toBe(true);
    expect(problemNeedsSolution(index, "p1")).toBe(false);
    expect(problemNeedsSolution(index, "p3")).toBe(false);

    const gap: CanvasDocument = {
      version: 1,
      nodes: [
        { id: "root", type: "problem", title: "Root" },
        { id: "leaf", type: "problem", title: "Leaf" },
      ],
      edges: [{ id: "e1", from: "root", to: "leaf", type: "because" }],
    };
    const gapIndex = buildCanvasGraphIndex(gap);
    expect(problemNeedsSolution(gapIndex, "root")).toBe(true);
    expect(problemNeedsSolution(gapIndex, "leaf")).toBe(true);
  });

  it("rejects solved_by links from non-leaf problems", () => {
    const withExtraSolution: CanvasDocument = {
      ...doc,
      nodes: [...doc.nodes, { id: "s2", type: "solution", title: "別案" }],
    };
    expect(isValidConnection(withExtraSolution, "p2", "s2", "solved_by")).toBe(false);
    expect(isValidConnection(withExtraSolution, "p4", "s2", "solved_by")).toBe(true);
  });

  it("does not add solution child on non-leaf problems", () => {
    const index = buildCanvasGraphIndex(doc);
    expect(isLeafProblem(index, "p2")).toBe(false);
    const next = addChildSolution(doc, "p2", "invalid");
    expect(next.nodes).toHaveLength(doc.nodes.length);
    expect(next.edges).toHaveLength(doc.edges.length);
  });

  it("adds child problem and connects existing node", () => {
    let next = addChildProblem(doc, "p4", "記事数が少ない");
    const child = next.nodes.find((n) => n.title === "記事数が少ない");
    expect(child?.type).toBe("problem");
    next = connectExistingNode(next, "p1", "p2", "because");
    expect(next.edges.filter((e) => e.from === "p1" && e.to === "p2")).toHaveLength(1);
  });

  it("rejects because links that would create a cycle", () => {
    const cyclic = connectExistingNode(doc, "p2", "p1", "because");
    expect(isValidConnection(doc, "p2", "p1", "because")).toBe(false);
    expect(isValidConnection(cyclic, "p1", "p2", "because")).toBe(false);
    expect(isValidConnection(doc, "p1", "p4", "because")).toBe(true);
  });
});

describe("outlineTree", () => {
  it("deduplicates shared nodes in forest", () => {
    const index = buildCanvasGraphIndex(doc);
    const roots = getRootProblemIds(index);
    const forest = buildOutlineForest(index, roots);
    const flat = flattenOutlineNodes(forest);
    expect(flat.filter((id) => id === "p2")).toHaveLength(1);
  });

  it("includes solutions under problems", () => {
    const index = buildCanvasGraphIndex(doc);
    const forest = buildOutlineForest(index, ["p1"]);
    const p4 = forest[0]?.children.find((c) => c.nodeId === "p2")?.children.find((c) => c.nodeId === "p4");
    expect(p4?.children.some((c) => c.nodeId === "s1" && c.kind === "solved_by")).toBe(true);
  });
});
