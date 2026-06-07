import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnConnectStart,
  type OnReconnect,
  type Viewport,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { CanvasBoardContext } from "@/components/canvas/canvasContext";
import { CanvasFlowControls } from "@/components/canvas/CanvasFlowControls";
import { canvasNodeTypes } from "@/components/canvas/canvasNodeTypes";
import { useCanvasPanMode } from "@/components/canvas/useCanvasPanMode";
import {
  canvasDocumentToFlow,
  createCanvasEdgeId,
  flowToCanvasDocument,
  isConnectStartOnSelectedEdgeEndpoint,
  isConnectionTouchingSelectedEdgeEndpoint,
  sideToSourceHandle,
  sideToTargetHandle,
  type CanvasFlowNode,
} from "@/lib/canvas/flowAdapter";
import type { CanvasDocument, NoteSummary } from "@/types";

interface CanvasBoardInnerProps {
  document: CanvasDocument;
  notesByPath: Map<string, NoteSummary>;
  onSelectNote: (path: string) => void;
  onDocumentChange: (document: CanvasDocument) => void;
  registerAddNode: (fn: (type: AddCanvasNodeKind, payload?: AddCanvasNodePayload) => void) => void;
}

export type AddCanvasNodeKind = "text" | "note" | "image" | "link" | "group";

export interface AddCanvasNodePayload {
  path?: string;
  url?: string;
  text?: string;
  label?: string;
}

const DEFAULT_SIZES: Record<AddCanvasNodeKind, { width: number; height: number }> = {
  text: { width: 280, height: 120 },
  note: { width: 320, height: 220 },
  image: { width: 280, height: 200 },
  link: { width: 260, height: 100 },
  group: { width: 420, height: 280 },
};

function withDefaultHandles(connection: Connection): Connection {
  return {
    ...connection,
    sourceHandle: connection.sourceHandle ?? sideToSourceHandle("right"),
    targetHandle: connection.targetHandle ?? sideToTargetHandle("left"),
  };
}

function CanvasBoardInner({
  document,
  notesByPath,
  onSelectNote,
  onDocumentChange,
  registerAddNode,
}: CanvasBoardInnerProps) {
  const spacePan = useCanvasPanMode();
  const { screenToFlowPosition, setViewport, getViewport, cancelConnection } = useReactFlow();
  const flowSeed = useMemo(() => canvasDocumentToFlow(document), [document]);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<CanvasFlowNode>(flowSeed.nodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>(flowSeed.edges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  useEffect(() => {
    const flow = canvasDocumentToFlow(document);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    void setViewport(flow.viewport);
  }, [document, setEdges, setNodes, setViewport]);

  const emitDocument = useCallback(
    (nextNodes: CanvasFlowNode[], nextEdges: Edge[], viewport?: Viewport) => {
      const vp = viewport ?? getViewport();
      onDocumentChange(flowToCanvasDocument(nextNodes, nextEdges, vp));
    },
    [getViewport, onDocumentChange],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasFlowNode>[]) => {
      onNodesChangeBase(changes);
      const nextNodes = applyNodeChanges(changes, nodesRef.current);
      emitDocument(nextNodes, edgesRef.current);
    },
    [emitDocument, onNodesChangeBase],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChangeBase(changes);
      const nextEdges = applyEdgeChanges(changes, edgesRef.current);
      emitDocument(nodesRef.current, nextEdges);
    },
    [emitDocument, onEdgesChangeBase],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (isConnectionTouchingSelectedEdgeEndpoint(connection, edgesRef.current)) {
        return;
      }
      setEdges((current) => {
        const next = addEdge(
          {
            ...withDefaultHandles(connection),
            id: createCanvasEdgeId(),
          },
          current,
        );
        emitDocument(nodesRef.current, next);
        return next;
      });
    },
    [emitDocument, setEdges],
  );

  const onConnectStart: OnConnectStart = useCallback(
    (_event, params) => {
      if (isConnectStartOnSelectedEdgeEndpoint(params, edgesRef.current)) {
        cancelConnection();
      }
    },
    [cancelConnection],
  );

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    return !isConnectionTouchingSelectedEdgeEndpoint(connection, edgesRef.current);
  }, []);

  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      setEdges((current) => {
        const next = reconnectEdge(oldEdge, withDefaultHandles(newConnection), current, {
          shouldReplaceId: false,
        });
        emitDocument(nodesRef.current, next);
        return next;
      });
    },
    [emitDocument, setEdges],
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((current) => {
        const next = current.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node,
        );
        emitDocument(next, edgesRef.current);
        return next;
      });
    },
    [emitDocument, setNodes],
  );

  const addNode = useCallback(
    (type: AddCanvasNodeKind, payload: AddCanvasNodePayload = {}) => {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const size = DEFAULT_SIZES[type];
      const id = `node-${crypto.randomUUID()}`;
      const selectedGroup = nodes.find((n) => n.selected && n.type === "group");

      const base: CanvasFlowNode = {
        id,
        type,
        position: {
          x: center.x - size.width / 2,
          y: center.y - size.height / 2,
        },
        style: { width: size.width, height: size.height },
        data: {},
        selected: true,
      };

      if (selectedGroup) {
        base.parentId = selectedGroup.id;
        base.extent = "parent";
        base.position = {
          x: 40,
          y: 40,
        };
      }

      switch (type) {
        case "text":
          base.data = { text: payload.text ?? "" };
          break;
        case "note":
          base.data = { path: payload.path ?? "" };
          break;
        case "image":
          base.data = { path: payload.path ?? "" };
          break;
        case "link":
          base.data = { url: payload.url ?? "https://" };
          break;
        case "group":
          base.data = { label: payload.label ?? "" };
          base.zIndex = -1;
          break;
      }

      setNodes((current) => {
        const next = [...current.map((n) => ({ ...n, selected: false })), base];
        emitDocument(next, edgesRef.current);
        return next;
      });
    },
    [emitDocument, nodes, screenToFlowPosition, setNodes],
  );

  useEffect(() => {
    registerAddNode(addNode);
  }, [addNode, registerAddNode]);

  const contextValue = useMemo(
    () => ({
      notesByPath,
      onSelectNote,
      updateNodeData,
    }),
    [notesByPath, onSelectNote, updateNodeData],
  );

  return (
    <CanvasBoardContext.Provider value={contextValue}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={canvasNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        isValidConnection={isValidConnection}
        onReconnect={onReconnect}
        elevateEdgesOnSelect
        reconnectRadius={18}
        panOnDrag={spacePan ? true : [1, 2]}
        panOnScroll
        panOnScrollMode="free"
        zoomOnScroll={false}
        zoomOnPinch
        zoomActivationKeyCode={["Control", "Meta"]}
        selectionOnDrag
        selectionKeyCode={["Meta", "Control"]}
        multiSelectionKeyCode={["Meta", "Control"]}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView={false}
        defaultViewport={flowSeed.viewport}
        onMoveEnd={(_event, viewport) => {
          emitDocument(nodes, edges, viewport);
        }}
        proOptions={{ hideAttribution: true }}
        className={`tb-canvas-flow${spacePan ? " tb-canvas-flow--pan-mode" : ""}`}
      >
        <Background gap={20} size={1} />
        <CanvasFlowControls />
      </ReactFlow>
    </CanvasBoardContext.Provider>
  );
}

interface CanvasBoardProps {
  document: CanvasDocument;
  notesByPath: Map<string, NoteSummary>;
  onSelectNote: (path: string) => void;
  onDocumentChange: (document: CanvasDocument) => void;
  registerAddNode: (fn: (type: AddCanvasNodeKind, payload?: AddCanvasNodePayload) => void) => void;
}

export function CanvasBoard(props: CanvasBoardProps) {
  return (
    <ReactFlowProvider>
      <div className="relative min-h-0 flex-1">
        <CanvasBoardInner {...props} />
      </div>
    </ReactFlowProvider>
  );
}
