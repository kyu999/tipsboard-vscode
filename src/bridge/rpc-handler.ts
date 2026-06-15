import path from "node:path";
import { promises as fs } from "node:fs";
import { Buffer } from "node:buffer";
import * as vscode from "vscode";
import type { RpcInbound, RpcOutbound, RpcProgressOutbound } from "./protocol.js";
import {
  readVault,
  createNote,
  saveNote,
  moveNoteToFolder,
  moveNotesToFolders,
  deleteNote,
  exportVaultJson,
  importVaultJson,
  importImages,
  importAttachmentBuffers,
  readVaultAttachmentSummaries,
  setNotePinned,
  type ImageBufferInput,
} from "../host/vault.js";
import { findInboundNotePaths } from "../host/noteLinkIndex.js";
import {
  canvasAbsPath,
  createCanvas,
  deleteCanvas,
  listCanvasSummaries,
  loadCanvas,
  saveCanvas,
} from "../host/canvas.js";
import { computePostSaveSelfWriteMaskMs } from "../panel/vaultFileWatchHelpers.js";
import {
  createKanbanBoard,
  deleteKanbanBoard,
  deleteKanbanColumn,
  loadKanbanState,
  moveKanbanNote,
  moveKanbanNotes,
  updateKanbanBoard,
  updateKanbanColumn,
  createKanbanColumn,
  reorderKanbanColumns,
} from "../host/kanban.js";
import type { CanvasDocument } from "../types/editor.js";
import { resolveVault, resolveVaultFsPath } from "../host/vaultRoot.js";
import { readAttachmentMaxBytes } from "../host/attachmentSettings.js";
import {
  imageMimeFromAssetPath,
  toAssetDiskUri,
  toAssetWebviewUri,
  vaultFileAttachmentOpenAllowed,
} from "../host/assetUri.js";
import { openPathWithOsDefaultApp } from "../host/openOsDefaultApp.js";
import {
  rebuildSemanticIndex,
  semanticSearch,
  updateSemanticIndex,
} from "../host/semantic.js";
import { createSemanticProviderForExtension } from "../host/semanticProviderFactory.js";
import { semanticRuntimeAssetName } from "../host/semanticRuntime.js";
import {
  SEMANTIC_SEARCH_MODEL_IDS,
  readSemanticSettings,
  semanticConfigurationPrefix,
  semanticModelHubUrl,
  type SemanticSettings,
} from "../host/semanticSettings.js";
import { buildOrganizeSuggestions, buildBulkOrganizeSuggestions } from "../host/organizeSuggestions.js";
import { isInboxNotePath } from "../shared/inboxPath.js";
import { loadWorkspacePreferences, saveWorkspacePreferences } from "../host/workspacePreferences.js";
import type { TipsboardPanel } from "../panel/TipsboardPanel.js";

function semanticSearchSettingsPayload(settings: SemanticSettings) {
  const runtimeBase = settings.runtimeDownloadBaseUrl.replace(/\/+$/, "");
  const runtimeAsset = semanticRuntimeAssetName();
  return {
    modelId: settings.modelId,
    allowRemoteModels: settings.allowRemoteModels,
    modelCachePath: settings.modelCachePath,
    modelIds: SEMANTIC_SEARCH_MODEL_IDS,
    enabled: settings.provider !== "off",
    runtimeDownloadUrl: `${runtimeBase}/${runtimeAsset}`,
    modelDownloadUrl: semanticModelHubUrl(settings.modelId),
    modelDownloadUrls: Object.fromEntries(
      SEMANTIC_SEARCH_MODEL_IDS.map((id) => [id, semanticModelHubUrl(id)]),
    ) as Record<string, string>,
  };
}

function semanticProviderFor(panel: TipsboardPanel) {
  return createSemanticProviderForExtension({
    cacheDir: panel.semanticModelCacheDir(),
    extensionPath: panel.extensionPath(),
    extensionVersion: panel.extensionVersion(),
    globalStoragePath: panel.semanticRuntimeStorageDir(),
  });
}

async function vaultSnapshotPayload(): Promise<Awaited<ReturnType<typeof readVault>> & { attachmentMaxBytes: number }> {
  const resolution = resolveVault();
  const vaultPath = resolution.status === "ready" ? resolution.fsPath ?? null : null;
  return {
    ...(await readVault(vaultPath)),
    attachmentMaxBytes: readAttachmentMaxBytes(),
    vaultResolution: resolution.status,
  };
}

async function kanbanRpcPayload(vaultPath: string) {
  return { kanban: await loadKanbanState(vaultPath) };
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
  const progress = (method: string, value: unknown): void => {
    const msg: RpcProgressOutbound = {
      source: "tipsboard-vscode-host",
      kind: "rpc-progress",
      id: raw.id,
      method,
      progress: value,
    };
    void webview.postMessage(msg);
  };

  try {
    const vaultPath = resolveVaultFsPath();

    switch (raw.method) {
      case "getSnapshot": {
        panel.setVaultRoots(vaultPath);
        const snapshot = await vaultSnapshotPayload();
        panel.rebuildNoteLinkIndex(snapshot.notes);
        reply({ ok: true, result: snapshot });
        return;
      }

      case "findInboundWikiLinks": {
        const normalizedTitle = String(
          (raw.payload as { normalizedTitle?: string } | undefined)?.normalizedTitle ?? "",
        );
        reply({ ok: true, result: findInboundNotePaths(panel.getNoteLinkIndex(), normalizedTitle) });
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
        const saveStartedAt = Date.now();
        panel.recordSelfWrites([beforePath]);
        let oldNoteForIndex: { path: string; body: string } | null = null;
        try {
          const previousBody = await fs.readFile(path.join(vaultPath, beforePath), "utf8");
          oldNoteForIndex = { path: beforePath, body: previousBody };
        } catch {
          oldNoteForIndex = null;
        }
        const note = await saveNote(vaultPath, p.path, p.body);
        const saveDurationMs = Date.now() - saveStartedAt;
        const afterPath = note.path.replace(/\\/g, "/");
        panel.patchNoteLinkIndex(oldNoteForIndex, { path: afterPath, body: p.body });
        const selfPaths = [beforePath, afterPath];
        if (beforePath !== afterPath) {
          selfPaths.push(".tipsboard/kanban.json", ".tipsboard/pins.json");
        }
        panel.recordSelfWrites(selfPaths, computePostSaveSelfWriteMaskMs(saveDurationMs));
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

      case "getOrganizeSuggestions": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { notePath?: string } | string | undefined;
        const notePath = typeof payload === "string" ? payload : String(payload?.notePath ?? "");
        const snapshot = await readVault(vaultPath);
        const note = snapshot.notes.find((item) => item.path.replace(/\\/g, "/") === notePath.replace(/\\/g, "/"));
        const settings = readSemanticSettings();
        const semanticEnabled = settings.provider !== "off";
        const semanticNeighbors = semanticEnabled && note
          ? (await semanticSearch(
            vaultPath,
            note.body,
            await semanticProviderFor(panel),
            {
              limit: 20,
              mode: settings.mode,
              denseWeight: settings.denseWeight,
              bm25Weight: settings.bm25Weight,
              onEmbeddingProgress: (value) => progress("getOrganizeSuggestions", value),
            },
          )).results
          : [];
        reply({
          ok: true,
          result: buildOrganizeSuggestions({
            notePath,
            notes: snapshot.notes,
            semanticEnabled,
            semanticNeighbors,
          }),
        });
        return;
      }

      case "setWorkspacePreferences": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { preferFolderHierarchy?: boolean };
        const current = await loadWorkspacePreferences(vaultPath);
        const next = {
          version: 1 as const,
          preferFolderHierarchy:
            typeof payload?.preferFolderHierarchy === "boolean"
              ? payload.preferFolderHierarchy
              : current.preferFolderHierarchy,
        };
        await saveWorkspacePreferences(vaultPath, next);
        panel.recordSelfWrites([".tipsboard/workspace.json"]);
        reply({ ok: true, result: await vaultSnapshotPayload() });
        return;
      }

      case "getBulkOrganizeSuggestions": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const snapshot = await readVault(vaultPath);
        const inboxNotes = snapshot.notes.filter((note) => isInboxNotePath(note.path));
        const settings = readSemanticSettings();
        const semanticEnabled = settings.provider !== "off";
        const semanticNeighborsByPath = new Map<string, Awaited<ReturnType<typeof semanticSearch>>["results"]>();
        if (semanticEnabled) {
          const provider = await semanticProviderFor(panel);
          for (let i = 0; i < inboxNotes.length; i += 1) {
            const note = inboxNotes[i]!;
            progress("getBulkOrganizeSuggestions", {
              completed: i,
              total: inboxNotes.length,
              notePath: note.path,
            });
            const search = await semanticSearch(vaultPath, note.body, provider, {
              limit: 20,
              mode: settings.mode,
              denseWeight: settings.denseWeight,
              bm25Weight: settings.bm25Weight,
            });
            semanticNeighborsByPath.set(note.path.replace(/\\/g, "/"), search.results);
          }
          progress("getBulkOrganizeSuggestions", {
            completed: inboxNotes.length,
            total: inboxNotes.length,
            notePath: null,
          });
        }
        reply({
          ok: true,
          result: buildBulkOrganizeSuggestions({
            notes: snapshot.notes,
            semanticEnabled,
            semanticNeighborsByPath,
          }),
        });
        return;
      }

      case "moveNotesToFolders": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { moves?: Array<{ notePath?: string; targetFolder?: string }> };
        const moves = (payload?.moves ?? [])
          .map((move) => ({
            notePath: String(move.notePath ?? "").replace(/\\/g, "/"),
            targetFolder: String(move.targetFolder ?? ""),
          }))
          .filter((move) => move.notePath && move.targetFolder);
        const result = await moveNotesToFolders(vaultPath, moves);
        panel.recordSelfWrites([
          ...result.moved.flatMap((move) => [move.fromPath, move.toPath]),
          ".tipsboard/kanban.json",
          ".tipsboard/pins.json",
        ]);
        reply({ ok: true, result });
        return;
      }

      case "moveNoteToFolder": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { notePath?: string; targetFolder?: string };
        const beforePath = String(payload?.notePath ?? "").replace(/\\/g, "/");
        const note = await moveNoteToFolder(vaultPath, beforePath, String(payload?.targetFolder ?? ""));
        const afterPath = note.path.replace(/\\/g, "/");
        panel.recordSelfWrites([beforePath, afterPath, ".tipsboard/kanban.json", ".tipsboard/pins.json"]);
        reply({
          ok: true,
          result: {
            notePath: afterPath,
            note,
            snapshot: await readVault(vaultPath),
          },
        });
        return;
      }

      case "getKanban": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        reply({ ok: true, result: await kanbanRpcPayload(vaultPath) });
        return;
      }

      case "createKanbanBoard": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        await createKanbanBoard(vaultPath, String(raw.payload ?? ""));
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await kanbanRpcPayload(vaultPath) });
        return;
      }

      case "updateKanbanBoard": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { boardId?: string; name?: string };
        await updateKanbanBoard(vaultPath, payload.boardId ?? "", { name: payload.name });
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await kanbanRpcPayload(vaultPath) });
        return;
      }

      case "deleteKanbanBoard": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        await deleteKanbanBoard(vaultPath, String(raw.payload ?? ""));
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await kanbanRpcPayload(vaultPath) });
        return;
      }

      case "createKanbanColumn": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { boardId?: string; name?: string };
        await createKanbanColumn(vaultPath, payload.boardId ?? "", payload.name ?? "");
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await kanbanRpcPayload(vaultPath) });
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
        reply({ ok: true, result: await kanbanRpcPayload(vaultPath) });
        return;
      }

      case "deleteKanbanColumn": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        await deleteKanbanColumn(vaultPath, String(raw.payload ?? ""));
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await kanbanRpcPayload(vaultPath) });
        return;
      }

      case "reorderKanbanColumns": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { boardId?: string; columnIds?: string[] };
        await reorderKanbanColumns(vaultPath, payload.boardId ?? "", payload.columnIds ?? []);
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await kanbanRpcPayload(vaultPath) });
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
        reply({ ok: true, result: await kanbanRpcPayload(vaultPath) });
        return;
      }

      case "moveKanbanNotes": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as {
          boardId?: string;
          moves?: Array<{ notePath: string; toColumnId: string | null; position: number }>;
        };
        await moveKanbanNotes(vaultPath, payload.boardId ?? "", payload.moves ?? []);
        panel.recordSelfWrites([".tipsboard/kanban.json"]);
        reply({ ok: true, result: await kanbanRpcPayload(vaultPath) });
        return;
      }

      case "getCanvas": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { relativePath?: string };
        const result = await loadCanvas(vaultPath, payload.relativePath ?? "");
        reply({ ok: true, result });
        return;
      }

      case "saveCanvas": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { relativePath?: string; document?: CanvasDocument };
        const relativePath = payload.relativePath ?? "";
        await saveCanvas(vaultPath, relativePath, payload.document ?? { version: 1, nodes: [], edges: [] });
        panel.recordSelfWrites([relativePath.replace(/\\/g, "/")]);
        reply({ ok: true, result: await listCanvasSummaries(vaultPath) });
        return;
      }

      case "createCanvas": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { name?: string };
        const created = await createCanvas(vaultPath, payload.name ?? "Untitled");
        panel.recordSelfWrites([created.relativePath]);
        reply({ ok: true, result: await listCanvasSummaries(vaultPath) });
        return;
      }

      case "deleteCanvas": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { relativePath?: string };
        const relativePath = payload.relativePath ?? "";
        await deleteCanvas(vaultPath, relativePath);
        panel.recordSelfWrites([relativePath.replace(/\\/g, "/")]);
        reply({ ok: true, result: await listCanvasSummaries(vaultPath) });
        return;
      }

      case "openCanvasInEditor": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { relativePath?: string };
        const relativePath = payload.relativePath ?? "";
        const abs = canvasAbsPath(vaultPath, relativePath);
        const uri = vscode.Uri.file(abs);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
        reply({ ok: true, result: null });
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

      case "exportHtml": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const p = raw.payload as { html?: string; suggestedFileName?: string };
        const html = typeof p.html === "string" ? p.html : "";
        const suggestedRaw = typeof p.suggestedFileName === "string" ? p.suggestedFileName : "untitled.html";
        const suggested = path.basename(suggestedRaw.replace(/\\/g, "/")) || "untitled.html";
        const fp = await vscode.window.showSaveDialog({
          saveLabel: "Export",
          filters: { HTML: ["html", "htm"] },
          defaultUri: vscode.Uri.file(path.join(vaultPath, "..", suggested)),
        });
        if (!fp) {
          reply({ ok: true, result: false });
          return;
        }
        await vscode.workspace.fs.writeFile(fp, Buffer.from(html, "utf8"));
        reply({ ok: true, result: true });
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
        const payload = raw.payload as
          | { entries?: { name: string; data: number[] | Uint8Array }[] }
          | { name: string; data: number[] | Uint8Array }[];
        const entriesRaw = Array.isArray(payload) ? payload : payload.entries ?? [];
        const entries: ImageBufferInput[] = entriesRaw.map((e) => ({
          name: e.name,
          data: new Uint8Array(e.data instanceof Uint8Array ? e.data : [...e.data]),
        }));
        const imported = await importAttachmentBuffers(vaultPath, entries, readAttachmentMaxBytes());
        const attachments = await readVaultAttachmentSummaries(vaultPath);
        reply({
          ok: true,
          result: { imported, attachments },
        });
        return;
      }

      case "getAttachmentSummaries": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        reply({ ok: true, result: await readVaultAttachmentSummaries(vaultPath) });
        return;
      }

      case "semanticSearch": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const payload = raw.payload as { query?: string; limit?: number };
        const settings = readSemanticSettings();
        const result = await semanticSearch(
          vaultPath,
          String(payload?.query ?? ""),
          await semanticProviderFor(panel),
          {
            limit: payload?.limit,
            mode: settings.mode,
            denseWeight: settings.denseWeight,
            bm25Weight: settings.bm25Weight,
            onEmbeddingProgress: (value) => progress("semanticSearch", value),
          },
        );
        reply({ ok: true, result });
        return;
      }

      case "getSemanticSearchSettings": {
        const settings = readSemanticSettings();
        reply({
          ok: true,
          result: semanticSearchSettingsPayload(settings),
        });
        return;
      }

      case "updateSemanticSearchSettings": {
        const payload = raw.payload as { modelId?: string; allowRemoteModels?: boolean; modelCachePath?: string } | undefined;
        const config = vscode.workspace.getConfiguration(semanticConfigurationPrefix());
        if (typeof payload?.modelId === "string" && SEMANTIC_SEARCH_MODEL_IDS.some((id) => id === payload.modelId)) {
          await config.update("modelId", payload.modelId, vscode.ConfigurationTarget.Global);
        }
        if (typeof payload?.allowRemoteModels === "boolean") {
          await config.update("allowRemoteModels", payload.allowRemoteModels, vscode.ConfigurationTarget.Global);
        }
        if (typeof payload?.modelCachePath === "string") {
          await config.update("modelCachePath", payload.modelCachePath.trim(), vscode.ConfigurationTarget.Global);
        }
        const settings = readSemanticSettings();
        reply({
          ok: true,
          result: semanticSearchSettingsPayload(settings),
        });
        return;
      }

      case "updateSemanticIndex": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const result = await updateSemanticIndex(vaultPath, await semanticProviderFor(panel), {
          onEmbeddingProgress: (value) => progress("updateSemanticIndex", value),
        });
        reply({ ok: true, result });
        return;
      }

      case "rebuildSemanticIndex": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const result = await rebuildSemanticIndex(vaultPath, await semanticProviderFor(panel), {
          onEmbeddingProgress: (value) => progress("rebuildSemanticIndex", value),
        });
        reply({ ok: true, result });
        return;
      }

      case "openVaultAsset": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const relRaw = String(raw.payload ?? "").trim().replace(/\\/g, "/");
        if (!vaultFileAttachmentOpenAllowed(relRaw)) {
          throw new Error("Invalid attachment path");
        }
        const disk = toAssetDiskUri(vscode.Uri.file(vaultPath), relRaw);
        if (!disk) {
          throw new Error("Invalid attachment path");
        }
        try {
          await vscode.workspace.fs.stat(disk);
        } catch {
          const label = path.basename(disk.fsPath);
          void vscode.window.showErrorMessage(`Attachment not found: ${label}`);
          throw new Error("ATTACHMENT_NOT_FOUND");
        }
        try {
          await openPathWithOsDefaultApp(disk.fsPath);
        } catch {
          const label = path.basename(disk.fsPath);
          void vscode.window.showErrorMessage(`Could not open attachment: ${label}`);
          throw new Error("ATTACHMENT_OPEN_FAILED");
        }
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

      case "readAssetDataUrls": {
        if (!vaultPath) throw new Error("Vault folder is not selected");
        const paths = (raw.payload as { paths?: string[] }).paths ?? [];
        const vu = vscode.Uri.file(vaultPath);
        const rec: Record<string, string> = {};
        for (const p of paths) {
          const disk = toAssetDiskUri(vu, p);
          if (!disk || !p.replace(/\\/g, "/").startsWith("assets/images/")) continue;
          try {
            const bytes = await vscode.workspace.fs.readFile(disk);
            const mime = imageMimeFromAssetPath(p);
            rec[p] = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
          } catch {
            continue;
          }
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

      case "revealSemanticModelCache": {
        const cacheDir = panel.semanticModelCacheDir();
        const cacheUri = vscode.Uri.file(cacheDir);
        await vscode.workspace.fs.createDirectory(cacheUri);
        await vscode.commands.executeCommand("revealFileInOS", cacheUri);
        reply({ ok: true, result: cacheDir });
        return;
      }

      case "toggleFullScreen": {
        await vscode.commands.executeCommand("workbench.action.toggleFullScreen");
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

