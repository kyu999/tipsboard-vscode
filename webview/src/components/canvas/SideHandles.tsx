import { Handle, Position, useNodeId, useStore } from "@xyflow/react";
import { useCallback } from "react";
import {
  getBlockedConnectionSidesForNode,
  sideToSourceHandle,
  sideToTargetHandle,
} from "@/lib/canvas/flowAdapter";

const SIDES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

export function SideHandles() {
  const nodeId = useNodeId();
  const blockedSides = useStore(
    useCallback(
      (state) => getBlockedConnectionSidesForNode(nodeId ?? "", state.edges),
      [nodeId],
    ),
  );

  return (
    <>
      {SIDES.map(({ id, position }) => {
        if (blockedSides.has(id)) {
          return null;
        }

        return (
          <span key={id} className="contents">
            <Handle
              id={sideToSourceHandle(id)}
              type="source"
              position={position}
              className="!h-2 !w-2 !border !border-accent-link/40 !bg-bg-card"
            />
            <Handle
              id={sideToTargetHandle(id)}
              type="target"
              position={position}
              className="!h-2 !w-2 !border !border-accent-link/40 !bg-bg-card"
            />
          </span>
        );
      })}
    </>
  );
}
