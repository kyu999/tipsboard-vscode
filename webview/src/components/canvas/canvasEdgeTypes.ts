import type { EdgeTypes } from "@xyflow/react";
import { CanvasLabeledEdge } from "@/components/canvas/edges/CanvasLabeledEdge";

export const canvasEdgeTypes = {
  canvasLabeled: CanvasLabeledEdge,
} satisfies EdgeTypes;
