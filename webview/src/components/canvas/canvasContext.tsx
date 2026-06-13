import { createContext, useContext } from "react";
import type { CanvasEdge, NoteSummary } from "@/types";

export interface CanvasBoardContextValue {
  notesByPath: Map<string, NoteSummary>;
  onSelectNote: (path: string) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  updateEdge: (edgeId: string, patch: Partial<Pick<CanvasEdge, "label" | "fromEnd" | "toEnd">>) => void;
}

export const CanvasBoardContext = createContext<CanvasBoardContextValue | null>(null);

export function useCanvasBoardContext(): CanvasBoardContextValue {
  const ctx = useContext(CanvasBoardContext);
  if (!ctx) throw new Error("CanvasBoardContext missing");
  return ctx;
}

export function formatNotePreview(preview: string): string {
  return preview
    .replace(/(?<!\\)\[image:\S+\]/g, "")
    .replace(/(?<!\\)\[([^\[\]\n]+?)\.icon(?:\*\d+)?\]/g, "$1")
    .replace(/(?<!\\)\[([^\[\]\n]+?)\s+https?:\/\/\S+\]/g, "$1")
    .replace(/(?<!\\)\[([^\[\]\n]+?)\](?!\()/g, "$1")
    .trim();
}
