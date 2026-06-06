import type {
  BulkMoveNotesResponse,
  BulkOrganizeSuggestionsResponse,
  ImportedImage,
  ImportAttachmentBuffersResult,
  NoteSummary,
  OrganizeSuggestionsResponse,
  SemanticIndexProgress,
  SemanticIndexSyncResult,
  SemanticSearchResponse,
  SemanticSearchSettings,
  VaultAttachmentSummary,
  VaultSnapshot,
} from "@/types";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (progress: unknown) => void;
};

const pending = new Map<string, Pending>();
const assetUrlCache = new Map<string, string>();
const missingAssetCache = new Set<string>();

let vscodeApi: ReturnType<typeof acquireVsCodeApi>;

function rpc(method: string, payload?: unknown, onProgress?: (progress: unknown) => void): Promise<unknown> {
  vscodeApi ??= acquireVsCodeApi();
  const id = crypto.randomUUID();
  vscodeApi.postMessage({ source: "tipsboard-vscode", kind: "rpc", id, method, payload });

  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      onProgress,
    });
  });
}

window.addEventListener("message", (ev: MessageEvent) => {
  const data = ev.data as {
    kind?: string;
    source?: string;
    id?: string;
    ok?: boolean;
    result?: unknown;
    error?: string;
    progress?: unknown;
  };
  if (data?.source !== "tipsboard-vscode-host" || typeof data.id !== "string") {
    return;
  }
  const p = pending.get(data.id);
  if (!p) return;
  if (data.kind === "rpc-progress") {
    p.onProgress?.(data.progress);
    return;
  }
  if (data.kind !== "rpc-result") return;
  pending.delete(data.id);
  if (data.ok) p.resolve(data.result);
  else p.reject(new Error(data.error ?? "RPC failed"));
});

function wireDesktop(): typeof window.tipsboardDesktop {
  return {
    getSnapshot: () => rpc("getSnapshot") as Promise<VaultSnapshot>,


    createNote: (title: string) =>
      rpc("createNote", title) as Promise<{ notePath: string; note: NoteSummary }>,

    saveNote: (notePath: string, body: string) =>
      rpc("saveNote", { path: notePath, body }) as Promise<{ notePath: string; note: NoteSummary }>,

    deleteNote: (notePath: string) => rpc("deleteNote", notePath) as Promise<VaultSnapshot>,

    setNotePinned: (notePath: string, pinned: boolean) =>
      rpc("setNotePinned", { path: notePath, pinned }) as Promise<VaultSnapshot>,

    createKanbanBoard: (name: string) => rpc("createKanbanBoard", name) as Promise<VaultSnapshot>,

    updateKanbanBoard: (boardId: string, data: { name?: string }) =>
      rpc("updateKanbanBoard", { boardId, ...data }) as Promise<VaultSnapshot>,

    deleteKanbanBoard: (boardId: string) => rpc("deleteKanbanBoard", boardId) as Promise<VaultSnapshot>,

    createKanbanColumn: (boardId: string, name: string) =>
      rpc("createKanbanColumn", { boardId, name }) as Promise<VaultSnapshot>,

    updateKanbanColumn: (
      columnId: string,
      data: { name?: string; position?: number },
    ) => rpc("updateKanbanColumn", { columnId, ...data }) as Promise<VaultSnapshot>,

    deleteKanbanColumn: (columnId: string) =>
      rpc("deleteKanbanColumn", columnId) as Promise<VaultSnapshot>,

    reorderKanbanColumns: (boardId: string, columnIds: string[]) =>
      rpc("reorderKanbanColumns", { boardId, columnIds }) as Promise<VaultSnapshot>,

    moveKanbanNote: (
      boardId: string,
      notePath: string,
      toColumnId: string | null,
      position?: number,
    ) =>
      rpc("moveKanbanNote", { boardId, notePath, toColumnId, position: position ?? 0 }) as Promise<VaultSnapshot>,

    exportJson: () => rpc("exportJson") as Promise<boolean>,
    exportHtml: (payload: { html: string; suggestedFileName: string }) =>
      rpc("exportHtml", payload) as Promise<boolean>,
    importJson: () => rpc("importJson") as Promise<VaultSnapshot>,

    importImages: (paths: string[]) => rpc("importImages", paths) as Promise<ImportedImage[]>,

    importAttachmentBuffers: (entries: Array<{ name: string; data: Uint8Array | number[] | ArrayBuffer }>) =>
      rpc(
        "importAttachmentBuffers",
        {
          entries: entries.map((e) => {
            const raw = e.data;
            let arr: number[];
            if (raw instanceof Uint8Array) arr = [...raw];
            else if (raw instanceof ArrayBuffer) arr = [...new Uint8Array(raw)];
            else arr = raw as number[];
            return { name: e.name, data: arr };
          }),
        },
      ) as Promise<ImportAttachmentBuffersResult>,

    getAttachmentSummaries: () => rpc("getAttachmentSummaries") as Promise<VaultAttachmentSummary[]>,

    getOrganizeSuggestions: (notePath: string, onProgress?: (progress: SemanticIndexProgress) => void) =>
      rpc(
        "getOrganizeSuggestions",
        { notePath },
        onProgress as ((progress: unknown) => void) | undefined,
      ) as Promise<OrganizeSuggestionsResponse>,

    getBulkOrganizeSuggestions: (onProgress?: (progress: unknown) => void) =>
      rpc(
        "getBulkOrganizeSuggestions",
        undefined,
        onProgress,
      ) as Promise<BulkOrganizeSuggestionsResponse>,

    moveNoteToFolder: (notePath: string, targetFolder: string) =>
      rpc("moveNoteToFolder", { notePath, targetFolder }) as Promise<{
        notePath: string;
        note: NoteSummary;
        snapshot: VaultSnapshot;
      }>,

    moveNotesToFolders: (moves: Array<{ notePath: string; targetFolder: string }>) =>
      rpc("moveNotesToFolders", { moves }) as Promise<BulkMoveNotesResponse>,

    setWorkspacePreferences: (preferences: { preferFolderHierarchy: boolean }) =>
      rpc("setWorkspacePreferences", preferences) as Promise<VaultSnapshot>,

    semanticSearch: (query: string, limit?: number, onProgress?: (progress: SemanticIndexProgress) => void) =>
      rpc(
        "semanticSearch",
        { query, limit },
        onProgress as ((progress: unknown) => void) | undefined,
      ) as Promise<SemanticSearchResponse>,

    getSemanticSearchSettings: () => rpc("getSemanticSearchSettings") as Promise<SemanticSearchSettings>,

    revealSemanticModelCache: () => rpc("revealSemanticModelCache") as Promise<string>,

    updateSemanticSearchSettings: (
      settings: Partial<Pick<SemanticSearchSettings, "modelId" | "allowRemoteModels" | "modelCachePath">>,
    ) =>
      rpc("updateSemanticSearchSettings", settings) as Promise<SemanticSearchSettings>,

    updateSemanticIndex: (onProgress?: (progress: SemanticIndexProgress) => void) =>
      rpc(
        "updateSemanticIndex",
        undefined,
        onProgress as ((progress: unknown) => void) | undefined,
      ) as Promise<SemanticIndexSyncResult>,

    rebuildSemanticIndex: (onProgress?: (progress: SemanticIndexProgress) => void) =>
      rpc(
        "rebuildSemanticIndex",
        undefined,
        onProgress as ((progress: unknown) => void) | undefined,
      ) as Promise<SemanticIndexSyncResult>,

    readAssetDataUrls: (paths: string[]) => rpc("readAssetDataUrls", { paths }) as Promise<Record<string, string>>,

    getPathForFile: () => "",

    resolveAssetUrl: (relativePath: string) => assetUrlCache.get(relativePath) ?? "",

    prefetchAssets: async (paths: string[]) => {
      const unresolved = paths.filter((p) => !assetUrlCache.has(p) && !missingAssetCache.has(p));
      if (unresolved.length === 0) return;
      const rec = (await rpc("resolveAssetUris", { paths: unresolved })) as Record<string, string>;
      for (const [k, v] of Object.entries(rec)) {
        if (v) assetUrlCache.set(k, v);
      }
      for (const p of unresolved) {
        if (!rec[p]) missingAssetCache.add(p);
      }
    },

    onOpenFind: () => () => undefined,
    onFindNext: () => () => undefined,
    onFindPrevious: () => () => undefined,
  };
}

export async function ensureVaultImageUrl(relativeAssetPath: string): Promise<string | undefined> {
  if (missingAssetCache.has(relativeAssetPath)) return undefined;
  const cached = assetUrlCache.get(relativeAssetPath) ?? "";
  if (cached) return cached;
  const u = (await rpc("resolveAssetUri", relativeAssetPath)) as string;
  if (u) assetUrlCache.set(relativeAssetPath, u);
  else missingAssetCache.add(relativeAssetPath);
  return u || undefined;
}

export function openExternalInHost(uri: string): void {
  void rpc("openExternal", { uri });
}

export function openVaultAttachmentInHost(relativePath: string): Promise<void> {
  return rpc("openVaultAsset", relativePath) as Promise<void>;
}

/** Drop resolved webview URLs when the vault root changes (paths may collide across vaults). */
export function clearTipsboardResolvedAssetCache(): void {
  assetUrlCache.clear();
  missingAssetCache.clear();
}

window.tipsboardDesktop = wireDesktop();
