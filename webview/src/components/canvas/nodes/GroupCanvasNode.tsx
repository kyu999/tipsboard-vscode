import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useCanvasBoardContext } from "@/components/canvas/canvasContext";
import { useCanvasNodeEditMode } from "@/components/canvas/useCanvasNodeEditMode";
import type { CanvasFlowNodeData } from "@/lib/canvas/flowAdapter";

function GroupCanvasNodeComponent({ id, data, selected }: NodeProps<{ data: CanvasFlowNodeData }>) {
  const { updateNodeData } = useCanvasBoardContext();
  const [label, setLabel] = useState(data.label ?? "");
  const { editing, beginEditing, endEditing, blockDragWhileEditing } = useCanvasNodeEditMode();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(data.label ?? "");
  }, [data.label]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    updateNodeData(id, { label });
    endEditing();
  }, [endEditing, id, label, updateNodeData]);

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={200} minHeight={160} />
      <div className="tb-canvas-node-group-inner h-full w-full">
        <input
          ref={inputRef}
          className={`absolute left-3 top-2 max-w-[calc(100%-1.5rem)] border-0 bg-transparent text-sm font-semibold text-text-primary outline-none${editing ? " nodrag" : ""}`}
          value={label}
          placeholder="Group"
          readOnly={!editing}
          onChange={(event) => setLabel(event.target.value)}
          onDoubleClick={beginEditing}
          onBlur={commit}
          onPointerDown={blockDragWhileEditing}
        />
      </div>
    </>
  );
}

export const GroupCanvasNode = memo(GroupCanvasNodeComponent);
