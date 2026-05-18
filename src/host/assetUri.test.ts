import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  const Uri = {
    file: (fsPath: string) => ({ fsPath: path.normalize(fsPath) }),
    joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
      fsPath: path.join(base.fsPath, ...segments),
    }),
  };
  return { Uri };
});

import { assetPathAllowed, toAssetDiskUri, vaultFileAttachmentOpenAllowed } from "./assetUri.js";

describe("assetUri path guards", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("assetPathAllowed", () => {
    it("allows images and files under assets", () => {
      expect(assetPathAllowed("assets/images/x.png")).toBe(true);
      expect(assetPathAllowed("assets/files/doc.pdf")).toBe(true);
    });

    it("rejects empty, absolute, traversal, and other trees", () => {
      expect(assetPathAllowed("")).toBe(false);
      expect(assetPathAllowed("/abs/assets/images/x.png")).toBe(false);
      expect(assetPathAllowed("assets/../pages/x.md")).toBe(false);
      expect(assetPathAllowed("pages/note.md")).toBe(false);
    });
  });

  describe("vaultFileAttachmentOpenAllowed", () => {
    it("allows only assets/files", () => {
      expect(vaultFileAttachmentOpenAllowed("assets/files/x.pdf")).toBe(true);
      expect(vaultFileAttachmentOpenAllowed("assets/images/x.png")).toBe(false);
    });
  });

  describe("toAssetDiskUri", () => {
    it("joins vault root with normalized segments when allowed", () => {
      const root = { fsPath: "/vault/root" } as import("vscode").Uri;
      const u = toAssetDiskUri(root, "assets/images/a.png");
      expect(u).not.toBeNull();
      expect(u!.fsPath.endsWith(`${path.join("assets", "images", "a.png")}`)).toBe(true);
    });

    it("returns null when path is not allowed", () => {
      const root = { fsPath: "/vault" } as import("vscode").Uri;
      expect(toAssetDiskUri(root, "pages/x.md")).toBeNull();
    });
  });
});
