import type { Edge, Node, Viewport } from "@xyflow/react";
import type { CanvasDocument, CanvasEdge, CanvasNode, CanvasSide, CanvasViewport } from "@/types";

export type CanvasFlowNodeData = {
  text?: string;
  path?: string;
  url?: string;
  label?: string;
};

export type CanvasFlowNode = Node<CanvasFlowNodeData, CanvasNode["type"]>;

function nodeToFlow(node: CanvasNode): CanvasFlowNode {
  const base: CanvasFlowNode = {
    id: node.id,
    type: node.type,
    position: { x: node.x, y: node.y },
    style: { width: node.width, height: node.height },
    data: {},
  };

  if (node.parentId) {
    base.parentId = node.parentId;
    base.extent = "parent";
  }

  switch (node.type) {
    case "text":
      base.data = { text: node.text };
      break;
    case "note":
      base.data = { path: node.path };
      break;
    case "image":
      base.data = { path: node.path };
      break;
    case "link":
      base.data = { url: node.url };
      break;
    case "group":
      base.data = { label: node.label };
      base.zIndex = -1;
      break;
  }

  return base;
}

function resolveFlowNodeSize(node: CanvasFlowNode, axis: "width" | "height", fallback: number): number {
  const direct = node[axis];
  if (typeof direct === "number" && direct > 0) return direct;

  const styleValue = node.style?.[axis];
  if (typeof styleValue === "number" && styleValue > 0) return styleValue;

  const measuredValue = node.measured?.[axis];
  if (typeof measuredValue === "number" && measuredValue > 0) return measuredValue;

  return fallback;
}

function flowNodeToCanvas(node: CanvasFlowNode): CanvasNode | null {
  const width = resolveFlowNodeSize(node, "width", 200);
  const height = resolveFlowNodeSize(node, "height", 120);
  const base = {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: width > 0 ? width : 200,
    height: height > 0 ? height : 120,
    ...(node.parentId ? { parentId: node.parentId } : {}),
  };

  switch (node.type) {
    case "text":
      return { ...base, type: "text", text: node.data.text ?? "" };
    case "note":
      return { ...base, type: "note", path: node.data.path ?? "" };
    case "image":
      return { ...base, type: "image", path: node.data.path ?? "" };
    case "link":
      return { ...base, type: "link", url: node.data.url ?? "" };
    case "group":
      return { ...base, type: "group", label: node.data.label ?? "" };
    default:
      return null;
  }
}

function isCanvasSide(value: string): value is CanvasSide {
  return value === "top" || value === "right" || value === "bottom" || value === "left";
}

export function sideToSourceHandle(side: string): string {
  return `source-${side}`;
}

export function sideToTargetHandle(side: string): string {
  return `target-${side}`;
}

export function handleToSide(handle: string | null | undefined, fallback: CanvasSide): CanvasSide {
  if (!handle) return fallback;
  const match = handle.match(/^(?:source|target)-(.+)$/);
  if (match && isCanvasSide(match[1])) return match[1];
  if (isCanvasSide(handle)) return handle;
  return fallback;
}

type FlowEdgeEndpoint = {
  selected?: boolean;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

/** 選択中エッジの端点側。ここからの新規接続開始を抑止して付け替え UX を優先する */
export function getBlockedConnectionSidesForNode(
  nodeId: string,
  edges: FlowEdgeEndpoint[],
): Set<CanvasSide> {
  const sides = new Set<CanvasSide>();
  for (const edge of edges) {
    if (!edge.selected) continue;
    if (edge.source === nodeId) {
      sides.add(handleToSide(edge.sourceHandle, "right"));
    }
    if (edge.target === nodeId) {
      sides.add(handleToSide(edge.targetHandle, "left"));
    }
  }
  return sides;
}

export function isNewConnectionFromSelectedEdgeEndpoint(
  connection: { source: string; sourceHandle?: string | null },
  edges: FlowEdgeEndpoint[],
): boolean {
  return isConnectStartOnSelectedEdgeEndpoint(
    { nodeId: connection.source, handleId: connection.sourceHandle },
    edges,
  );
}

export function isConnectStartOnSelectedEdgeEndpoint(
  params: { nodeId: string; handleId?: string | null },
  edges: FlowEdgeEndpoint[],
): boolean {
  const side = handleToSide(params.handleId, "right");
  return getBlockedConnectionSidesForNode(params.nodeId, edges).has(side);
}

export function isConnectionTouchingSelectedEdgeEndpoint(
  connection: {
    source?: string | null;
    sourceHandle?: string | null;
    target?: string | null;
    targetHandle?: string | null;
  },
  edges: FlowEdgeEndpoint[],
): boolean {
  if (connection.source) {
    const sourceSide = handleToSide(connection.sourceHandle, "right");
    for (const edge of edges) {
      if (!edge.selected) continue;
      if (
        edge.source === connection.source &&
        handleToSide(edge.sourceHandle, "right") === sourceSide
      ) {
        return true;
      }
    }
  }

  if (connection.target) {
    const targetSide = handleToSide(connection.targetHandle, "left");
    for (const edge of edges) {
      if (!edge.selected) continue;
      if (
        edge.target === connection.target &&
        handleToSide(edge.targetHandle, "left") === targetSide
      ) {
        return true;
      }
    }
  }

  return false;
}

function edgeToFlow(edge: CanvasEdge): Edge {
  return {
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    sourceHandle: sideToSourceHandle(edge.fromSide),
    targetHandle: sideToTargetHandle(edge.toSide),
  };
}

function flowEdgeToCanvas(edge: Edge): CanvasEdge | null {
  if (!edge.source || !edge.target) return null;
  return {
    id: edge.id,
    fromNode: edge.source,
    toNode: edge.target,
    fromSide: handleToSide(edge.sourceHandle, "right"),
    toSide: handleToSide(edge.targetHandle, "left"),
  };
}

export function canvasViewportToFlow(viewport: CanvasViewport): Viewport {
  return { x: viewport.panX, y: viewport.panY, zoom: viewport.zoom };
}

export function flowViewportToCanvas(viewport: Viewport): CanvasViewport {
  return { panX: viewport.x, panY: viewport.y, zoom: viewport.zoom };
}

export function canvasDocumentToFlow(doc: CanvasDocument): {
  nodes: CanvasFlowNode[];
  edges: Edge[];
  viewport: Viewport;
} {
  const groupIds = new Set(doc.nodes.filter((n) => n.type === "group").map((n) => n.id));
  const nodes = doc.nodes.map((node) => {
    const flowNode = nodeToFlow(node);
    if (node.type === "group") {
      flowNode.selectable = true;
      flowNode.draggable = true;
    }
    if (node.parentId && groupIds.has(node.parentId)) {
      flowNode.parentId = node.parentId;
      flowNode.extent = "parent";
    }
    return flowNode;
  });

  return {
    nodes,
    edges: doc.edges.map(edgeToFlow),
    viewport: canvasViewportToFlow(doc.viewport),
  };
}

export function flowToCanvasDocument(
  nodes: CanvasFlowNode[],
  edges: Edge[],
  viewport: Viewport,
): CanvasDocument {
  const canvasNodes = nodes.map(flowNodeToCanvas).filter((n): n is CanvasNode => n !== null);
  const nodeIds = new Set(canvasNodes.map((n) => n.id));
  const canvasEdges = edges
    .map(flowEdgeToCanvas)
    .filter((e): e is CanvasEdge => e !== null && nodeIds.has(e.fromNode) && nodeIds.has(e.toNode));

  return {
    version: 1,
    nodes: canvasNodes,
    edges: canvasEdges,
    viewport: flowViewportToCanvas(viewport),
  };
}

export function createCanvasNodeId(): string {
  return `node-${crypto.randomUUID()}`;
}

export function createCanvasEdgeId(): string {
  return `edge-${crypto.randomUUID()}`;
}
