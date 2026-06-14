import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CanvasDocument } from "../types/editor.js";
import { sanitizeCanvasDocument } from "../shared/canvasMermaid.js";
import { CANVAS_MERMAID_HEADER } from "../shared/canvasTypes.js";
import {
  createCanvas,
  deleteCanvas,
  listCanvasSummaries,
  loadCanvas,
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
  nodes: [
    { id: "p1", type: "problem", title: "売上が低い", description: "目標未達" },
    { id: "p2", type: "problem", title: "新規顧客が少ない" },
    { id: "s1", type: "solution", title: "記事を増やす" },
  ],
  edges: [
    { id: "e1", from: "p1", to: "p2", type: "because" },
    { id: "e2", from: "p2", to: "s1", type: "solved_by" },
  ],
};

describe("canvas host", () => {
  it("creates, loads, saves, lists, and deletes mermaid canvas files", async () => {
    await withVault(async (vaultPath) => {
      const created = await createCanvas(vaultPath, "agent");
      expect(created.name).toBe("agent");
      expect(created.relativePath).toBe(".tipsboard/canvas/agent.canvas");

      const empty = await loadCanvas(vaultPath, created.relativePath);
      expect(empty.errors).toEqual([]);
      expect(empty.document.nodes).toEqual([]);

      await saveCanvas(vaultPath, created.relativePath, sampleDoc);
      const loaded = await loadCanvas(vaultPath, created.relativePath);
      expect(loaded.errors).toEqual([]);
      expect(loaded.document.nodes).toHaveLength(3);
      expect(loaded.document.edges).toHaveLength(2);

      const raw = await fs.readFile(path.join(vaultPath, created.relativePath), "utf8");
      expect(raw).toContain(CANVAS_MERMAID_HEADER);

      const summaries = await listCanvasSummaries(vaultPath);
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.name).toBe("agent");

      await deleteCanvas(vaultPath, created.relativePath);
      expect(await listCanvasSummaries(vaultPath)).toHaveLength(0);
    });
  });

  it("excludes legacy JSON canvas files from summaries", async () => {
    await withVault(async (vaultPath) => {
      const dir = path.join(vaultPath, ".tipsboard", "canvas");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "legacy.canvas"),
        JSON.stringify({ version: 1, nodes: [], edges: [] }),
        "utf8",
      );
      await createCanvas(vaultPath, "new");
      const summaries = await listCanvasSummaries(vaultPath);
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.name).toBe("new");
    });
  });

  it("sanitizes invalid nodes and edges", () => {
    const sanitized = sanitizeCanvasDocument({
      version: 1,
      nodes: [
        { id: "p1", type: "problem", title: "OK" },
        { id: "", type: "problem", title: "bad" },
        { id: "x1", type: "invalid", title: "bad type" },
      ],
      edges: [
        { id: "e1", from: "p1", to: "missing", type: "because" },
        { id: "e2", from: "p1", to: "p1", type: "because" },
      ],
    });
    expect(sanitized.nodes).toHaveLength(1);
    expect(sanitized.edges).toHaveLength(1);
  });
});
