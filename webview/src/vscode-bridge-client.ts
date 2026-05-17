import type { ImportedImage, NoteSummary, VaultSnapshot } from "@/types";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

const pending = new Map<string, Pending>();
const assetUrlCache = new Map<string, string>();

let vscodeApi: ReturnType<typeof acquireVsCodeApi>;

function rpc(method: string, payload?: unknown): Promise<unknown> {
  vscodeApi ??= acquireVsCodeApi();
  const id = crypto.randomUUID();
  vscodeApi.postMessage({ source: "tipsboard-vscode", kind: "rpc", id, method, payload });

  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
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
  };
  if (data?.kind !== "rpc-result" || data?.source !== "tipsboard-vscode-host" || typeof data.id !== "string") {
    return;
  }
  const p = pending.get(data.id);
  if (!p) return;
  pending.delete(data.id);
  if (data.ok) p.resolve(data.result);
  else p.reject(new Error(data.error ?? "RPC failed"));
});

function wireDesktop(): typeof window.tipsboardDesktop {
  return {
    getSnapshot: () => rpc("getSnapshot") as Promise<VaultSnapshot>,

    selectFolder: () => rpc("selectFolder") as Promise<VaultSnapshot>,

    createNote: (title: string) =>
      rpc("createNote", title) as Promise<{ notePath: string; snapshot: VaultSnapshot }>,

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
    importJson: () => rpc("importJson") as Promise<VaultSnapshot>,

    importImages: (paths: string[]) => rpc("importImages", paths) as Promise<ImportedImage[]>,

    importImageBuffers: (entries: Array<{ name: string; data: Uint8Array | number[] | ArrayBuffer }>) =>
      rpc(
        "importImageBuffers",
        entries.map((e) => {
          const raw = e.data;
          let arr: number[];
          if (raw instanceof Uint8Array) arr = [...raw];
          else if (raw instanceof ArrayBuffer) arr = [...new Uint8Array(raw)];
          else arr = raw as number[];
          return { name: e.name, data: arr };
        }),
      ) as Promise<ImportedImage[]>,

    getPathForFile: () => "",

    resolveAssetUrl: (relativePath: string) => assetUrlCache.get(relativePath) ?? "",

    prefetchAssets: async (paths: string[]) => {
      const rec = (await rpc("resolveAssetUris", { paths })) as Record<string, string>;
      for (const [k, v] of Object.entries(rec)) {
        if (v) assetUrlCache.set(k, v);
      }
    },

    onOpenFind: () => () => undefined,
    onFindNext: () => () => undefined,
    onFindPrevious: () => () => undefined,
  };
}

export async function ensureVaultImageUrl(relativeAssetPath: string): Promise<string | undefined> {
  const cached = assetUrlCache.get(relativeAssetPath) ?? "";
  if (cached) return cached;
  const u = (await rpc("resolveAssetUri", relativeAssetPath)) as string;
  if (u) assetUrlCache.set(relativeAssetPath, u);
  return u || undefined;
}

export function openExternalInHost(uri: string): void {
  void rpc("openExternal", { uri });
}

/** Drop resolved webview URLs when the vault root changes (paths may collide across vaults). */
export function clearTipsboardResolvedAssetCache(): void {
  assetUrlCache.clear();
}

window.tipsboardDesktop = wireDesktop();
