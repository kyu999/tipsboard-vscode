import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { SideHandles } from "@/components/canvas/SideHandles";
import { useCanvasBoardContext } from "@/components/canvas/canvasContext";
import { useCanvasNodeEditMode } from "@/components/canvas/useCanvasNodeEditMode";
import type { CanvasFlowNodeData } from "@/lib/canvas/flowAdapter";

function TextCanvasNodeComponent({ id, data, selected }: NodeProps<{ data: CanvasFlowNodeData }>) {
  const { updateNodeData } = useCanvasBoardContext();
  const [text, setText] = useState(data.text ?? "");
  const { editing, beginEditing, endEditing, blockDragWhileEditing } = useCanvasNodeEditMode();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(data.text ?? "");
  }, [data.text]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    updateNodeData(id, { text });
    endEditing();
  }, [endEditing, id, text, updateNodeData]);

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={120} minHeight={60} />
      <SideHandles />
      <div className="tb-canvas-node tb-canvas-node-text h-full w-full overflow-hidden rounded-xl border border-stone-300/80 bg-bg-card shadow-soft">
        <textarea
          ref={inputRef}
          className={`h-full w-full resize-none border-0 bg-transparent p-3 text-sm leading-relaxed text-text-primary outline-none${editing ? " nodrag" : ""}`}
          value={text}
          placeholder="Text"
          readOnly={!editing}
          onChange={(event) => setText(event.target.value)}
          onDoubleClick={beginEditing}
          onBlur={commit}
          onPointerDown={blockDragWhileEditing}
        />
      </div>
    </>
  );
}

export const TextCanvasNode = memo(TextCanvasNodeComponent);
