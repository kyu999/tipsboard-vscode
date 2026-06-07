import { memo, useEffect, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { SideHandles } from "@/components/canvas/SideHandles";
import type { CanvasFlowNodeData } from "@/lib/canvas/flowAdapter";

function ImageCanvasNodeComponent({ data, selected }: NodeProps<{ data: CanvasFlowNodeData }>) {
  const path = data.path ?? "";
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!path) {
      setSrc("");
      return;
    }
    setSrc(window.tipsboardDesktop.resolveAssetUrl(path));
    void window.tipsboardDesktop.prefetchAssets([path]);
  }, [path]);

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={120} minHeight={80} keepAspectRatio />
      <SideHandles />
      <div className="tb-canvas-node tb-canvas-node-image flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-stone-300/80 bg-bg-card shadow-soft">
        {src ? (
          <img src={src} alt={path} className="max-h-full max-w-full object-contain" draggable={false} />
        ) : (
          <span className="px-3 text-xs text-text-muted">{path || "Image"}</span>
        )}
      </div>
    </>
  );
}

export const ImageCanvasNode = memo(ImageCanvasNodeComponent);
