import { randomUUID } from "node:crypto";
import {
  CANVAS_MERMAID_HEADER,
  DEFAULT_PROBLEM_STATUS,
  DEFAULT_SOLUTION_DECISION,
  emptyCanvasDocument,
  type CanvasDocument,
  type CanvasEdge,
  type CanvasEdgeType,
  type CanvasLoadResult,
  type CanvasNode,
  type CanvasNodeType,
  type CanvasParseError,
  type CanvasParseWarning,
  type CanvasProblemStatus,
  type CanvasRatingLevel,
  type CanvasSolutionDecision,
} from "./canvasTypes.js";

const NODE_META_RE = /^%%\s*node:([^\s]+)\s+(problem|solution)\s*$/;
const DESC_META_RE = /^%%\s*description:(.*)$/;
const STATUS_META_RE = /^%%\s*status:(.+)$/;
const DECISION_META_RE = /^%%\s*decision:(.+)$/;
const IMPACT_META_RE = /^%%\s*impact:(.+)$/;
const EFFORT_META_RE = /^%%\s*effort:(.+)$/;
const CONFIDENCE_META_RE = /^%%\s*confidence:(.+)$/;
const FLOWCHART_RE = /^flowchart\s+(TD|LR|BT|RL)\s*$/i;
const NODE_DECL_RE = /^([A-Za-z_][\w-]*)\s*\[\s*"((?:[^"\\]|\\.)*)"\s*\]\s*$/;
const EDGE_RE =
  /^([A-Za-z_][\w-]*)\s*-->\s*\|\s*(because|solved_by)\s*\|\s*([A-Za-z_][\w-]*)$/;

const PROBLEM_STATUSES = new Set<CanvasProblemStatus>([
  "open",
  "needs_deeper_analysis",
  "root_cause_candidate",
  "covered",
]);

const SOLUTION_DECISIONS = new Set<CanvasSolutionDecision>([
  "undecided",
  "accepted",
  "rejected",
  "deferred",
  "experiment",
]);

const RATING_LEVELS = new Set<CanvasRatingLevel>(["low", "medium", "high"]);

function unescapeMermaidString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function escapeMermaidString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export const LEGACY_CANVAS_UNSUPPORTED_MESSAGE =
  "Legacy canvas format (v0.3.12 and earlier) is not supported in v0.4.0+";

function isLegacyJsonCanvas(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith('"version"');
}

export function isCanvasMermaidFile(text: string): boolean {
  if (isLegacyJsonCanvas(text)) return false;
  return text.includes(CANVAS_MERMAID_HEADER);
}

export function emptyCanvasMermaidTemplate(): string {
  return `${CANVAS_MERMAID_HEADER}\nflowchart TD\n`;
}

interface ParseState {
  nodes: Map<string, CanvasNode>;
  edges: CanvasEdge[];
  errors: CanvasParseError[];
  warnings: CanvasParseWarning[];
  pendingNodeId: string | null;
}

function addError(state: ParseState, line: number, message: string): void {
  state.errors.push({ line, message });
}

function addWarning(state: ParseState, line: number, message: string): void {
  state.warnings.push({ line, message });
}

function flushPendingDescription(state: ParseState, description: string): void {
  if (!state.pendingNodeId) return;
  const node = state.nodes.get(state.pendingNodeId);
  if (node) {
    node.description = description.trim();
  }
  state.pendingNodeId = null;
}

function normalizeNode(node: CanvasNode): CanvasNode {
  if (node.type === "problem") {
    const status = node.status && PROBLEM_STATUSES.has(node.status) ? node.status : DEFAULT_PROBLEM_STATUS;
    return {
      id: node.id,
      type: "problem",
      title: node.title,
      ...(node.description?.trim() ? { description: node.description.trim() } : {}),
      status,
    };
  }
  const raw =
    node.decision && SOLUTION_DECISIONS.has(node.decision) ? node.decision : DEFAULT_SOLUTION_DECISION;
  const decision = raw === "undecided" ? "accepted" : raw;
  return {
    id: node.id,
    type: "solution",
    title: node.title,
    ...(node.description?.trim() ? { description: node.description.trim() } : {}),
    decision,
    ...(node.impact && RATING_LEVELS.has(node.impact) ? { impact: node.impact } : {}),
    ...(node.effort && RATING_LEVELS.has(node.effort) ? { effort: node.effort } : {}),
    ...(node.confidence && RATING_LEVELS.has(node.confidence) ? { confidence: node.confidence } : {}),
  };
}

function applyNodeMeta(state: ParseState, lineNo: number, line: string): boolean {
  if (!state.pendingNodeId) return false;
  const node = state.nodes.get(state.pendingNodeId);
  if (!node) return false;

  const statusMatch = STATUS_META_RE.exec(line);
  if (statusMatch) {
    if (node.type !== "problem") {
      addWarning(state, lineNo, `Status metadata on non-problem node "${node.id}"`);
      return true;
    }
    const value = (statusMatch[1] ?? "").trim() as CanvasProblemStatus;
    if (PROBLEM_STATUSES.has(value)) node.status = value;
    else addWarning(state, lineNo, `Unknown status "${value}" on node "${node.id}"`);
    return true;
  }

  const decisionMatch = DECISION_META_RE.exec(line);
  if (decisionMatch) {
    if (node.type !== "solution") {
      addWarning(state, lineNo, `Decision metadata on non-solution node "${node.id}"`);
      return true;
    }
    const value = (decisionMatch[1] ?? "").trim() as CanvasSolutionDecision;
    if (SOLUTION_DECISIONS.has(value)) node.decision = value;
    else addWarning(state, lineNo, `Unknown decision "${value}" on node "${node.id}"`);
    return true;
  }

  const impactMatch = IMPACT_META_RE.exec(line);
  if (impactMatch) {
    if (node.type !== "solution") return true;
    const value = (impactMatch[1] ?? "").trim() as CanvasRatingLevel;
    if (RATING_LEVELS.has(value)) node.impact = value;
    return true;
  }

  const effortMatch = EFFORT_META_RE.exec(line);
  if (effortMatch) {
    if (node.type !== "solution") return true;
    const value = (effortMatch[1] ?? "").trim() as CanvasRatingLevel;
    if (RATING_LEVELS.has(value)) node.effort = value;
    return true;
  }

  const confidenceMatch = CONFIDENCE_META_RE.exec(line);
  if (confidenceMatch) {
    if (node.type !== "solution") return true;
    const value = (confidenceMatch[1] ?? "").trim() as CanvasRatingLevel;
    if (RATING_LEVELS.has(value)) node.confidence = value;
    return true;
  }

  return false;
}

export function parseCanvasMermaid(text: string): CanvasLoadResult {
  if (isLegacyJsonCanvas(text)) {
    return {
      document: emptyCanvasDocument(),
      warnings: [],
      errors: [{ line: 1, message: LEGACY_CANVAS_UNSUPPORTED_MESSAGE }],
    };
  }

  const state: ParseState = {
    nodes: new Map(),
    edges: [],
    errors: [],
    warnings: [],
    pendingNodeId: null,
  };

  let hasHeader = false;
  let hasFlowchart = false;
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const raw = lines[i] ?? "";
    const line = raw.trim();
    if (!line) continue;

    if (line === CANVAS_MERMAID_HEADER) {
      hasHeader = true;
      continue;
    }

    const nodeMeta = NODE_META_RE.exec(line);
    if (nodeMeta) {
      flushPendingDescription(state, "");
      const id = nodeMeta[1] ?? "";
      const type = nodeMeta[2] as CanvasNodeType;
      if (state.nodes.has(id)) {
        addWarning(state, lineNo, `Duplicate node id "${id}"; metadata overwritten`);
      }
      const existing = state.nodes.get(id);
      state.nodes.set(id, {
        id,
        type,
        title: existing?.title ?? "",
        description: existing?.description,
        status: existing?.status,
        decision: existing?.decision,
        impact: existing?.impact,
        effort: existing?.effort,
        confidence: existing?.confidence,
      });
      state.pendingNodeId = id;
      continue;
    }

    const descMeta = DESC_META_RE.exec(line);
    if (descMeta) {
      if (!state.pendingNodeId) {
        addWarning(state, lineNo, "Description without preceding node metadata");
        continue;
      }
      flushPendingDescription(state, descMeta[1] ?? "");
      continue;
    }

    if (applyNodeMeta(state, lineNo, line)) continue;

    if (line.startsWith("%%")) {
      continue;
    }

    if (FLOWCHART_RE.test(line)) {
      hasFlowchart = true;
      continue;
    }

    const nodeDecl = NODE_DECL_RE.exec(line);
    if (nodeDecl) {
      flushPendingDescription(state, "");
      const id = nodeDecl[1] ?? "";
      const title = unescapeMermaidString(nodeDecl[2] ?? "");
      const existing = state.nodes.get(id);
      if (existing) {
        existing.title = title;
      } else {
        addWarning(state, lineNo, `Node "${id}" declared without metadata; defaulting to problem`);
        state.nodes.set(id, { id, type: "problem", title });
      }
      continue;
    }

    const edgeMatch = EDGE_RE.exec(line);
    if (edgeMatch) {
      flushPendingDescription(state, "");
      const from = edgeMatch[1] ?? "";
      const type = edgeMatch[2] as CanvasEdgeType;
      const to = edgeMatch[3] ?? "";
      if (!state.nodes.has(from)) {
        addError(state, lineNo, `Edge references unknown node "${from}"`);
        continue;
      }
      if (!state.nodes.has(to)) {
        addError(state, lineNo, `Edge references unknown node "${to}"`);
        continue;
      }
      state.edges.push({ id: `e_${from}_${to}_${type}`, from, to, type });
      continue;
    }

    addWarning(state, lineNo, `Unrecognized line: ${line}`);
  }

  flushPendingDescription(state, "");

  if (!hasHeader) {
    state.errors.push({ line: 1, message: `Missing header: ${CANVAS_MERMAID_HEADER}` });
  }
  if (!hasFlowchart && state.nodes.size > 0) {
    state.warnings.push({ message: "Missing flowchart TD declaration" });
  }

  const nodeIds = new Set(state.nodes.keys());
  const edges = state.edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .sort((a, b) => {
      const fromCmp = a.from.localeCompare(b.from);
      if (fromCmp !== 0) return fromCmp;
      const toCmp = a.to.localeCompare(b.to);
      if (toCmp !== 0) return toCmp;
      return a.type.localeCompare(b.type);
    });

  const nodes = [...state.nodes.values()].map(normalizeNode).sort((a, b) => a.id.localeCompare(b.id));

  return {
    document: { version: 1, nodes, edges },
    warnings: state.warnings,
    errors: state.errors,
  };
}

export function serializeCanvasMermaid(doc: CanvasDocument): string {
  const lines: string[] = [CANVAS_MERMAID_HEADER, "flowchart TD", ""];

  const sortedNodes = [...doc.nodes].map(normalizeNode).sort((a, b) => a.id.localeCompare(b.id));

  for (const node of sortedNodes) {
    lines.push(`%% node:${node.id} ${node.type}`);
    if (node.description?.trim()) {
      lines.push(`%% description:${node.description.trim()}`);
    }
    if (node.type === "problem" && node.status && node.status !== DEFAULT_PROBLEM_STATUS) {
      lines.push(`%% status:${node.status}`);
    }
    if (node.type === "solution") {
      if (node.decision && node.decision !== DEFAULT_SOLUTION_DECISION) {
        lines.push(`%% decision:${node.decision}`);
      }
      if (node.impact) lines.push(`%% impact:${node.impact}`);
      if (node.effort) lines.push(`%% effort:${node.effort}`);
      if (node.confidence) lines.push(`%% confidence:${node.confidence}`);
    }
    lines.push(`${node.id}["${escapeMermaidString(node.title)}"]`);
    lines.push("");
  }

  const sortedEdges = [...doc.edges].sort((a, b) => {
    const fromCmp = a.from.localeCompare(b.from);
    if (fromCmp !== 0) return fromCmp;
    const toCmp = a.to.localeCompare(b.to);
    if (toCmp !== 0) return toCmp;
    return a.type.localeCompare(b.type);
  });

  for (const edge of sortedEdges) {
    lines.push(`${edge.from} -->|${edge.type}| ${edge.to}`);
  }

  if (sortedEdges.length > 0) {
    lines.push("");
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

export function sanitizeCanvasDocument(input: unknown): CanvasDocument {
  if (!input || typeof input !== "object") return emptyCanvasDocument();
  const o = input as Record<string, unknown>;
  const nodesRaw = Array.isArray(o.nodes) ? o.nodes : [];
  const edgesRaw = Array.isArray(o.edges) ? o.edges : [];

  const nodes: CanvasNode[] = [];
  const nodeIds = new Set<string>();

  for (const raw of nodesRaw) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as Record<string, unknown>;
    const id = typeof n.id === "string" ? n.id.trim() : "";
    const type = n.type === "problem" || n.type === "solution" ? n.type : null;
    const title = typeof n.title === "string" ? n.title : "";
    if (!id || !type) continue;
    const description =
      typeof n.description === "string" && n.description.trim() ? n.description.trim() : undefined;
    const partial: CanvasNode = { id, type, title, ...(description ? { description } : {}) };
    if (type === "problem" && typeof n.status === "string") {
      partial.status = n.status as CanvasProblemStatus;
    }
    if (type === "solution") {
      if (typeof n.decision === "string") partial.decision = n.decision as CanvasSolutionDecision;
      if (typeof n.impact === "string") partial.impact = n.impact as CanvasRatingLevel;
      if (typeof n.effort === "string") partial.effort = n.effort as CanvasRatingLevel;
      if (typeof n.confidence === "string") partial.confidence = n.confidence as CanvasRatingLevel;
    }
    nodes.push(normalizeNode(partial));
    nodeIds.add(id);
  }

  const edges: CanvasEdge[] = [];
  for (const raw of edgesRaw) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const id = typeof e.id === "string" && e.id.trim() ? e.id.trim() : randomUUID();
    const from = typeof e.from === "string" ? e.from : "";
    const to = typeof e.to === "string" ? e.to : "";
    const type = e.type === "because" || e.type === "solved_by" ? e.type : null;
    if (!from || !to || !type || !nodeIds.has(from) || !nodeIds.has(to)) continue;
    edges.push({ id, from, to, type });
  }

  return { version: 1, nodes, edges };
}
