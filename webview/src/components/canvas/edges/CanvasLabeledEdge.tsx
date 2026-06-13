import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCanvasBoardContext } from "@/components/canvas/canvasContext";
import {
  resolveEdgeFromEnd,
  resolveEdgeToEnd,
  type CanvasFlowEdgeData,
} from "@/lib/canvas/flowAdapter";

const EDGE_CONTROL_Z = 2000;

function outgoingAngleAtSource(position: Position): number {
  switch (position) {
    case Position.Right:
      return 0;
    case Position.Bottom:
      return 90;
    case Position.Left:
      return 180;
    case Position.Top:
      return -90;
    default:
      return 0;
  }
}

function incomingAngleAtTarget(position: Position): number {
  switch (position) {
    case Position.Left:
      return 0;
    case Position.Right:
      return 180;
    case Position.Top:
      return 90;
    case Position.Bottom:
      return -90;
    default:
      return 0;
  }
}

function offsetAlongAngle(
  x: number,
  y: number,
  angleDeg: number,
  distance: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: x + Math.cos(rad) * distance,
    y: y + Math.sin(rad) * distance,
  };
}

function stopFlowEvent(event: PointerEvent | MouseEvent) {
  event.stopPropagation();
}

export function CanvasLabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  markerStart,
  selected,
  zIndex,
  data,
}: EdgeProps) {
  const { t } = useTranslation();
  const { updateEdge } = useCanvasBoardContext();
  const edgeData = (data ?? {}) as CanvasFlowEdgeData;
  const label = edgeData.label ?? "";
  const fromEnd = resolveEdgeFromEnd(edgeData.fromEnd);
  const toEnd = resolveEdgeToEnd(edgeData.toEnd);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const sourceAngle = outgoingAngleAtSource(sourcePosition);
  const targetAngle = incomingAngleAtTarget(targetPosition);
  const sourceControl = offsetAlongAngle(sourceX, sourceY, sourceAngle, 28);
  const targetControl = offsetAlongAngle(targetX, targetY, targetAngle + 180, 28);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [label, editing]);

  useEffect(() => {
    if (!editing) return;
    skipBlurRef.current = true;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
      requestAnimationFrame(() => {
        skipBlurRef.current = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const commit = useCallback(() => {
    const next = draft.trim();
    updateEdge(id, { label: next.length > 0 ? next : "" });
    setEditing(false);
  }, [draft, id, updateEdge]);

  const cancel = useCallback(() => {
    setDraft(label);
    setEditing(false);
  }, [label]);

  const startEditing = useCallback(() => {
    setDraft(label);
    setEditing(true);
  }, [label]);

  const showLabelArea = Boolean(selected) || label.length > 0;
  const isSelected = Boolean(selected);
  const controlZ = (zIndex ?? 0) + EDGE_CONTROL_Z;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={isSelected ? 0 : 20}
      />
      <EdgeLabelRenderer>
        {isSelected && (
          <>
            <EdgeEndToggle
              x={sourceControl.x}
              y={sourceControl.y}
              angle={sourceAngle}
              zIndex={controlZ}
              active={fromEnd === "arrow"}
              label={t("canvas.edges.arrowFrom")}
              onToggle={() =>
                updateEdge(id, { fromEnd: fromEnd === "arrow" ? "none" : "arrow" })
              }
            />
            <EdgeEndToggle
              x={targetControl.x}
              y={targetControl.y}
              angle={targetAngle}
              zIndex={controlZ}
              active={toEnd === "arrow"}
              label={t("canvas.edges.arrowTo")}
              onToggle={() => updateEdge(id, { toEnd: toEnd === "arrow" ? "none" : "arrow" })}
            />
          </>
        )}
        {showLabelArea && (
          <div
            className="nodrag nopan nowheel tb-canvas-edge-control absolute"
            style={{
              zIndex: controlZ,
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onPointerDown={stopFlowEvent}
            onMouseDown={stopFlowEvent}
          >
            {editing ? (
              <input
                ref={inputRef}
                className="tb-canvas-edge-label-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                  if (skipBlurRef.current) return;
                  commit();
                }}
                onPointerDown={stopFlowEvent}
                onMouseDown={stopFlowEvent}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancel();
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className={`tb-canvas-edge-label${label.length === 0 ? " tb-canvas-edge-label--placeholder" : ""}`}
                onPointerDown={(event) => {
                  stopFlowEvent(event);
                  startEditing();
                }}
              >
                {label.length > 0 ? label : t("canvas.edges.addLabel")}
              </button>
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

function EdgeEndToggle({
  x,
  y,
  angle,
  zIndex,
  active,
  label,
  onToggle,
}: {
  x: number;
  y: number;
  angle: number;
  zIndex: number;
  active: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`nodrag nopan nowheel tb-canvas-edge-end-toggle tb-canvas-edge-control absolute${
        active ? " tb-canvas-edge-end-toggle--active" : ""
      }`}
      style={{
        zIndex,
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${angle}deg)`,
      }}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onPointerDown={(event) => {
        stopFlowEvent(event);
        onToggle();
      }}
    >
      <span className="tb-canvas-edge-end-toggle__icon" aria-hidden>
        <i className="fa-solid fa-arrow-right" />
      </span>
    </button>
  );
}
