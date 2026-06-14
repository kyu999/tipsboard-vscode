export type CanvasNodeType = "problem" | "solution";
export type CanvasEdgeType = "because" | "solved_by";

export type CanvasProblemStatus =
  | "open"
  | "needs_deeper_analysis"
  | "root_cause_candidate"
  | "covered";

export type CanvasSolutionDecision =
  | "undecided"
  | "accepted"
  | "rejected"
  | "deferred"
  | "experiment";

export type CanvasRatingLevel = "low" | "medium" | "high";

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  title: string;
  description?: string;
  status?: CanvasProblemStatus;
  decision?: CanvasSolutionDecision;
  impact?: CanvasRatingLevel;
  effort?: CanvasRatingLevel;
  confidence?: CanvasRatingLevel;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  type: CanvasEdgeType;
}

export interface CanvasDocument {
  version: 1;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasSummary {
  relativePath: string;
  name: string;
  updatedAt: number;
}

export interface CanvasParseError {
  line: number;
  message: string;
}

export interface CanvasParseWarning {
  line?: number;
  message: string;
}

export interface CanvasLoadResult {
  document: CanvasDocument;
  warnings: CanvasParseWarning[];
  errors: CanvasParseError[];
}

export const CANVAS_MERMAID_HEADER = "%% tipsboard-canvas-version: 1";

export const DEFAULT_PROBLEM_STATUS: CanvasProblemStatus = "open";
export const DEFAULT_SOLUTION_DECISION: CanvasSolutionDecision = "accepted";

export function emptyCanvasDocument(): CanvasDocument {
  return { version: 1, nodes: [], edges: [] };
}
