import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { SideHandles } from "@/components/canvas/SideHandles";
import { useCanvasBoardContext } from "@/components/canvas/canvasContext";
import { useCanvasNodeEditMode } from "@/components/canvas/useCanvasNodeEditMode";
import { openExternalInHost } from "@/vscode-bridge-client";
import type { CanvasFlowNodeData } from "@/lib/canvas/flowAdapter";

function LinkCanvasNodeComponent({ id, data, selected }: NodeProps<{ data: CanvasFlowNodeData }>) {
  const { updateNodeData } = useCanvasBoardContext();
  const [url, setUrl] = useState(data.url ?? "");
  const { editing, beginEditing, endEditing, blockDragWhileEditing } = useCanvasNodeEditMode();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(data.url ?? "");
  }, [data.url]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    updateNodeData(id, { url });
    endEditing();
  }, [endEditing, id, url, updateNodeData]);

  const openLink = useCallback(() => {
    const trimmed = url.trim();
    if (trimmed) openExternalInHost(trimmed);
  }, [url]);

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={80} />
      <SideHandles />
      <div className="tb-canvas-node tb-canvas-node-link flex h-full w-full flex-col overflow-hidden rounded-xl border border-stone-300/80 bg-bg-card shadow-soft">
        <input
          ref={inputRef}
          className={`min-h-0 flex-1 border-0 bg-transparent px-3 py-2 text-xs text-text-primary outline-none${editing ? " nodrag" : ""}`}
          value={url}
          placeholder="https://example.com"
          readOnly={!editing}
          onChange={(event) => setUrl(event.target.value)}
          onDoubleClick={beginEditing}
          onBlur={commit}
          onPointerDown={blockDragWhileEditing}
        />
        <button
          type="button"
          className="shrink-0 border-t border-stone-200/70 px-3 py-2 text-left text-xs text-accent-link hover:bg-bg-hover"
          onClick={openLink}
        >
          {url.trim() || "Open link"}
        </button>
      </div>
    </>
  );
}

export const LinkCanvasNode = memo(LinkCanvasNodeComponent);
