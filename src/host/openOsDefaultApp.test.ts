import { describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";

vi.mock("vscode", () => ({
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
}));

import type * as vscode from "vscode";
import { openPathWithOsDefaultApp } from "./openOsDefaultApp.js";

function mockSpawnChild(options?: { emitError?: boolean }): ChildProcess {
  return {
    on: vi.fn((event: string, cb: (err?: Error) => void) => {
      if (event === "error" && options?.emitError) {
        cb(new Error("spawn failed"));
      }
      return mockSpawnChild(options);
    }),
    unref: vi.fn(),
  } as unknown as ChildProcess;
}

describe("openPathWithOsDefaultApp", () => {
  it("uses cmd start on win32 with Unicode paths", async () => {
    const spawn = vi.fn(() => mockSpawnChild());
    const fsPath = "C:\\vault\\assets\\files\\報告書_ab12cd34.pdf";

    await openPathWithOsDefaultApp(fsPath, { platform: "win32", spawn });

    expect(spawn).toHaveBeenCalledWith(
      "cmd.exe",
      ["/d", "/s", "/c", "start", '""', fsPath],
      expect.objectContaining({ detached: true, windowsHide: true }),
    );
  });

  it("uses openExternal on darwin", async () => {
    const openExternal = vi.fn(async () => true);
    const spawn = vi.fn();

    await openPathWithOsDefaultApp("/vault/assets/files/doc.pdf", {
      platform: "darwin",
      openExternal: openExternal as (uri: vscode.Uri) => Thenable<boolean>,
      spawn,
    });

    expect(openExternal).toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects when spawn errors on win32", async () => {
    const spawn = vi.fn(() => mockSpawnChild({ emitError: true }));

    await expect(
      openPathWithOsDefaultApp("C:\\vault\\file.pdf", { platform: "win32", spawn }),
    ).rejects.toThrow("spawn failed");
  });

  it("rejects when openExternal returns false on darwin", async () => {
    const openExternal = vi.fn(async () => false);

    await expect(
      openPathWithOsDefaultApp("/vault/file.pdf", {
        platform: "darwin",
        openExternal: openExternal as (uri: vscode.Uri) => Thenable<boolean>,
      }),
    ).rejects.toThrow("Failed to open file with OS default application");
  });
});
