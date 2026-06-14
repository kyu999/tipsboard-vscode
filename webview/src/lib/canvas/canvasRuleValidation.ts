import type { CanvasDocument } from "@/types";
import {
  buildCanvasGraphIndex,
  isLeafProblem,
  problemNeedsSolution,
} from "./graphUtils";

export type CanvasRuleViolationKind = "solution_on_non_leaf" | "uncovered_problem";

export interface CanvasRuleViolation {
  kind: CanvasRuleViolationKind;
  nodeId: string;
  /** Invalid solved_by edge ids (solution_on_non_leaf only). */
  edgeIds?: string[];
  /** Number of invalid solved_by edges (solution_on_non_leaf only). */
  solutionCount?: number;
}

/**
 * Detects Tipsboard canvas structural rule violations in a loaded document.
 * The UI still renders using rule-aware layout; these are advisory for external edits.
 */
export function validateCanvasRules(doc: CanvasDocument): CanvasRuleViolation[] {
  const index = buildCanvasGraphIndex(doc);
  const violations: CanvasRuleViolation[] = [];

  const nonLeafSolutionEdges = new Map<string, string[]>();
  for (const edge of doc.edges) {
    if (edge.type !== "solved_by") continue;
    const from = index.nodeById.get(edge.from);
    if (from?.type !== "problem") continue;
    if (isLeafProblem(index, edge.from)) continue;
    const list = nonLeafSolutionEdges.get(edge.from) ?? [];
    list.push(edge.id);
    nonLeafSolutionEdges.set(edge.from, list);
  }

  for (const [nodeId, edgeIds] of nonLeafSolutionEdges) {
    violations.push({
      kind: "solution_on_non_leaf",
      nodeId,
      edgeIds,
      solutionCount: edgeIds.length,
    });
  }

  for (const node of doc.nodes) {
    if (node.type !== "problem") continue;
    if (!problemNeedsSolution(index, node.id)) continue;
    violations.push({ kind: "uncovered_problem", nodeId: node.id });
  }

  violations.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    const titleA = index.nodeById.get(a.nodeId)?.title ?? a.nodeId;
    const titleB = index.nodeById.get(b.nodeId)?.title ?? b.nodeId;
    return titleA.localeCompare(titleB);
  });

  return violations;
}
