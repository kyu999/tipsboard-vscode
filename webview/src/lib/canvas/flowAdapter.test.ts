import { describe, expect, it } from "vitest";
import {
  canvasDocumentToFlow,
  flowToCanvasDocument,
  getBlockedConnectionSidesForNode,
  isConnectStartOnSelectedEdgeEndpoint,
  isConnectionTouchingSelectedEdgeEndpoint,
  isNewConnectionFromSelectedEdgeEndpoint,
} from "./flowAdapter";
import type { CanvasDocument } from "@/types";

const sampleDoc: CanvasDocument = {
  version: 1,
  viewport: { zoom: 1.5, panX: 100, panY: -50 },
  nodes: [
    { id: "t1", type: "text", text: "Hello", x: 10, y: 20, width: 300, height: 120 },
    { id: "n1", type: "note", path: "docs/a.md", x: 400, y: 20, width: 280, height: 200 },
    { id: "g1", type: "group", label: "Section", x: 0, y: 0, width: 600, height: 400 },
    { id: "t2", type: "text", text: "Inside", x: 20, y: 40, width: 200, height: 80, parentId: "g1" },
  ],
  edges: [
    {
      id: "e1",
      fromNode: "t1",
      toNode: "n1",
      fromSide: "right",
      toSide: "left",
      label: "connects",
      fromEnd: "arrow",
    },
  ],
};

describe("flowAdapter", () => {
  it("round-trips canvas document through flow representation", () => {
    const flow = canvasDocumentToFlow(sampleDoc);
    expect(flow.nodes).toHaveLength(4);
    expect(flow.edges).toHaveLength(1);
    expect(flow.viewport).toEqual({ x: 100, y: -50, zoom: 1.5 });

    const noteNode = flow.nodes.find((n) => n.id === "n1");
    expect(noteNode?.type).toBe("note");
    expect(noteNode?.data.path).toBe("docs/a.md");

    const child = flow.nodes.find((n) => n.id === "t2");
    expect(child?.parentId).toBe("g1");
    expect(child?.extent).toBe("parent");

    const edge = flow.edges[0];
    expect(edge?.sourceHandle).toBe("source-right");
    expect(edge?.targetHandle).toBe("target-left");
    expect(edge?.type).toBe("canvasLabeled");
    expect(edge?.data).toEqual({ label: "connects", fromEnd: "arrow", toEnd: "arrow" }); // toEnd resolved to default
    expect(edge?.markerStart).toEqual({ type: "arrowclosed" });
    expect(edge?.markerEnd).toEqual({ type: "arrowclosed" });

    const restored = flowToCanvasDocument(flow.nodes, flow.edges, flow.viewport);
    expect(restored).toEqual(sampleDoc);
  });

  it("persists NodeResizer dimensions over stale style values", () => {
    const flow = canvasDocumentToFlow(sampleDoc);
    const group = flow.nodes.find((n) => n.id === "g1");
    expect(group).toBeDefined();

    const resizedGroup = {
      ...group!,
      width: 800,
      height: 500,
      style: { width: 600, height: 400 },
    };

    const restored = flowToCanvasDocument(
      flow.nodes.map((node) => (node.id === "g1" ? resizedGroup : node)),
      flow.edges,
      flow.viewport,
    );

    const savedGroup = restored.nodes.find((node) => node.id === "g1");
    expect(savedGroup?.width).toBe(800);
    expect(savedGroup?.height).toBe(500);
  });

  it("blocks new connections only from selected edge endpoint sides", () => {
    const edges = [
      {
        id: "e1",
        selected: true,
        source: "t1",
        target: "n1",
        sourceHandle: "source-right",
        targetHandle: "target-left",
      },
      {
        id: "e2",
        selected: false,
        source: "t1",
        target: "g1",
        sourceHandle: "source-bottom",
        targetHandle: "target-top",
      },
    ];

    expect(getBlockedConnectionSidesForNode("t1", edges)).toEqual(new Set(["right"]));
    expect(getBlockedConnectionSidesForNode("n1", edges)).toEqual(new Set(["left"]));
    expect(getBlockedConnectionSidesForNode("g1", edges)).toEqual(new Set());

    expect(
      isNewConnectionFromSelectedEdgeEndpoint(
        { source: "t1", sourceHandle: "source-right" },
        edges,
      ),
    ).toBe(true);
    expect(
      isNewConnectionFromSelectedEdgeEndpoint(
        { source: "t1", sourceHandle: "source-bottom" },
        edges,
      ),
    ).toBe(false);
    expect(
      isNewConnectionFromSelectedEdgeEndpoint(
        { source: "n1", sourceHandle: "target-left" },
        edges,
      ),
    ).toBe(true);
    expect(
      isConnectionTouchingSelectedEdgeEndpoint(
        { target: "n1", targetHandle: "target-left" },
        edges,
      ),
    ).toBe(true);
  });
});
