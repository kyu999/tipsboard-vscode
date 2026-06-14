import { describe, expect, it } from "vitest";
import type { CanvasDocument } from "@/types";
import { validateCanvasRules } from "./canvasRuleValidation";

describe("validateCanvasRules", () => {
  it("flags solved_by on non-leaf problems", () => {
    const doc: CanvasDocument = {
      version: 1,
      nodes: [
        { id: "root", type: "problem", title: "Root" },
        { id: "leaf", type: "problem", title: "Leaf" },
        { id: "s1", type: "solution", title: "Fix root" },
        { id: "s2", type: "solution", title: "Fix leaf" },
      ],
      edges: [
        { id: "e1", from: "root", to: "leaf", type: "because" },
        { id: "e2", from: "root", to: "s1", type: "solved_by" },
        { id: "e3", from: "leaf", to: "s2", type: "solved_by" },
      ],
    };
    const violations = validateCanvasRules(doc);
    expect(violations.some((v) => v.kind === "solution_on_non_leaf" && v.nodeId === "root")).toBe(true);
    expect(violations.some((v) => v.kind === "solution_on_non_leaf" && v.nodeId === "leaf")).toBe(false);
    expect(violations.find((v) => v.nodeId === "root")?.solutionCount).toBe(1);
  });

  it("flags uncovered leaf problems", () => {
    const doc: CanvasDocument = {
      version: 1,
      nodes: [
        { id: "root", type: "problem", title: "Root" },
        { id: "leaf", type: "problem", title: "Leaf" },
      ],
      edges: [{ id: "e1", from: "root", to: "leaf", type: "because" }],
    };
    const violations = validateCanvasRules(doc);
    expect(violations.filter((v) => v.kind === "uncovered_problem").map((v) => v.nodeId).sort()).toEqual([
      "leaf",
      "root",
    ]);
  });

  it("does not flag parent when only leaf needs solution but child is covered", () => {
    const doc: CanvasDocument = {
      version: 1,
      nodes: [
        { id: "symptom", type: "problem", title: "Symptom" },
        { id: "cause", type: "problem", title: "Cause" },
        { id: "s1", type: "solution", title: "Fix", decision: "accepted" },
      ],
      edges: [
        { id: "e1", from: "symptom", to: "cause", type: "because" },
        { id: "e2", from: "cause", to: "s1", type: "solved_by" },
      ],
    };
    expect(validateCanvasRules(doc)).toEqual([]);
  });

  it("flags external-ai style graph with solutions on non-leaf problems", () => {
    const doc: CanvasDocument = {
      version: 1,
      nodes: [
        { id: "p_top", type: "problem", title: "Top" },
        { id: "p_mid", type: "problem", title: "Mid" },
        { id: "p_leaf", type: "problem", title: "Leaf" },
        { id: "s_top", type: "solution", title: "Top fix" },
        { id: "s_leaf", type: "solution", title: "Leaf fix", decision: "accepted" },
      ],
      edges: [
        { id: "e1", from: "p_top", to: "p_mid", type: "because" },
        { id: "e2", from: "p_mid", to: "p_leaf", type: "because" },
        { id: "e3", from: "p_top", to: "s_top", type: "solved_by" },
        { id: "e4", from: "p_leaf", to: "s_leaf", type: "solved_by" },
      ],
    };
    const violations = validateCanvasRules(doc);
    const nonLeaf = violations.filter((v) => v.kind === "solution_on_non_leaf");
    expect(nonLeaf.map((v) => v.nodeId)).toEqual(["p_top"]);
    expect(nonLeaf[0]?.edgeIds).toEqual(["e3"]);
    expect(violations.some((v) => v.kind === "uncovered_problem")).toBe(false);
  });

  it("passes when only leaf problems have solutions and tree is covered", () => {
    const doc: CanvasDocument = {
      version: 1,
      nodes: [
        { id: "root", type: "problem", title: "Root" },
        { id: "leaf", type: "problem", title: "Leaf" },
        { id: "s1", type: "solution", title: "Fix", decision: "accepted" },
      ],
      edges: [
        { id: "e1", from: "root", to: "leaf", type: "because" },
        { id: "e2", from: "leaf", to: "s1", type: "solved_by" },
      ],
    };
    expect(validateCanvasRules(doc)).toEqual([]);
  });
});
