import { describe, expect, it } from "vitest";

import { mapPool } from "./asyncPool.js";

describe("mapPool", () => {
  it("maps items with bounded concurrency", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapPool(items, 2, async (value) => value * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });
});
