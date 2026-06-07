import { memo, useCallback } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { SideHandles } from "@/components/canvas/SideHandles";
import { formatNotePreview, useCanvasBoardContext } from "@/components/canvas/canvasContext";
import type { CanvasFlowNodeData } from "@/lib/canvas/flowAdapter";

function NoteCanvasNodeComponent({ data, selected }: NodeProps<{ data: CanvasFlowNodeData }>) {
  const { notesByPath, onSelectNote } = useCanvasBoardContext();
  const path = data.path ?? "";
  const note = notesByPath.get(path);
  const title = note?.title ?? (path || "Note");
  const preview = note ? formatNotePreview(note.preview) : "";

  const openNote = useCallback(() => {
    if (path) onSelectNote(path);
  }, [onSelectNote, path]);

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={180} minHeight={120} />
      <SideHandles />
      <div
        className="tb-canvas-node tb-canvas-node-note flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-accent-link/25 bg-bg-card shadow-soft"
        onDoubleClick={openNote}
        title={path}
      >
        <div className="border-b border-stone-200/80 px-3 py-2 text-sm font-semibold text-text-primary">
          {title}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-3 py-2 text-xs leading-relaxed text-text-muted">
          {preview || (note ? note.body.split("\n").slice(1, 6).join("\n") : "Missing note")}
        </div>
        {note && (
          <div className="border-t border-stone-200/60 px-3 py-1 text-[10px] text-text-muted">
            {new Date(note.updatedAt).toLocaleString()}
          </div>
        )}
      </div>
    </>
  );
}

export const NoteCanvasNode = memo(NoteCanvasNodeComponent);
