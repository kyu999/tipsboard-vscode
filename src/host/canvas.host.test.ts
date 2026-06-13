import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CanvasDocument } from "../types/editor.js";
import {
  cleanupCanvasAfterNoteDelete,
  createCanvas,
  deleteCanvas,
  listCanvasSummaries,
  loadCanvas,
  patchCanvasNotePaths,
  pruneCanvasNoteNodes,
  sanitizeCanvasDocument,
  saveCanvas,
} from "./canvas.js";

async function withVault(run: (vaultPath: string) => Promise<void>): Promise<void> {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "tipsboard-vs-canvas-"));
  try {
    await run(vaultPath);
  } finally {
    await fs.rm(vaultPath, { recursive: true, force: true });
  }
}

const sampleDoc: CanvasDocument = {
  version: 1,
  viewport: { zoom: 1, panX: 0, panY: 0 },
  nodes: [
    { id: "n1", type: "note", path: "docs/a.md", x: 0, y: 0, width: 200, height: 120 },
    { id: "t1", type: "text", text: "Hello", x: 100, y: 100, width: 200, height: 80 },
  ],
  edges: [{ id: "e1", fromNode: "t1", toNode: "n1", fromSide: "right", toSide: "left" }],
};

describe("canvas host", () => {
  it("creates, loads, saves, lists, and deletes canvas files", async () => {
    await withVault(async (vaultPath) => {
      const created = await createCanvas(vaultPath, "agent");
      expect(created.name).toBe("agent");
      expect(created.relativePath).toBe(".tipsboard/canvas/agent.canvas");

      await saveCanvas(vaultPath, created.relativePath, sampleDoc);
      const loaded = await loadCanvas(vaultPath, created.relativePath);
      expect(loaded.nodes).toHaveLength(2);
      expect(loaded.edges).toHaveLength(1);

      const summaries = await listCanvasSummaries(vaultPath);
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.name).toBe("agent");

      await deleteCanvas(vaultPath, created.relativePath);
      expect(await listCanvasSummaries(vaultPath)).toHaveLength(0);
    });
  });

  it("patches note paths and removes deleted notes", async () => {
    await withVault(async (vaultPath) => {
      const created = await createCanvas(vaultPath, "map");
      await saveCanvas(vaultPath, created.relativePath, sampleDoc);

      await patchCanvasNotePaths(vaultPath, "docs/a.md", "docs/b.md");
      const patched = await loadCanvas(vaultPath, created.relativePath);
      const noteNode = patched.nodes.find((n) => n.type === "note");
      expect(noteNode?.type === "note" ? noteNode.path : "").toBe("docs/b.md");

      await cleanupCanvasAfterNoteDelete(vaultPath, "docs/b.md");
      const cleaned = await loadCanvas(vaultPath, created.relativePath);
      expect(cleaned.nodes.some((n) => n.type === "note")).toBe(false);
      expect(cleaned.edges).toHaveLength(0);
    });
  });

  it("prunes missing note nodes", () => {
    const pruned = pruneCanvasNoteNodes(sampleDoc, new Set(["docs/a.md"]));
    expect(pruned.nodes.filter((n) => n.type === "note")).toHaveLength(1);

    const removed = pruneCanvasNoteNodes(sampleDoc, new Set<string>());
    expect(removed.nodes.some((n) => n.type === "note")).toBe(false);
    expect(removed.edges).toHaveLength(0);
  });

  it("sanitizes edge label and arrow ends", () => {
    const sanitized = sanitizeCanvasDocument({
      version: 1,
      nodes: sampleDoc.nodes,
      edges: [
        {
          id: "e1",
          fromNode: "t1",
          toNode: "n1",
          fromSide: "right",
          toSide: "left",
          label: "leads to",
          fromEnd: "arrow",
          toEnd: "none",
        },
        {
          id: "e2",
          fromNode: "t1",
          toNode: "n1",
          fromEnd: "invalid",
          toEnd: "arrow",
          label: "",
        },
      ],
      viewport: { zoom: 1, panX: 0, panY: 0 },
    });

    expect(sanitized.edges[0]).toEqual({
      id: "e1",
      fromNode: "t1",
      toNode: "n1",
      fromSide: "right",
      toSide: "left",
      label: "leads to",
      fromEnd: "arrow",
      toEnd: "none",
    });
    expect(sanitized.edges[1]).toEqual({
      id: "e2",
      fromNode: "t1",
      toNode: "n1",
      fromSide: "right",
      toSide: "left",
    });
  });
});
