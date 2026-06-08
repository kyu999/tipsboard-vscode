import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computePostSaveSelfWriteMaskMs,
  filterExternalChangePaths,
  fsPathToVaultRelative,
  isWatchedVaultPath,
  normalizeVaultRelativePath,
  pruneExpiredSelfWrites,
  SELF_WRITE_MASK_MS,
  SELF_WRITE_WATCHER_LAG_BUFFER_MS,
} from "./vaultFileWatchHelpers.js";

describe("normalizeVaultRelativePath", () => {
  it("normalizes backslashes and strips leading ./", () => {
    expect(normalizeVaultRelativePath(String.raw`pages\a.md`)).toBe("pages/a.md");
    expect(normalizeVaultRelativePath("./pages/a.md")).toBe("pages/a.md");
  });
});

describe("fsPathToVaultRelative", () => {
  it("returns posix path under vault", () => {
    const vault = path.join("/tmp", "myvault");
    const file = path.join(vault, "pages", "note.md");
    expect(fsPathToVaultRelative(vault, file)).toBe("pages/note.md");
  });

  it("returns null when file escapes vault", () => {
    const vault = path.join("/tmp", "myvault");
    const outside = path.join("/tmp", "other", "x.md");
    expect(fsPathToVaultRelative(vault, outside)).toBeNull();
  });
});

describe("self-write mask + external paths", () => {
  it("drops pending paths covered by an active mask", () => {
    const now = 1_000_000;
    const map = new Map<string, number>([["docs/a.md", now + 500]]);
    const out = filterExternalChangePaths(["docs/a.md", "docs/b.md"], map, now);
    expect(out.sort()).toEqual(["docs/b.md"]);
  });

  it("keeps paths after mask expiry", () => {
    const now = 2_000_000;
    const map = new Map<string, number>([["docs/a.md", now - 1]]);
    const out = filterExternalChangePaths(["docs/a.md"], map, now);
    expect(out).toEqual(["docs/a.md"]);
    expect(map.size).toBe(0);
  });

  it("filters non-note and excluded workspace paths", () => {
    const now = 3_000_000;
    const out = filterExternalChangePaths([
      "docs/a.md",
      ".git/ignored.md",
      ".tipsboard/hidden.md",
      "assets/file.txt",
      ".tipsboard/kanban.json",
    ], new Map(), now);
    expect(out.sort()).toEqual([".tipsboard/kanban.json", "docs/a.md"]);
  });

  it("pruneExpiredSelfWrites removes stale entries only", () => {
    const now = 5_000;
    const map = new Map<string, number>([
      ["a", now - 1],
      ["b", now + 100],
    ]);
    pruneExpiredSelfWrites(map, now);
    expect([...map.keys()].sort()).toEqual(["b"]);
  });
});

describe("computePostSaveSelfWriteMaskMs", () => {
  it("uses base mask for fast saves", () => {
    expect(computePostSaveSelfWriteMaskMs(20)).toBe(SELF_WRITE_MASK_MS);
  });

  it("extends mask when save duration plus watcher buffer exceeds base", () => {
    expect(computePostSaveSelfWriteMaskMs(1500)).toBe(1500 + SELF_WRITE_WATCHER_LAG_BUFFER_MS);
  });
});

describe("isWatchedVaultPath", () => {
  it("allows recursive markdown and Tipsboard metadata only", () => {
    expect(isWatchedVaultPath("docs/auth/oauth.md")).toBe(true);
    expect(isWatchedVaultPath(".tipsboard/pins.json")).toBe(true);
    expect(isWatchedVaultPath(".tipsboard/note.md")).toBe(false);
    expect(isWatchedVaultPath("node_modules/pkg/readme.md")).toBe(false);
    expect(isWatchedVaultPath("docs/image.png")).toBe(false);
  });
});
