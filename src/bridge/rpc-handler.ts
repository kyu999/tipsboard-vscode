import * as vscode from "vscode";
import path from "node:path";
import type { RpcInbound, RpcOutbound } from "./protocol.js";
import {
  readVault,
  createNote,
  saveNote,
  deleteNote,
  exportVaultJson,
  importVaultJson,
  importImages,
  importAttachmentBuffers,
  setNotePinned,
  type ImageBufferInput,
} from "../host/vault.js";
import {
  createKanbanBoard,
  deleteKanbanBoard,
  deleteKanbanColumn,
  moveKanbanNote,
  updateKanbanBoard,
  updateKanbanColumn,
  createKanbanColumn,
  reorderKanbanColumns,
} from "../host/kanban.js";
import { resolveVaultFsPath, pickVaultFolder } from "../host/vaultRoot.js";
import { readAttachmentMaxBytes } from "../host/attachmentSettings.js";
import { toAssetDiskUri, toAssetWebviewUri, vaultFileAttachmentOpenAllowed } from "../host/assetUri.js";
import type { TipsboardPanel } from "../panel/TipsboardPanel.js";

async function vaultSnapshotPayload(vp: string | null): Promise<Awaited<ReturnType<typeof readVault>> & { attachmentMaxBytes: number }> {
  return { ...(await readVault(vp)), attachmentMaxBytes: readAttachmentMaxBytes() };
}

export async function handleRpcInbound(
  webview: vscode.Webview,
  raw: RpcInbound,
  panel: TipsboardPanel,
): Promise<void> {
  const reply = (partial: Omit<RpcOutbound, "source" | "kind" | "id">): void => {
    const msg: RpcOutbound = {
      source: "tipsboard-vscode-host",
      kind: "rpc-result",
      id: raw.id,
      ok: partial.ok ?? true,
      result: partial.result,
      error: partial.error,
    };
    void webview.postMessage(msg);
  };

  try {
    const vaultPath = resolveVaultFsPath();

    switch (raw.method) {
      case "getSnapshot": {
        panel.setVaultRoots(vaultPath);
        reply({ ok: true, result: await vaultSnapshotPayload(vaultPath ?? null) });
        return;
      }

      case "selectFolder": {
        const picked = await pickVaultFolder();
        const vp = picked ?? resolveVaultFsPath();
        panel.setVaultRoots(vp);
        reply({ ok: true, result: await vaultSnapshotPayload(vp ?? null) });
        return;
      }

      case "createNote": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const title = typeof raw.payload === "string" ? raw.payload : "";
        const note = await createNote(vaultPath, title);
        const notePath = note.path.replace(/\\/g, "/");
        panel.recordSelfWrites([notePath]);
        reply({
          ok: true,
          result: { notePath, note },
        });
        return;
      }

      case "saveNote": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const p = raw.payload as { path: string; body: string };
        const beforePath = p.path.replace(/\\/g, "/");
        const note = await saveNote(vaultPath, p.path, p.body);
        const afterPath = note.path.replace(/\\/g, "/");
        const selfPaths = [beforePath, afterPath];
        if (beforePath !== afterPath) {
          selfPaths.push(".tipsboard/kanban.json", ".tipsboard/pins.json");
        }
        panel.recordSelfWrites(selfPaths);
        reply({ ok: true, result: { notePath: note.path, note } });
        return;
      }

      case "deleteNote": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const np = typeof raw.payload === "string" ? raw.payload : "";
        await deleteNote(vaultPath, np);
        panel.recordSelfWrites([
          np.replace(/\\/g, "/"),
          ".tipsboard/kanban.json",
          ".tipsboard/pins.json",
        ]);
        reply({ ok: true, result: await readVault(vaultPath) });
        return;
      }

      case "createKanbanBoard": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        await createKanbanBoard(vaultPath, String(raw.payload ?? ""));
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await readVault(vaultPath) });
        return;
      }

      case "updateKanbanBoard": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { boardId?: string; name?: string };
        await updateKanbanBoard(vaultPath, payload.boardId ?? "", { name: payload.name });
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await readVault(vaultPath) });
        return;
      }

      case "deleteKanbanBoard": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        await deleteKanbanBoard(vaultPath, String(raw.payload ?? ""));
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await readVault(vaultPath) });
        return;
      }

      case "createKanbanColumn": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { boardId?: string; name?: string };
        await createKanbanColumn(vaultPath, payload.boardId ?? "", payload.name ?? "");
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await readVault(vaultPath) });
        return;
      }

      case "updateKanbanColumn": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { columnId?: string; name?: string; position?: number };
        await updateKanbanColumn(vaultPath, payload.columnId ?? "", {
          name: payload.name,
          position: payload.position,
        });
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await readVault(vaultPath) });
        return;
      }

      case "deleteKanbanColumn": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        await deleteKanbanColumn(vaultPath, String(raw.payload ?? ""));
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await readVault(vaultPath) });
        return;
      }

      case "reorderKanbanColumns": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { boardId?: string; columnIds?: string[] };
        await reorderKanbanColumns(vaultPath, payload.boardId ?? "", payload.columnIds ?? []);
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await readVault(vaultPath) });
        return;
      }

      case "moveKanbanNote": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as {
          boardId: string;
          notePath: string;
          toColumnId: string | null;
          position?: number;
        };
        await moveKanbanNote(
          vaultPath,
          payload.boardId,
          payload.notePath,
          payload.toColumnId ?? null,
          payload.position ?? 0,
        );
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await readVault(vaultPath) });
        return;
      }

      case "exportJson": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const baseName = path.basename(vaultPath);
        const fp = await vscode.window.showSaveDialog({
          saveLabel: "Export",
          filters: { JSON: ["json"] },
          defaultUri: vscode.Uri.file(path.join(vaultPath, "..", `${baseName}.tipsboard-export.json`)),
        });
        if (!fp) reply({ ok: true, result: false });
        else {
          await exportVaultJson(vaultPath, fp.fsPath);
          reply({ ok: true, result: true });
        }
        return;
      }

      case "importJson": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const files = await vscode.window.showOpenDialog({
          filters: { JSON: ["json"] },
          canSelectMany: false,
          openLabel: "Import JSON",
        });
        if (!files?.[0]) reply({ ok: true, result: await readVault(vaultPath) });
        else {
          await importVaultJson(vaultPath, files[0].fsPath);
          panel.recordBulkSelfWriteMask();
          reply({ ok: true, result: await readVault(vaultPath) });
        }
        return;
      }

      case "importImages": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const paths = (raw.payload as string[]) ?? [];
        reply({ ok: true, result: await importImages(vaultPath, paths, readAttachmentMaxBytes()) });
        return;
      }

      case "importAttachmentBuffers": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const entriesRaw = raw.payload as { name: string; data: number[] | Uint8Array }[];
        const entries: ImageBufferInput[] = entriesRaw.map((e) => ({
          name: e.name,
          data: new Uint8Array(e.data instanceof Uint8Array ? e.data : [...e.data]),
        }));
        reply({ ok: true, result: await importAttachmentBuffers(vaultPath, entries, readAttachmentMaxBytes()) });
        return;
      }

      case "openVaultAsset": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const relRaw = String(raw.payload ?? "").trim().replace(/\\/g, "/");
        if (!vaultFileAttachmentOpenAllowed(relRaw)) {
          throw new Error("Invalid attachment path");
        }
        const vu = vscode.Uri.file(vaultPath);
        const segments = relRaw.split("/").filter((s) => s.length > 0);
        const target = vscode.Uri.joinPath(vu, ...segments);
        await vscode.env.openExternal(target);
        reply({ ok: true, result: undefined });
        return;
      }

      case "resolveAssetUri": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const rel = String(raw.payload ?? "");
        const vu = vscode.Uri.file(vaultPath);
        const disk = toAssetDiskUri(vu, rel);
        if (!disk) {
          reply({ ok: true, result: "" });
          return;
        }
        try {
          await vscode.workspace.fs.stat(disk);
        } catch {
          reply({ ok: true, result: "" });
          return;
        }
        const u = toAssetWebviewUri(webview, vu, rel);
        reply({ ok: true, result: u?.toString() ?? "" });
        return;
      }

      case "resolveAssetUris": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const paths = (raw.payload as { paths: string[] }).paths ?? [];
        const vu = vscode.Uri.file(vaultPath);
        const rec: Record<string, string> = {};
        for (const p of paths) {
          const disk = toAssetDiskUri(vu, p);
          if (!disk) continue;
          try {
            await vscode.workspace.fs.stat(disk);
          } catch {
            continue;
          }
          const u = toAssetWebviewUri(webview, vu, p);
          if (u) rec[p] = u.toString();
        }
        reply({ ok: true, result: rec });
        return;
      }

      case "setNotePinned": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const p = raw.payload as { path?: string; pinned?: boolean };
        const notePath = typeof p.path === "string" ? p.path : "";
        if (!notePath) throw new Error("Note path is required");
        await setNotePinned(vaultPath, notePath, Boolean(p.pinned));
        panel.recordSelfWrites([".tipsboard/pins.json"]);
        reply({ ok: true, result: await readVault(vaultPath) });
        return;
      }

      case "openExternal": {
        const uri = String((raw.payload as { uri?: string }).uri ?? "");
        if (/^https?:\/\//i.test(uri)) {
          await vscode.env.openExternal(vscode.Uri.parse(uri));
        }
        reply({ ok: true, result: undefined });
        return;
      }

      default:
        throw new Error(`Unknown RPC method ${raw.method}`);
    }
  } catch (e: unknown) {
    const msgText = e instanceof Error ? e.message : String(e);
    reply({
      ok: false,
      error: msgText,
    });
  }
}

