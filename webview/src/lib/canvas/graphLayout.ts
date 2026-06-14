import type { CanvasDocument, CanvasEdge } from "@/types";
import { buildCanvasGraphIndex, computeNodeLinkDegrees, getRootProblemIds } from "./graphUtils";

export const GRAPH_NODE_W = 200;
export const GRAPH_NODE_MIN_H = 56;
export const GRAPH_LAYER_GAP = 48;
export const GRAPH_NODE_GAP = 40;
export const GRAPH_SOLUTION_GAP_X = 60;
export const MIN_NODE_GAP = 24;

const LINK_SCALE_STEP = 0.14;
const LINK_SCALE_MAX = 1.7;

const NODE_PAD_X = 24;
const TYPE_LABEL_H = 18;
const BODY_LINE_H = 20;
const NODE_PAD_Y = 16;
const SOLUTION_STACK_GAP = 16;
const ARROW_LENGTH = 8;
const ARROW_WIDTH = 6;
const ARROW_HALO_EXTRA = 2;

export interface LayoutRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphLayoutResult {
  nodes: Map<string, LayoutRect>;
  linkDegrees: Map<string, number>;
  depths: Map<string, number>;
  layerTops: Map<number, number>;
  edgePorts: Map<string, EdgePortInfo>;
  width: number;
  height: number;
}

export interface EdgePortInfo {
  fromPortIndex: number;
  fromPortTotal: number;
  toPortIndex: number;
  toPortTotal: number;
}

/** Visual scale from incident link count (kept at 1.0 to avoid clutter). */
export function linkDegreeVisualScale(_degree: number): number {
  return 1;
}

export function nodeWidthForLinkDegree(degree: number): number {
  return Math.round(GRAPH_NODE_W * linkDegreeVisualScale(degree));
}

export function edgeVisualScale(fromDegree: number, toDegree: number): number {
  return linkDegreeVisualScale(Math.max(fromDegree, toDegree));
}

/** Estimate wrapped line count for node body at fixed width. */
export function measureTitleLineCount(title: string, innerWidth = GRAPH_NODE_W - NODE_PAD_X): number {
  const text = title.trim() || " ";
  const maxUnits = Math.max(10, Math.floor(innerWidth / 7));
  let lines = 1;
  let units = 0;
  for (const char of text) {
    const w = char.charCodeAt(0) > 255 ? 2 : 1;
    if (units + w > maxUnits) {
      lines += 1;
      units = w;
    } else {
      units += w;
    }
  }
  return lines;
}

export function measureNodeHeight(title: string, nodeWidth = GRAPH_NODE_W, linkDegree = 1): number {
  const lines = measureTitleLineCount(title, nodeWidth - NODE_PAD_X);
  const bodyH = lines * BODY_LINE_H;
  const minH = Math.round(GRAPH_NODE_MIN_H * linkDegreeVisualScale(linkDegree));
  return Math.max(minH, TYPE_LABEL_H + bodyH + NODE_PAD_Y);
}

export function computeProblemDepths(doc: CanvasDocument): Map<string, number> {
  const index = buildCanvasGraphIndex(doc);
  const depths = new Map<string, number>();

  for (const id of index.nodeById.keys()) {
    const node = index.nodeById.get(id);
    if (node?.type === "problem") depths.set(id, 0);
  }

  const problemCount = [...index.nodeById.values()].filter((n) => n.type === "problem").length;
  for (let pass = 0; pass < Math.max(1, problemCount); pass += 1) {
    let changed = false;
    for (const edge of doc.edges) {
      if (edge.type !== "because") continue;
      const fromNode = index.nodeById.get(edge.from);
      const toNode = index.nodeById.get(edge.to);
      if (fromNode?.type !== "problem" || toNode?.type !== "problem") continue;
      const fromDepth = depths.get(edge.from) ?? 0;
      const next = fromDepth + 1;
      const cur = depths.get(edge.to) ?? 0;
      if (next > cur) {
        depths.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return depths;
}

function centerX(rect: LayoutRect): number {
  return rect.x + rect.width / 2;
}

function rectsOverlap(a: LayoutRect, b: LayoutRect, gap = MIN_NODE_GAP): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function resolveOverlaps(positions: Map<string, LayoutRect>): void {
  const ids = [...positions.keys()];
  for (let iter = 0; iter < 80; iter += 1) {
    let changed = false;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const idA = ids[i];
        const idB = ids[j];
        if (!idA || !idB) continue;
        const a = positions.get(idA);
        const b = positions.get(idB);
        if (!a || !b || !rectsOverlap(a, b)) continue;

        const pushRight = b.x - (a.x + a.width + MIN_NODE_GAP);
        const pushDown = b.y - (a.y + a.height + MIN_NODE_GAP);
        if (pushRight <= 0 && pushDown <= 0) {
          const shiftX = a.x + a.width + MIN_NODE_GAP - b.x;
          positions.set(idB, { ...b, x: b.x + shiftX });
          changed = true;
        } else if (pushRight > 0 && (pushDown <= 0 || pushRight <= pushDown)) {
          positions.set(idB, { ...b, x: b.x + pushRight });
          changed = true;
        } else if (pushDown > 0) {
          positions.set(idB, { ...b, y: b.y + pushDown });
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

function layoutProblems(
  doc: CanvasDocument,
  heights: Map<string, number>,
  widths: Map<string, number>,
): Map<string, LayoutRect> {
  const index = buildCanvasGraphIndex(doc);
  const depths = computeProblemDepths(doc);
  const positions = new Map<string, LayoutRect>();
  const nodeW = (id: string) => widths.get(id) ?? GRAPH_NODE_W;

  const problemsByLayer = new Map<number, string[]>();
  let maxDepth = 0;
  for (const node of doc.nodes) {
    if (node.type !== "problem") continue;
    const layer = depths.get(node.id) ?? 0;
    maxDepth = Math.max(maxDepth, layer);
    const list = problemsByLayer.get(layer) ?? [];
    list.push(node.id);
    problemsByLayer.set(layer, list);
  }

  const layerTop = new Map<number, number>();
  let y = 0;
  for (let layer = 0; layer <= maxDepth; layer += 1) {
    layerTop.set(layer, y);
    const ids = problemsByLayer.get(layer) ?? [];
    const rowMaxH = ids.reduce((max, id) => Math.max(max, heights.get(id) ?? GRAPH_NODE_MIN_H), GRAPH_NODE_MIN_H);
    y += rowMaxH + GRAPH_LAYER_GAP;
  }

  const targetCenterX = new Map<string, number>();

  const roots = getRootProblemIds(index).sort((a, b) => {
    const ta = index.nodeById.get(a)?.title ?? a;
    const tb = index.nodeById.get(b)?.title ?? b;
    return ta.localeCompare(tb);
  });

  let rootCursor = 0;
  for (const id of roots) {
    const width = nodeW(id);
    targetCenterX.set(id, rootCursor + width / 2);
    rootCursor += width + GRAPH_NODE_GAP;
  }

  const rootLayer = problemsByLayer.get(0) ?? [];
  if (rootLayer.length > 0) {
    let packCursor = 0;
    const sortedRoots = [...rootLayer].sort((a, b) => {
      const dx = (targetCenterX.get(a) ?? 0) - (targetCenterX.get(b) ?? 0);
      if (dx !== 0) return dx;
      const ta = index.nodeById.get(a)?.title ?? a;
      const tb = index.nodeById.get(b)?.title ?? b;
      return ta.localeCompare(tb);
    });
    for (const id of sortedRoots) {
      const h = heights.get(id) ?? GRAPH_NODE_MIN_H;
      const width = nodeW(id);
      const idealX = (targetCenterX.get(id) ?? packCursor) - width / 2;
      const x = Math.max(packCursor, idealX);
      positions.set(id, { id, x, y: layerTop.get(0) ?? 0, width, height: h });
      packCursor = x + width + GRAPH_NODE_GAP;
    }
  }

  for (let layer = 1; layer <= maxDepth; layer += 1) {
    const ids = problemsByLayer.get(layer) ?? [];
    for (const id of ids) {
      const parents = (index.becauseIn.get(id) ?? []).filter((pid) => index.nodeById.get(pid)?.type === "problem");
      if (parents.length === 0) {
        const width = nodeW(id);
        targetCenterX.set(id, rootCursor + width / 2);
        rootCursor += width + GRAPH_NODE_GAP;
        continue;
      }
      let sum = 0;
      let count = 0;
      for (const parentId of parents) {
        const placed = positions.get(parentId);
        if (placed) {
          sum += centerX(placed);
          count += 1;
        } else {
          const pending = targetCenterX.get(parentId);
          if (pending !== undefined) {
            sum += pending;
            count += 1;
          }
        }
      }
      targetCenterX.set(id, count > 0 ? sum / count : rootCursor + nodeW(id) / 2);
    }

    const sorted = [...ids].sort((a, b) => {
      const dx = (targetCenterX.get(a) ?? 0) - (targetCenterX.get(b) ?? 0);
      if (dx !== 0) return dx;
      const ta = index.nodeById.get(a)?.title ?? a;
      const tb = index.nodeById.get(b)?.title ?? b;
      return ta.localeCompare(tb);
    });

    let packCursor = 0;
    for (const id of sorted) {
      const h = heights.get(id) ?? GRAPH_NODE_MIN_H;
      const width = nodeW(id);
      const idealX = (targetCenterX.get(id) ?? packCursor) - width / 2;
      const x = Math.max(packCursor, idealX);
      const top = layerTop.get(layer) ?? 0;
      positions.set(id, { id, x, y: top, width, height: h });
      packCursor = x + width + GRAPH_NODE_GAP;
    }
  }

  return positions;
}

function layoutSolutions(
  doc: CanvasDocument,
  index: ReturnType<typeof buildCanvasGraphIndex>,
  heights: Map<string, number>,
  widths: Map<string, number>,
  positions: Map<string, LayoutRect>,
): void {
  const nodeW = (id: string) => widths.get(id) ?? GRAPH_NODE_W;
  const placedSolutions = new Set<string>();

  const parents = [...index.nodeById.values()]
    .filter((n) => n.type === "problem")
    .map((n) => n.id)
    .sort((a, b) => {
      const ra = positions.get(a);
      const rb = positions.get(b);
      if (ra && rb && ra.y !== rb.y) return ra.y - rb.y;
      return (ra?.x ?? 0) - (rb?.x ?? 0);
    });

  for (const parentId of parents) {
    const parentRect = positions.get(parentId);
    if (!parentRect) continue;
    const solutionIds = (index.solvedByOut.get(parentId) ?? []).filter((id) => {
      const node = index.nodeById.get(id);
      return node?.type === "solution" && !placedSolutions.has(id);
    });
    if (solutionIds.length === 0) continue;

    const parentCenterY = parentRect.y + parentRect.height / 2;
    const totalH = solutionIds.reduce((sum, id, i) => {
      const h = heights.get(id) ?? GRAPH_NODE_MIN_H;
      return sum + h + (i > 0 ? SOLUTION_STACK_GAP : 0);
    }, 0);
    let stackY = parentCenterY - totalH / 2;

    for (const solutionId of solutionIds) {
      const h = heights.get(solutionId) ?? GRAPH_NODE_MIN_H;
      const width = nodeW(solutionId);
      const x = parentRect.x + parentRect.width + GRAPH_SOLUTION_GAP_X;
      positions.set(solutionId, {
        id: solutionId,
        x,
        y: stackY,
        width,
        height: h,
      });
      placedSolutions.add(solutionId);
      stackY += h + SOLUTION_STACK_GAP;
    }
  }

  let orphanY = 0;
  for (const node of doc.nodes) {
    if (node.type !== "solution" || placedSolutions.has(node.id)) continue;
    const h = heights.get(node.id) ?? GRAPH_NODE_MIN_H;
    const width = nodeW(node.id);
    positions.set(node.id, { id: node.id, x: 0, y: orphanY, width, height: h });
    orphanY += h + GRAPH_NODE_GAP;
  }
}

export function computeGraphLayout(doc: CanvasDocument): GraphLayoutResult {
  const linkDegrees = computeNodeLinkDegrees(doc);
  const widths = new Map<string, number>();
  for (const node of doc.nodes) {
    widths.set(node.id, nodeWidthForLinkDegree(linkDegrees.get(node.id) ?? 0));
  }

  const heights = new Map<string, number>();
  for (const node of doc.nodes) {
    const width = widths.get(node.id) ?? GRAPH_NODE_W;
    const degree = linkDegrees.get(node.id) ?? 0;
    heights.set(node.id, measureNodeHeight(node.title, width, degree));
  }

  const index = buildCanvasGraphIndex(doc);
  const positions = layoutProblems(doc, heights, widths);
  layoutSolutions(doc, index, heights, widths, positions);

  for (const node of doc.nodes) {
    if (positions.has(node.id)) continue;
    const h = heights.get(node.id) ?? GRAPH_NODE_MIN_H;
    const width = widths.get(node.id) ?? GRAPH_NODE_W;
    positions.set(node.id, { id: node.id, x: 0, y: 0, width, height: h });
  }

  resolveOverlaps(positions);

  const depths = computeProblemDepths(doc);
  const edgePorts = buildEdgePortMaps(doc, positions);
  const layerTops = new Map<number, number>();
  for (const node of doc.nodes) {
    if (node.type !== "problem") continue;
    const depth = depths.get(node.id) ?? 0;
    const rect = positions.get(node.id);
    if (!rect) continue;
    const top = layerTops.get(depth);
    if (top === undefined || rect.y < top) layerTops.set(depth, rect.y);
  }

  let maxX = 0;
  let maxY = 0;
  for (const rect of positions.values()) {
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  const padding = 56;
  return {
    nodes: positions,
    linkDegrees,
    depths,
    layerTops,
    edgePorts,
    width: Math.max(maxX + padding * 2, 320),
    height: Math.max(maxY + padding * 2, 240),
  };
}

export function layoutCenter(rect: LayoutRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function edgeSpan(from: LayoutRect, to: LayoutRect): number {
  const fc = layoutCenter(from);
  const tc = layoutCenter(to);
  const dx = tc.x - fc.x;
  const dy = to.y - (from.y + from.height);
  return Math.hypot(dx, dy);
}

function portX(rect: LayoutRect, index: number, total: number): number {
  if (total <= 1) return rect.x + rect.width / 2;
  const frac = (index + 1) / (total + 1);
  return rect.x + rect.width * frac;
}

function buildEdgePortMaps(
  doc: CanvasDocument,
  positions: Map<string, LayoutRect>,
): Map<string, EdgePortInfo> {
  const index = buildCanvasGraphIndex(doc);
  const ports = new Map<string, EdgePortInfo>();

  for (const node of doc.nodes) {
    if (node.type !== "problem") continue;
    const becauseOut = (index.becauseOut.get(node.id) ?? [])
      .map((toId) => doc.edges.find((e) => e.from === node.id && e.to === toId && e.type === "because"))
      .filter((e): e is CanvasEdge => e !== undefined)
      .sort((a, b) => {
        const ax = positions.get(a.to)?.x ?? 0;
        const bx = positions.get(b.to)?.x ?? 0;
        return ax - bx;
      });
    becauseOut.forEach((edge, i) => {
      const existing = ports.get(edge.id) ?? {
        fromPortIndex: 0,
        fromPortTotal: 1,
        toPortIndex: 0,
        toPortTotal: 1,
      };
      ports.set(edge.id, {
        ...existing,
        fromPortIndex: i,
        fromPortTotal: becauseOut.length,
      });
    });

    const becauseIn = (index.becauseIn.get(node.id) ?? [])
      .map((fromId) => doc.edges.find((e) => e.from === fromId && e.to === node.id && e.type === "because"))
      .filter((e): e is CanvasEdge => e !== undefined)
      .sort((a, b) => {
        const ax = positions.get(a.from)?.x ?? 0;
        const bx = positions.get(b.from)?.x ?? 0;
        return ax - bx;
      });
    becauseIn.forEach((edge, i) => {
      const existing = ports.get(edge.id) ?? {
        fromPortIndex: 0,
        fromPortTotal: 1,
        toPortIndex: 0,
        toPortTotal: 1,
      };
      ports.set(edge.id, {
        ...existing,
        toPortIndex: i,
        toPortTotal: becauseIn.length,
      });
    });
  }

  return ports;
}

export function edgeAnchor(
  from: LayoutRect,
  to: LayoutRect,
  edgeType: "because" | "solved_by",
  ports?: EdgePortInfo,
): { x1: number; y1: number; x2: number; y2: number } {
  const fc = layoutCenter(from);
  const tc = layoutCenter(to);
  if (edgeType === "solved_by") {
    return {
      x1: from.x + from.width,
      y1: fc.y,
      x2: to.x,
      y2: tc.y,
    };
  }
  const fromPort = ports
    ? portX(from, ports.fromPortIndex, ports.fromPortTotal)
    : fc.x;
  const toPort = ports ? portX(to, ports.toPortIndex, ports.toPortTotal) : tc.x;
  return {
    x1: fromPort,
    y1: from.y + from.height,
    x2: toPort,
    y2: to.y,
  };
}

export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  return buildEdgePathGeometry(x1, y1, x2, y2).pathD;
}

/** @deprecated Use edgePath */
export function bezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  _edgeType?: "because" | "solved_by",
): string {
  return edgePath(x1, y1, x2, y2);
}

interface EdgePathGeometry {
  pathD: string;
  tipX: number;
  tipY: number;
  tangentX: number;
  tangentY: number;
  midX: number;
  midY: number;
}

function trimSegmentEnd(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  maxTrim = ARROW_LENGTH,
): { px: number; py: number; tangentX: number; tangentY: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const trim = Math.min(maxTrim, len * 0.45);
  return {
    px: x2 - (trim * dx) / len,
    py: y2 - (trim * dy) / len,
    tangentX: dx / len,
    tangentY: dy / len,
  };
}

export function arrowHeadPolygon(
  tipX: number,
  tipY: number,
  tangentX: number,
  tangentY: number,
  length = ARROW_LENGTH,
  width = ARROW_WIDTH,
): string {
  const backX = tipX - tangentX * length;
  const backY = tipY - tangentY * length;
  const perpX = -tangentY * (width / 2);
  const perpY = tangentX * (width / 2);
  return [
    `${tipX},${tipY}`,
    `${backX + perpX},${backY + perpY}`,
    `${backX - perpX},${backY - perpY}`,
  ].join(" ");
}

function buildStraightSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  visualScale = 1,
): EdgePathGeometry {
  const trimmed = trimSegmentEnd(x1, y1, x2, y2, ARROW_LENGTH * visualScale);
  return {
    pathD: `M ${x1} ${y1} L ${trimmed.px} ${trimmed.py}`,
    tipX: x2,
    tipY: y2,
    tangentX: trimmed.tangentX,
    tangentY: trimmed.tangentY,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  };
}

function buildOrthogonalBecause(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  visualScale = 1,
): EdgePathGeometry {
  const midY = y1 + Math.max(12, (y2 - y1) * 0.5);
  const pathD = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
  const trimmed = trimSegmentEnd(x2, midY, x2, y2, ARROW_LENGTH * visualScale);
  return {
    pathD: `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${trimmed.px} ${trimmed.py}`,
    tipX: x2,
    tipY: y2,
    tangentX: 0,
    tangentY: 1,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  };
}

function buildEdgePathGeometry(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  visualScale = 1,
  edgeType: CanvasEdge["type"] = "because",
): EdgePathGeometry {
  if (edgeType === "because" && Math.abs(x1 - x2) > 4) {
    return buildOrthogonalBecause(x1, y1, x2, y2, visualScale);
  }
  return buildStraightSegment(x1, y1, x2, y2, visualScale);
}

export interface EdgeGeometry {
  pathD: string;
  tipX: number;
  tipY: number;
  tangentX: number;
  tangentY: number;
  angleDeg: number;
  arrowPoints: string;
  arrowHaloPoints: string;
}

export function computeEdgeGeometry(
  from: LayoutRect,
  to: LayoutRect,
  edgeType: CanvasEdge["type"],
  visualScale = 1,
  ports?: EdgePortInfo,
): EdgeGeometry {
  const anchor = edgeAnchor(from, to, edgeType, ports);
  const geom = buildEdgePathGeometry(anchor.x1, anchor.y1, anchor.x2, anchor.y2, visualScale, edgeType);

  let tangX = geom.tangentX;
  let tangY = geom.tangentY;
  if (Math.hypot(tangX, tangY) < 0.01) {
    tangX = anchor.x2 - anchor.x1;
    tangY = anchor.y2 - anchor.y1;
    const fallbackLen = Math.hypot(tangX, tangY) || 1;
    tangX /= fallbackLen;
    tangY /= fallbackLen;
  }

  const arrowLen = ARROW_LENGTH * visualScale;
  const arrowW = ARROW_WIDTH * visualScale;

  return {
    pathD: geom.pathD,
    tipX: geom.tipX,
    tipY: geom.tipY,
    tangentX: tangX,
    tangentY: tangY,
    angleDeg: (Math.atan2(tangY, tangX) * 180) / Math.PI,
    arrowPoints: arrowHeadPolygon(geom.tipX, geom.tipY, tangX, tangY, arrowLen, arrowW),
    arrowHaloPoints: arrowHeadPolygon(
      geom.tipX,
      geom.tipY,
      tangX,
      tangY,
      arrowLen + ARROW_HALO_EXTRA,
      arrowW + ARROW_HALO_EXTRA,
    ),
  };
}

export function edgePathD(
  from: LayoutRect,
  to: LayoutRect,
  edgeType: CanvasEdge["type"],
  ports?: EdgePortInfo,
): string {
  return computeEdgeGeometry(from, to, edgeType, 1, ports).pathD;
}

export function edgeMidpointOnPath(
  from: LayoutRect,
  to: LayoutRect,
  edgeType: CanvasEdge["type"],
  ports?: EdgePortInfo,
): { x: number; y: number } {
  const anchor = edgeAnchor(from, to, edgeType, ports);
  const geom = buildEdgePathGeometry(anchor.x1, anchor.y1, anchor.x2, anchor.y2, 1, edgeType);
  return { x: geom.midX, y: geom.midY };
}
