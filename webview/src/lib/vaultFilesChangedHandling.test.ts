import { describe, expect, it } from "vitest";
import { resolveVaultFilesChangedAction } from "./vaultFilesChangedHandling.js";

describe("resolveVaultFilesChangedAction", () => {
  it("refreshes when paths omit selected note even if dirty", () => {
    expect(
      resolveVaultFilesChangedAction({
        paths: [".tipsboard/kanban.json"],
        selectedPath: "pages/x.md",
        hasUnsavedChanges: true,
      }),
    ).toBe("refresh");
  });

  it("banners when selected note path matches and editor is dirty", () => {
    expect(
      resolveVaultFilesChangedAction({
        paths: ["pages/x.md", ".tipsboard/pins.json"],
        selectedPath: "pages/x.md",
        hasUnsavedChanges: true,
      }),
    ).toBe("banner");
  });

  it("refreshes when selected note matches but editor is clean", () => {
    expect(
      resolveVaultFilesChangedAction({
        paths: ["pages/x.md"],
        selectedPath: "pages/x.md",
        hasUnsavedChanges: false,
      }),
    ).toBe("refresh");
  });

  it("normalizes backslashes for comparison", () => {
    expect(
      resolveVaultFilesChangedAction({
        paths: [String.raw`pages\x.md`],
        selectedPath: "pages/x.md",
        hasUnsavedChanges: true,
      }),
    ).toBe("banner");
  });

  it("legacy: no paths uses dirty flag only", () => {
    expect(
      resolveVaultFilesChangedAction({
        selectedPath: "pages/x.md",
        hasUnsavedChanges: true,
      }),
    ).toBe("banner");
    expect(
      resolveVaultFilesChangedAction({
        selectedPath: "pages/x.md",
        hasUnsavedChanges: false,
      }),
    ).toBe("refresh");
  });

  it("legacy: no paths and no selection still follows dirty flag", () => {
    expect(
      resolveVaultFilesChangedAction({
        selectedPath: null,
        hasUnsavedChanges: true,
      }),
    ).toBe("banner");
  });

  it("with paths and no selection, never banners", () => {
    expect(
      resolveVaultFilesChangedAction({
        paths: ["pages/x.md"],
        selectedPath: null,
        hasUnsavedChanges: true,
      }),
    ).toBe("refresh");
  });
});
