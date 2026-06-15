import type { CanvasDocument, CanvasEdge, CanvasNode, CanvasNodeType } from "@/types";

export interface CanvasGraphIndex {
  nodeById: Map<string, CanvasNode>;
  becauseOut: Map<string, string[]>;
  becauseIn: Map<string, string[]>;
  solvedByOut: Map<string, string[]>;
  solvedByIn: Map<string, string[]>;
}

export function buildCanvasGraphIndex(doc: CanvasDocument): CanvasGraphIndex {
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  const becauseOut = new Map<string, string[]>();
  const becauseIn = new Map<string, string[]>();
  const solvedByOut = new Map<string, string[]>();
  const solvedByIn = new Map<string, string[]>();

  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key) ?? [];
    if (!list.includes(value)) list.push(value);
    map.set(key, list);
  };

  for (const edge of doc.edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
    if (edge.type === "because") {
      push(becauseOut, edge.from, edge.to);
      push(becauseIn, edge.to, edge.from);
    } else {
      push(solvedByOut, edge.from, edge.to);
      push(solvedByIn, edge.to, edge.from);
    }
  }

  return { nodeById, becauseOut, becauseIn, solvedByOut, solvedByIn };
}

/** Count of incident edges (because + solved_by) per node. */
export function computeNodeLinkDegrees(doc: CanvasDocument): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of doc.nodes) degrees.set(node.id, 0);
  for (const edge of doc.edges) {
    if (!degrees.has(edge.from) || !degrees.has(edge.to)) continue;
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
}

export function getRootProblemIds(index: CanvasGraphIndex): string[] {
  const roots: string[] = [];
  for (const node of index.nodeById.values()) {
    if (node.type !== "problem") continue;
    const parents = index.becauseIn.get(node.id) ?? [];
    if (parents.length === 0) roots.push(node.id);
  }
  return roots.sort((a, b) => {
    const titleA = index.nodeById.get(a)?.title ?? a;
    const titleB = index.nodeById.get(b)?.title ?? b;
    return titleA.localeCompare(titleB);
  });
}

export function getBecauseChildren(index: CanvasGraphIndex, nodeId: string): CanvasNode[] {
  const ids = index.becauseOut.get(nodeId) ?? [];
  return ids
    .map((id) => index.nodeById.get(id))
    .filter((n): n is CanvasNode => n !== undefined && n.type === "problem");
}

export function getSolutionChildren(index: CanvasGraphIndex, nodeId: string): CanvasNode[] {
  const ids = index.solvedByOut.get(nodeId) ?? [];
  return ids
    .map((id) => index.nodeById.get(id))
    .filter((n): n is CanvasNode => n !== undefined && n.type === "solution");
}

export function problemHasAcceptedSolution(index: CanvasGraphIndex, problemId: string): boolean {
  const node = index.nodeById.get(problemId);
  if (node?.type !== "problem") return false;
  return getSolutionChildren(index, problemId).length > 0;
}

/** @deprecated Use problemHasAcceptedSolution */
export function problemHasSolution(index: CanvasGraphIndex, problemId: string): boolean {
  return problemHasAcceptedSolution(index, problemId);
}

/** Problem with no deeper because-children (solution attach point). */
export function isLeafProblem(index: CanvasGraphIndex, problemId: string): boolean {
  const node = index.nodeById.get(problemId);
  if (node?.type !== "problem") return false;
  return getBecauseChildren(index, problemId).length === 0;
}

/**
 * A problem is covered when every because-child subtree is covered;
 * leaf problems must have at least one linked solution.
 */
export function isProblemSolutionCovered(index: CanvasGraphIndex, problemId: string): boolean {
  const node = index.nodeById.get(problemId);
  if (node?.type !== "problem") return true;

  const becauseChildren = getBecauseChildren(index, problemId);
  if (becauseChildren.length === 0) {
    return problemHasAcceptedSolution(index, problemId);
  }
  return becauseChildren.every((child) => isProblemSolutionCovered(index, child.id));
}

/** Whether the problem should be highlighted as missing countermeasures. */
export function problemNeedsSolution(index: CanvasGraphIndex, problemId: string): boolean {
  const node = index.nodeById.get(problemId);
  if (node?.type !== "problem") return false;
  return !isProblemSolutionCovered(index, problemId);
}

export function getBecauseParents(index: CanvasGraphIndex, nodeId: string): CanvasNode[] {
  const ids = index.becauseIn.get(nodeId) ?? [];
  return ids
    .map((id) => index.nodeById.get(id))
    .filter((n): n is CanvasNode => n !== undefined && n.type === "problem");
}

export function getSolutionParents(index: CanvasGraphIndex, nodeId: string): CanvasNode[] {
  const ids = index.solvedByIn.get(nodeId) ?? [];
  return ids
    .map((id) => index.nodeById.get(id))
    .filter((n): n is CanvasNode => n !== undefined && n.type === "problem");
}

export function createNodeId(type: CanvasNodeType): string {
  const prefix = type === "problem" ? "p" : "s";
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createEdge(from: string, to: string, type: CanvasEdge["type"]): CanvasEdge {
  return { id: `e_${from}_${to}_${type}`, from, to, type };
}

export function removeNodeFromDocument(doc: CanvasDocument, nodeId: string): CanvasDocument {
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => n.id !== nodeId),
    edges: doc.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
  };
}

export function updateNodeInDocument(
  doc: CanvasDocument,
  nodeId: string,
  patch: Partial<
    Pick<
      CanvasNode,
      "title" | "description" | "status" | "decision" | "impact" | "effort" | "confidence"
    >
  >,
): CanvasDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
  };
}

export function addChildProblem(doc: CanvasDocument, parentId: string, title: string): CanvasDocument {
  const childId = createNodeId("problem");
  return {
    ...doc,
    nodes: [...doc.nodes, { id: childId, type: "problem", title, status: "open" }],
    edges: [...doc.edges, createEdge(parentId, childId, "because")],
  };
}

export function addChildSolution(doc: CanvasDocument, parentId: string, title: string): CanvasDocument {
  const childId = createNodeId("solution");
  const withNode: CanvasDocument = {
    ...doc,
    nodes: [...doc.nodes, { id: childId, type: "solution", title }],
    edges: doc.edges,
  };
  if (!isValidConnection(withNode, parentId, childId, "solved_by")) return doc;
  return { ...withNode, edges: [...withNode.edges, createEdge(parentId, childId, "solved_by")] };
}

export function connectExistingNode(
  doc: CanvasDocument,
  parentId: string,
  childId: string,
  edgeType: CanvasEdge["type"],
): CanvasDocument {
  if (!isValidConnection(doc, parentId, childId, edgeType)) return doc;
  return { ...doc, edges: [...doc.edges, createEdge(parentId, childId, edgeType)] };
}

export function removeEdgeFromDocument(doc: CanvasDocument, edgeId: string): CanvasDocument {
  return { ...doc, edges: doc.edges.filter((e) => e.id !== edgeId) };
}

export function reassignEdgeTarget(doc: CanvasDocument, edgeId: string, newTo: string): CanvasDocument {
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) return doc;
  if (!isValidConnection(doc, edge.from, newTo, edge.type)) return doc;
  return {
    ...doc,
    edges: doc.edges.map((e) =>
      e.id === edgeId ? { ...e, to: newTo, id: `e_${e.from}_${newTo}_${e.type}` } : e,
    ),
  };
}

export function canReassignEdgeTarget(doc: CanvasDocument, edgeId: string, newTo: string): boolean {
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) return false;
  return isValidConnection(doc, edge.from, newTo, edge.type);
}

export function canReassignEdgeSource(doc: CanvasDocument, edgeId: string, newFrom: string): boolean {
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) return false;
  const withoutEdge = removeEdgeFromDocument(doc, edgeId);
  return isValidConnection(withoutEdge, newFrom, edge.to, edge.type);
}

export function reassignEdgeSource(doc: CanvasDocument, edgeId: string, newFrom: string): CanvasDocument {
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) return doc;
  const withoutEdge = removeEdgeFromDocument(doc, edgeId);
  if (!isValidConnection(withoutEdge, newFrom, edge.to, edge.type)) return doc;
  return {
    ...withoutEdge,
    edges: [...withoutEdge.edges, createEdge(newFrom, edge.to, edge.type)],
  };
}

export function hasBecausePath(index: CanvasGraphIndex, fromId: string, toId: string): boolean {
  if (fromId === toId) return true;
  const stack = [fromId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === toId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of index.becauseOut.get(id) ?? []) {
      stack.push(next);
    }
  }
  return false;
}

export function getDescendantsHiddenByCollapse(
  collapsedIds: Set<string>,
  index: CanvasGraphIndex,
): Set<string> {
  const hidden = new Set<string>();
  for (const collapsedId of collapsedIds) {
    const stack = [...(index.becauseOut.get(collapsedId) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (hidden.has(id)) continue;
      hidden.add(id);
      for (const child of index.becauseOut.get(id) ?? []) stack.push(child);
      for (const sol of index.solvedByOut.get(id) ?? []) stack.push(sol);
    }
  }
  return hidden;
}

export function getFocusNeighborhood(index: CanvasGraphIndex, nodeId: string): Set<string> {
  const focus = new Set<string>([nodeId]);

  const walkUp = (id: string) => {
    for (const parentId of index.becauseIn.get(id) ?? []) {
      if (focus.has(parentId)) continue;
      focus.add(parentId);
      walkUp(parentId);
    }
    for (const parentId of index.solvedByIn.get(id) ?? []) {
      if (focus.has(parentId)) continue;
      focus.add(parentId);
      walkUp(parentId);
    }
  };

  const walkDown = (id: string) => {
    for (const childId of index.becauseOut.get(id) ?? []) {
      if (focus.has(childId)) continue;
      focus.add(childId);
      walkDown(childId);
    }
    for (const childId of index.solvedByOut.get(id) ?? []) {
      if (focus.has(childId)) continue;
      focus.add(childId);
    }
  };

  walkUp(nodeId);
  walkDown(nodeId);
  return focus;
}

export function isValidConnection(
  doc: CanvasDocument,
  fromId: string,
  toId: string,
  edgeType: CanvasEdge["type"],
): boolean {
  if (fromId === toId) return false;
  const index = buildCanvasGraphIndex(doc);
  const from = index.nodeById.get(fromId);
  const to = index.nodeById.get(toId);
  if (!from || !to) return false;
  if (edgeType === "because") {
    if (from.type !== "problem" || to.type !== "problem") return false;
    if (hasBecausePath(index, toId, fromId)) return false;
  } else {
    if (from.type !== "problem" || to.type !== "solution") return false;
    if (!isLeafProblem(index, fromId)) return false;
  }
  return !doc.edges.some((e) => e.from === fromId && e.to === toId && e.type === edgeType);
}

