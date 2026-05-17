import { describe, expect, it } from "vitest";
import { reorderColumnsWithPlacement } from "./kanbanColumnReorder";

const ABC = ["a", "b", "c"] as const;

describe("reorderColumnsWithPlacement", () => {
  it("returns null when drag and target are the same column", () => {
    expect(reorderColumnsWithPlacement(ABC, "b", "b", "before")).toBeNull();
    expect(reorderColumnsWithPlacement(ABC, "b", "b", "after")).toBeNull();
  });

  it("returns null when target is not in the current order list", () => {
    expect(reorderColumnsWithPlacement(ABC, "a", "x", "before")).toBeNull();
  });

  it("inserts before the target column", () => {
    expect(reorderColumnsWithPlacement(ABC, "c", "a", "before")).toEqual(["c", "a", "b"]);
    expect(reorderColumnsWithPlacement(ABC, "c", "b", "before")).toEqual(["a", "c", "b"]);
    expect(reorderColumnsWithPlacement(ABC, "a", "c", "before")).toEqual(["b", "a", "c"]);
  });

  it("inserts after the target column", () => {
    expect(reorderColumnsWithPlacement(ABC, "c", "a", "after")).toEqual(["a", "c", "b"]);
    expect(reorderColumnsWithPlacement(ABC, "a", "c", "after")).toEqual(["b", "c", "a"]);
    expect(reorderColumnsWithPlacement(ABC, "a", "b", "after")).toEqual(["b", "a", "c"]);
  });

  it("handles moving adjacent columns stepwise (swap-like)", () => {
    expect(reorderColumnsWithPlacement(ABC, "a", "b", "after")).toEqual(["b", "a", "c"]);
    expect(reorderColumnsWithPlacement(ABC, "b", "c", "before")).toEqual(["a", "b", "c"]);
  });

  it("when dragId was not listed, still inserts relative to target (UI always passes columns from the board)", () => {
    expect(reorderColumnsWithPlacement(["x", "y"], "ghost", "x", "before")).toEqual(["ghost", "x", "y"]);
  });

  it("treats empty orderedIds as yielding null for typical drag", () => {
    expect(reorderColumnsWithPlacement([], "x", "x", "before")).toBeNull();
    expect(reorderColumnsWithPlacement([], "a", "b", "after")).toBeNull();
  });
});
