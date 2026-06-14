import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { palette } from "@/theme/palette";
import type { CanvasDocument, CanvasEdge } from "@/types";
import { buildCanvasGraphIndex, getFocusNeighborhood, isValidConnection, isLeafProblem, problemNeedsSolution } from "@/lib/canvas/graphUtils";
import {
  computeEdgeGeometry,
  computeGraphLayout,
  edgeMidpointOnPath,
  edgePathD,
  edgeSpan,
  type EdgePortInfo,
  type LayoutRect,
} from "@/lib/canvas/graphLayout";
import { CanvasEdgeToolbar } from "./CanvasEdgeToolbar";
import { CanvasGraphNode } from "./CanvasGraphNode";

const PADDING = 48;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.75;
const CANVAS_BG = "#f8f7f4";

function edgeTouchesNode(edge: CanvasEdge, nodeId: string | null): boolean {
  if (!nodeId) return false;
  return edge.from === nodeId || edge.to === nodeId;
}

function edgeInFocus(
  edge: CanvasEdge,
  focusIds: Set<string> | null,
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
  hoverEdgeId: string | null,
): boolean {
  if (selectedEdgeId === edge.id || hoverEdgeId === edge.id) return true;
  if (!selectedNodeId) return true;
  if (focusIds) return focusIds.has(edge.from) && focusIds.has(edge.to);
  return edgeTouchesNode(edge, selectedNodeId);
}

function CanvasEdgePaths({
  edges,
  layout,
  selectedNodeId,
  selectedEdgeId,
  hoverEdgeId,
  focusIds,
}: {
  edges: CanvasEdge[];
  layout: ReturnType<typeof computeGraphLayout>;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  hoverEdgeId: string | null;
  focusIds: Set<string> | null;
}) {
  const paintEdges = useMemo(() => {
    return [...edges].sort((a, b) => {
      const aActive = edgeInFocus(a, focusIds, selectedNodeId, selectedEdgeId, hoverEdgeId);
      const bActive = edgeInFocus(b, focusIds, selectedNodeId, selectedEdgeId, hoverEdgeId);
      if (aActive === bActive) return 0;
      return aActive ? 1 : -1;
    });
  }, [edges, focusIds, hoverEdgeId, selectedEdgeId, selectedNodeId]);

  const focusNode = selectedNodeId !== null && selectedEdgeId === null;

  return (
    <>
      {paintEdges.map((edge) => {
        const fromRect = layout.nodes.get(edge.from);
        const toRect = layout.nodes.get(edge.to);
        if (!fromRect || !toRect) return null;
        const from = offsetRect(fromRect);
        const to = offsetRect(toRect);
        const ports = layout.edgePorts.get(edge.id);
        const geom = computeEdgeGeometry(from, to, edge.type, 1, ports);
        const selected = selectedEdgeId === edge.id;
        const hovered = hoverEdgeId === edge.id;
        const nodeLinked = edgeTouchesNode(edge, selectedNodeId);
        const inFocus = edgeInFocus(edge, focusIds, selectedNodeId, selectedEdgeId, hoverEdgeId);
        const active = selected || hovered || nodeLinked;
        const dimmed = focusNode && !inFocus;
        const stroke = edge.type === "because" ? palette.accent.link : "#d97706";
        const haloW = active ? (nodeLinked && !selected && !hovered ? 5 : 4) : 3;
        const lineW = active ? (nodeLinked && !selected && !hovered ? 2.25 : 2) : 1.25;
        return (
          <g key={`edge-${edge.id}`}>
            <path
              d={geom.pathD}
              fill="none"
              stroke={CANVAS_BG}
              strokeWidth={haloW + lineW}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={geom.pathD}
              fill="none"
              stroke={stroke}
              strokeOpacity={dimmed ? 0.12 : active ? 1 : 0.45}
              strokeWidth={lineW}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polygon points={geom.arrowHaloPoints} fill={CANVAS_BG} />
            <polygon
              points={geom.arrowPoints}
              fill={stroke}
              fillOpacity={dimmed ? 0.12 : active ? 1 : 0.45}
            />
          </g>
        );
      })}
    </>
  );
}

function DepthLanes({
  layout,
}: {
  layout: ReturnType<typeof computeGraphLayout>;
}) {
  const layers = [...layout.layerTops.entries()].sort(([a], [b]) => a - b);
  if (layers.length === 0) return null;

  return (
    <>
      {layers.map(([depth, top]) => (
        <div
          key={`lane-${depth}`}
          className="pointer-events-none absolute left-0 right-0 border-t border-stone-300/40"
          style={{ top: top + PADDING - 8 }}
        >
          <span className="absolute left-2 -top-3 rounded bg-stone-200/80 px-1.5 py-0.5 text-[9px] font-medium text-text-muted">
            D{depth}
          </span>
        </div>
      ))}
    </>
  );
}

export type CanvasLinkMode = {
  fromId: string;
  edgeType: CanvasEdge["type"];
  reassignEdgeId?: string;
};

function offsetRect(rect: LayoutRect): LayoutRect {
  return { ...rect, x: rect.x + PADDING, y: rect.y + PADDING };
}

function edgeMidpoint(
  from: LayoutRect,
  to: LayoutRect,
  edge: CanvasEdge,
  ports?: EdgePortInfo,
): { x: number; y: number } {
  return edgeMidpointOnPath(from, to, edge.type, ports);
}

export function CanvasGraph({
  document,
  layoutKey,
  selectedNodeId,
  selectedEdgeId,
  editingNodeId,
  linkMode,
  onSelectNode,
  onSelectEdge,
  onStartEditNode,
  onUpdateNodeTitle,
  onEndEditNode,
  onConnect,
  onCancelLink,
  onStartLinkBecause,
  onStartLinkSolution,
  onAddWhy,
  onAddSolution,
  onDeleteNode,
  onDeleteEdge,
  onReassignEdge,
  onAddRootProblem,
}: {
  document: CanvasDocument;
  layoutKey: string;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  editingNodeId: string | null;
  linkMode: CanvasLinkMode | null;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onStartEditNode: (nodeId: string) => void;
  onUpdateNodeTitle: (nodeId: string, title: string) => void;
  onEndEditNode: () => void;
  onConnect: (fromId: string, toId: string, edgeType: CanvasEdge["type"]) => void;
  onCancelLink: () => void;
  onStartLinkBecause: (nodeId: string) => void;
  onStartLinkSolution: (nodeId: string) => void;
  onAddWhy: (nodeId: string) => void;
  onAddSolution: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onReassignEdge: (edgeId: string) => void;
  onAddRootProblem: () => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const layout = useMemo(() => computeGraphLayout(document), [document]);
  const graphIndex = useMemo(() => buildCanvasGraphIndex(document), [document]);
  const focusIds = useMemo(() => {
    if (!selectedNodeId || selectedEdgeId) return null;
    return getFocusNeighborhood(graphIndex, selectedNodeId);
  }, [graphIndex, selectedEdgeId, selectedNodeId]);

  const renderEdges = useMemo(() => {
    return [...document.edges].sort((a, b) => {
      const fromA = layout.nodes.get(a.from);
      const toA = layout.nodes.get(a.to);
      const fromB = layout.nodes.get(b.from);
      const toB = layout.nodes.get(b.to);
      if (!fromA || !toA || !fromB || !toB) return 0;
      return edgeSpan(fromB, toB) - edgeSpan(fromA, toA);
    });
  }, [document.edges, layout]);

  const linkSourceRect = linkMode ? layout.nodes.get(linkMode.fromId) : undefined;
  const linkPreviewAnchor = useMemo(() => {
    if (!linkMode || !linkSourceRect) return null;
    const from = offsetRect(linkSourceRect);
    if (linkMode.edgeType === "solved_by") {
      return { x: from.x + from.width, y: from.y + from.height / 2 };
    }
    return { x: from.x + from.width / 2, y: from.y + from.height };
  }, [linkMode, linkSourceRect]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const isZoomGesture = event.ctrlKey || event.metaKey;

      if (isZoomGesture) {
        const rect = el.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const factor = Math.exp(-event.deltaY * 0.002);
        setZoom((currentZoom) => {
          const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * factor));
          if (nextZoom === currentZoom) return currentZoom;
          const scale = nextZoom / currentZoom;
          setPan((currentPan) => ({
            x: pointerX - scale * (pointerX - currentPan.x),
            y: pointerY - scale * (pointerY - currentPan.y),
          }));
          return nextZoom;
        });
        return;
      }

      setPan((currentPan) => ({
        x: currentPan.x - event.deltaX,
        y: currentPan.y - event.deltaY,
      }));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handlePointerDownBackground = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      if (linkMode) {
        onCancelLink();
        return;
      }
      onSelectEdge(null);
      onSelectNode(null);
      dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [linkMode, onCancelLink, onSelectEdge, onSelectNode, pan.x, pan.y],
  );

  const handlePointerMoveBackground = useCallback(
    (event: React.PointerEvent) => {
      const el = containerRef.current;
      if (el && linkMode) {
        const rect = el.getBoundingClientRect();
        setCursor({
          x: (event.clientX - rect.left - pan.x) / zoom,
          y: (event.clientY - rect.top - pan.y) / zoom,
        });
      }
      const drag = dragRef.current;
      if (!drag) return;
      setPan({
        x: drag.panX + (event.clientX - drag.x),
        y: drag.panY + (event.clientY - drag.y),
      });
    },
    [linkMode, pan.x, pan.y, zoom],
  );

  const handlePointerUpBackground = useCallback((event: React.PointerEvent) => {
    if (dragRef.current) {
      dragRef.current = null;
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (linkMode) {
        if (isValidConnection(document, linkMode.fromId, nodeId, linkMode.edgeType)) {
          onConnect(linkMode.fromId, nodeId, linkMode.edgeType);
        }
        return;
      }
      onSelectEdge(null);
      onSelectNode(nodeId);
    },
    [document, linkMode, onConnect, onSelectEdge, onSelectNode],
  );

  const handleEdgeClick = useCallback(
    (edgeId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      if (linkMode) return;
      onSelectNode(null);
      onSelectEdge(edgeId);
    },
    [linkMode, onSelectEdge, onSelectNode],
  );

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const scale = Math.min((vw - 80) / layout.width, (vh - 80) / layout.height, 1);
    setZoom(Math.max(MIN_ZOOM, scale));
    setPan({
      x: Math.max(24, (vw - layout.width * scale) / 2),
      y: Math.max(24, (vh - layout.height * scale) / 2),
    });
  }, [layout.height, layout.width]);

  useEffect(() => {
    fitView();
  }, [layoutKey, fitView]);

  useEffect(() => {
    if (!linkMode) setCursor(null);
  }, [linkMode]);

  const selectedEdge = selectedEdgeId ? document.edges.find((e) => e.id === selectedEdgeId) : undefined;
  const selectedEdgeMid =
    selectedEdge && layout.nodes.get(selectedEdge.from) && layout.nodes.get(selectedEdge.to)
      ? edgeMidpoint(
          offsetRect(layout.nodes.get(selectedEdge.from)!),
          offsetRect(layout.nodes.get(selectedEdge.to)!),
          selectedEdge,
          layout.edgePorts.get(selectedEdge.id),
        )
      : null;

  const previewFrom = linkPreviewAnchor;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f8f7f4]">
      {linkMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-accent-link/25 bg-bg-card px-4 py-1.5 text-xs text-text-primary shadow-sm">
          {linkMode.reassignEdgeId
            ? t("canvas.graph.reassignHint")
            : linkMode.edgeType === "because"
              ? t("canvas.graph.linkBecauseHint")
              : t("canvas.graph.linkSolutionHint")}
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-20 flex gap-1">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300/80 bg-bg-card text-text-muted shadow-sm hover:bg-bg-hover"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.15))}
          title={t("canvas.graph.zoomIn")}
        >
          <i className="fa-solid fa-plus text-xs" aria-hidden />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300/80 bg-bg-card text-text-muted shadow-sm hover:bg-bg-hover"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.15))}
          title={t("canvas.graph.zoomOut")}
        >
          <i className="fa-solid fa-minus text-xs" aria-hidden />
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-lg border border-stone-300/80 bg-bg-card px-2 text-2xs text-text-muted shadow-sm hover:bg-bg-hover"
          onClick={fitView}
        >
          {t("canvas.graph.fitView")}
        </button>
      </div>

      <div
        ref={containerRef}
        className={`min-h-0 flex-1 overflow-hidden ${linkMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        onPointerDown={handlePointerDownBackground}
        onPointerMove={handlePointerMoveBackground}
        onPointerUp={handlePointerUpBackground}
      >
        {document.nodes.length === 0 && (
          <button
            type="button"
            className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-dashed border-accent-link/30 bg-bg-card/90 px-8 py-6 text-center shadow-sm hover:border-accent-link/50 hover:bg-bg-card"
            onClick={onAddRootProblem}
          >
            <p className="text-sm font-medium text-text-primary">{t("canvas.graph.emptyClick")}</p>
            <p className="mt-1 text-2xs text-text-muted">{t("canvas.graph.emptyHint")}</p>
          </button>
        )}

        <div
          className="relative origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <DepthLanes layout={layout} />

          <svg
            className="pointer-events-none absolute inset-0 z-0 overflow-visible"
            width={layout.width}
            height={layout.height}
          >
            {linkMode && previewFrom && cursor && (
              <line
                x1={previewFrom.x}
                y1={previewFrom.y}
                x2={cursor.x}
                y2={cursor.y}
                stroke={linkMode.edgeType === "because" ? palette.accent.link : "#d97706"}
                strokeWidth={2}
                strokeDasharray="6 4"
                opacity={0.7}
              />
            )}
            <CanvasEdgePaths
              edges={renderEdges}
              layout={layout}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              hoverEdgeId={hoverEdgeId}
              focusIds={focusIds}
            />
          </svg>

          {document.nodes.map((node) => {
            const rect = layout.nodes.get(node.id);
            if (!rect) return null;
            const r = offsetRect(rect);
            const depth = node.type === "problem" ? layout.depths.get(node.id) : undefined;
            const dimmed =
              focusIds !== null && selectedNodeId !== null && !focusIds.has(node.id);
            return (
              <div
                key={node.id}
                className={`relative z-10 transition-opacity ${dimmed ? "opacity-30" : "opacity-100"}`}
                onMouseEnter={() => setHoverNodeId(node.id)}
                onMouseLeave={() => setHoverNodeId((id) => (id === node.id ? null : id))}
              >
                <CanvasGraphNode
                  node={node}
                  depth={depth}
                  selected={selectedNodeId === node.id}
                  missingSolution={node.type === "problem" && problemNeedsSolution(graphIndex, node.id)}
                  canLinkSolution={node.type === "problem" && isLeafProblem(graphIndex, node.id)}
                  editing={editingNodeId === node.id}
                  linkSource={linkMode?.fromId === node.id}
                  linkTarget={
                    Boolean(
                      linkMode &&
                        hoverNodeId === node.id &&
                        isValidConnection(document, linkMode.fromId, node.id, linkMode.edgeType),
                    )
                  }
                  showInlineActions={false}
                  left={r.x}
                  top={r.y}
                  width={r.width}
                  height={r.height}
                  onSelect={() => handleNodeClick(node.id)}
                  onStartEdit={() => onStartEditNode(node.id)}
                  onTitleChange={(title) => onUpdateNodeTitle(node.id, title)}
                  onEndEdit={onEndEditNode}
                  onStartLinkBecause={() => onStartLinkBecause(node.id)}
                  onStartLinkSolution={() => onStartLinkSolution(node.id)}
                  onAddWhy={() => onAddWhy(node.id)}
                  onAddSolution={() => onAddSolution(node.id)}
                  onDelete={() => onDeleteNode(node.id)}
                />
              </div>
            );
          })}

          <svg
            className="absolute inset-0 z-20 overflow-visible"
            width={layout.width}
            height={layout.height}
            style={{ pointerEvents: "none" }}
          >
            {renderEdges.map((edge) => {
              const fromRect = layout.nodes.get(edge.from);
              const toRect = layout.nodes.get(edge.to);
              if (!fromRect || !toRect) return null;
              const from = offsetRect(fromRect);
              const to = offsetRect(toRect);
              const ports = layout.edgePorts.get(edge.id);
              const d = edgePathD(from, to, edge.type, ports);
              return (
                <path
                  key={edge.id}
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={24}
                  className="cursor-pointer"
                  style={{ pointerEvents: linkMode ? "none" : "stroke" }}
                  onMouseEnter={() => setHoverEdgeId(edge.id)}
                  onMouseLeave={() => setHoverEdgeId((id) => (id === edge.id ? null : id))}
                  onClick={(e) => handleEdgeClick(edge.id, e)}
                />
              );
            })}
          </svg>

          {selectedEdge && selectedEdgeMid && (
            <CanvasEdgeToolbar
              x={selectedEdgeMid.x}
              y={selectedEdgeMid.y}
              edgeType={selectedEdge.type}
              onReassign={() => onReassignEdge(selectedEdge.id)}
              onDelete={() => onDeleteEdge(selectedEdge.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
