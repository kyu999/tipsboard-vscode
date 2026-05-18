import { describe, expect, it } from "vitest";

import { escapeRegExp, formatIconSyntax, parseIconSyntax } from "./iconSyntax";

describe("iconSyntax", () => {
  it("parseIconSyntax extracts title and count", () => {
    expect(parseIconSyntax("Tasks.icon*3")).toEqual({ title: "Tasks", count: 3 });
    expect(parseIconSyntax("  Empty.icon  ")).toEqual({ title: "Empty", count: 1 });
  });

  it("parseIconSyntax returns null when pattern does not match", () => {
    expect(parseIconSyntax("Plain title")).toBeNull();
  });

  it("formatIconSyntax round-trips count when > 1", () => {
    expect(formatIconSyntax("X", 2)).toBe("[X.icon*2]");
  });

  it("escapeRegExp escapes metacharacters", () => {
    expect(escapeRegExp("a.b")).toBe("a\\.b");
  });
});
