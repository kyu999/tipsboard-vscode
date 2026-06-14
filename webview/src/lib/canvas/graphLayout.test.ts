import { describe, expect, it } from "vitest";
import type { CanvasDocument } from "@/types";
import {
  computeGraphLayout,
  computeEdgeGeometry,
  edgeAnchor,
  measureNodeHeight,
  MIN_NODE_GAP,
  type LayoutRect,
} from "./graphLayout";

const doc: CanvasDocument = {
  version: 1,
  nodes: [
    { id: "p1", type: "problem", title: "A" },
    { id: "p2", type: "problem", title: "B" },
    { id: "s1", type: "solution", title: "Fix" },
  ],
  edges: [
    { id: "e1", from: "p1", to: "p2", type: "because" },
    { id: "e2", from: "p2", to: "s1", type: "solved_by" },
  ],
};

function rectsOverlap(a: LayoutRect, b: LayoutRect, gap = MIN_NODE_GAP): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function expectNoOverlaps(layout: ReturnType<typeof computeGraphLayout>): void {
  const rects = [...layout.nodes.values()];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      expect(rectsOverlap(rects[i]!, rects[j]!)).toBe(false);
    }
  }
}

describe("computeGraphLayout", () => {
  it("places deeper problems below parents", () => {
    const layout = computeGraphLayout(doc);
    const p1 = layout.nodes.get("p1");
    const p2 = layout.nodes.get("p2");
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect((p2?.y ?? 0) > (p1?.y ?? 0)).toBe(true);
  });

  it("returns non-zero canvas size", () => {
    const layout = computeGraphLayout(doc);
    expect(layout.width).toBeGreaterThan(200);
    expect(layout.height).toBeGreaterThan(200);
  });

  it("grows node height for long titles", () => {
    const short = measureNodeHeight("A");
    const long = measureNodeHeight("これは長いタイトルで複数行に折り返されることを想定したテスト用の文字列です");
    expect(long).toBeGreaterThan(short);
    const layout = computeGraphLayout({
      ...doc,
      nodes: [{ id: "p1", type: "problem", title: "これは長いタイトルで複数行に折り返されることを想定したテスト用の文字列です" }],
      edges: [],
    });
    const p1 = layout.nodes.get("p1");
    expect(p1?.height).toBeGreaterThan(short);
  });

  it("separates parallel because children horizontally", () => {
    const stacked: CanvasDocument = {
      version: 1,
      nodes: [
        { id: "p1", type: "problem", title: "Root" },
        { id: "p2", type: "problem", title: "Child" },
        { id: "p3", type: "problem", title: "Grandchild" },
      ],
      edges: [
        { id: "e1", from: "p1", to: "p2", type: "because" },
        { id: "e2", from: "p1", to: "p3", type: "because" },
      ],
    };
    const layout = computeGraphLayout(stacked);
    const p2 = layout.nodes.get("p2");
    const p3 = layout.nodes.get("p3");
    expect(p2).toBeDefined();
    expect(p3).toBeDefined();
    expect((p2?.x ?? 0) !== (p3?.x ?? 0)).toBe(true);
    expectNoOverlaps(layout);

    const from = layout.nodes.get("p1");
    const toChild = layout.nodes.get("p2");
    const toGrand = layout.nodes.get("p3");
    expect(from && toChild && toGrand).toBeTruthy();
    const childAnchor = edgeAnchor(from!, toChild!, "because", layout.edgePorts.get("e1"));
    const grandAnchor = edgeAnchor(from!, toGrand!, "because", layout.edgePorts.get("e2"));
    expect(childAnchor.x1).toBeGreaterThan(from!.x);
    expect(childAnchor.x1).toBeLessThan(from!.x + from!.width);
    expect(grandAnchor.x1).not.toBe(childAnchor.x1);
    const childPath = computeEdgeGeometry(from!, toChild!, "because", 1, layout.edgePorts.get("e1"));
    const grandPath = computeEdgeGeometry(from!, toGrand!, "because", 1, layout.edgePorts.get("e2"));
    expect(childPath.pathD).toMatch(/^M [\d.]+ [\d.]+/);
    expect(grandPath.pathD).toMatch(/^M [\d.]+ [\d.]+/);
  });

  it("resolves node overlaps after layout", () => {
    expectNoOverlaps(computeGraphLayout(doc));
  });

  it("anchors because edges at node centers", () => {
    const layout = computeGraphLayout(doc);
    const from = layout.nodes.get("p1");
    const to = layout.nodes.get("p2");
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    const anchor = edgeAnchor(from!, to!, "because", layout.edgePorts.get("e1"));
    expect(anchor.y1).toBe(from!.y + from!.height);
    expect(anchor.y2).toBe(to!.y);
    const geom = computeEdgeGeometry(from!, to!, "because", 1, layout.edgePorts.get("e1"));
    expect(geom.pathD).toMatch(/^M [\d.]+ [\d.]+/);
    expect(geom.tangentY).toBeGreaterThan(0.9);
  });

  it("anchors solved_by edges at side centers", () => {
    const layout = computeGraphLayout(doc);
    const from = layout.nodes.get("p2");
    const to = layout.nodes.get("s1");
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    const anchor = edgeAnchor(from!, to!, "solved_by");
    expect(anchor.x1).toBe(from!.x + from!.width);
    expect(anchor.x2).toBe(to!.x);
    const geom = computeEdgeGeometry(from!, to!, "solved_by", 1, layout.edgePorts.get("e2"));
    expect(geom.pathD).toMatch(/^M [\d.]+ [\d.]+/);
    expect(geom.tangentX).toBeGreaterThan(0.9);
  });

  it("does not hang when because edges contain a cycle", () => {
    const cyclic: CanvasDocument = {
      version: 1,
      nodes: [
        { id: "p1", type: "problem", title: "A" },
        { id: "p2", type: "problem", title: "B" },
      ],
      edges: [
        { id: "e1", from: "p1", to: "p2", type: "because" },
        { id: "e2", from: "p2", to: "p1", type: "because" },
      ],
    };
    const layout = computeGraphLayout(cyclic);
    expect(layout.nodes.size).toBe(2);
  });
});
