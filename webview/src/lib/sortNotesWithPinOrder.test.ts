import type { NoteSummary } from "@/types";
import { describe, expect, it } from "vitest";
import { sortNotesWithPinOrder } from "./sortNotesWithPinOrder";

function mk(base: Pick<NoteSummary, "path"> & Partial<Omit<NoteSummary, "path">>): NoteSummary {
  const filename = base.filename ?? base.path.split("/").pop() ?? "x.md";
  return {
    path: base.path,
    filename,
    title: base.title ?? "T",
    normalizedTitle: base.normalizedTitle ?? "t",
    body: base.body ?? "",
    preview: base.preview ?? "",
    updatedAt: base.updatedAt ?? 0,
    createdAt: base.createdAt ?? 0,
  };
}

describe("sortNotesWithPinOrder", () => {
  it("places pinned paths first in pin-array order", () => {
    const a = mk({ path: "pages/a.md", title: "A", updatedAt: 100 });
    const b = mk({ path: "pages/b.md", title: "B", updatedAt: 300 });
    const c = mk({ path: "pages/c.md", title: "C", updatedAt: 200 });
    const pins = ["pages/c.md", "pages/a.md"];
    expect(sortNotesWithPinOrder([a, b, c], pins).map((n) => n.path)).toEqual(["pages/c.md", "pages/a.md", "pages/b.md"]);
  });

  it("sorts ties among unpinned by updatedAt desc then title", () => {
    const x = mk({ path: "pages/z.md", title: "Z", updatedAt: 1 });
    const y = mk({ path: "pages/y.md", title: "A", updatedAt: 1 });
    expect(sortNotesWithPinOrder([x, y], []).map((n) => n.path)).toEqual(["pages/y.md", "pages/z.md"]);
  });

  it("normalizes backslashes on paths like host pins", () => {
    const a = mk({ path: "pages/a.md", updatedAt: 2 });
    const b = mk({ path: "pages/b.md", updatedAt: 1 });
    expect(sortNotesWithPinOrder([a, b], ["pages\\b.md"]).map((n) => n.path)).toEqual(["pages/b.md", "pages/a.md"]);
  });

  it("treats undefined pins as empty", () => {
    const ordered = sortNotesWithPinOrder(
      [mk({ path: "p2.md", title: "B", updatedAt: 10 }), mk({ path: "p1.md", title: "A", updatedAt: 30 })],
      undefined,
    );
    expect(ordered.map((n) => n.path)).toEqual(["p1.md", "p2.md"]);
  });
});
