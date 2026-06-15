import type {
  BulkMoveNotesResponse,
  BulkOrganizeSuggestionsResponse,
  CanvasDocument,
  CanvasLoadResult,
  CanvasSummary,
  ImportedImage,
  ImportAttachmentBuffersResult,
  KanbanRpcResult,
  NoteSummary,
  OrganizeSuggestionsResponse,
  SemanticIndexProgress,
  SemanticIndexSyncResult,
  SemanticSearchResponse,
  SemanticSearchSettings,
  VaultAttachmentSummary,
  VaultSnapshot,
} from "@/types";

export {};

declare global {
  interface Window {
    tipsboardDesktop: {
      getSnapshot: () => Promise<VaultSnapshot>;
      findInboundWikiLinks: (normalizedTitle: string) => Promise<string[]>;
      createNote: (title: string) => Promise<{ notePath: string; note: NoteSummary }>;
      saveNote: (
        path: string,
        body: string,
      ) => Promise<{ notePath: string; note: NoteSummary }>;
      deleteNote: (path: string) => Promise<VaultSnapshot>;
      setNotePinned: (path: string, pinned: boolean) => Promise<VaultSnapshot>;
      createKanbanBoard: (name: string) => Promise<KanbanRpcResult>;
      updateKanbanBoard: (boardId: string, data: { name?: string }) => Promise<KanbanRpcResult>;
      deleteKanbanBoard: (boardId: string) => Promise<KanbanRpcResult>;
      createKanbanColumn: (boardId: string, name: string) => Promise<KanbanRpcResult>;
      updateKanbanColumn: (
        columnId: string,
        data: { name?: string; position?: number },
      ) => Promise<KanbanRpcResult>;
      deleteKanbanColumn: (columnId: string) => Promise<KanbanRpcResult>;
      reorderKanbanColumns: (boardId: string, columnIds: string[]) => Promise<KanbanRpcResult>;
      moveKanbanNote: (
        boardId: string,
        notePath: string,
        toColumnId: string | null,
        position?: number,
      ) => Promise<KanbanRpcResult>;
      moveKanbanNotes: (
        boardId: string,
        moves: Array<{ notePath: string; toColumnId: string | null; position: number }>,
      ) => Promise<KanbanRpcResult>;
      getKanban: () => Promise<KanbanRpcResult>;
      getCanvas: (relativePath: string) => Promise<CanvasLoadResult>;
      saveCanvas: (relativePath: string, document: CanvasDocument) => Promise<CanvasSummary[]>;
      createCanvas: (name: string) => Promise<CanvasSummary[]>;
      deleteCanvas: (relativePath: string) => Promise<CanvasSummary[]>;
      openCanvasInEditor: (relativePath: string) => Promise<null>;
      exportJson: () => Promise<boolean>;
      /** Save ダイアログで保存した場合のみ `true`（キャンセルは `false`）。 */
      exportHtml: (payload: { html: string; suggestedFileName: string }) => Promise<boolean>;
      importJson: () => Promise<VaultSnapshot>;
      importImages: (paths: string[]) => Promise<ImportedImage[]>;
      importAttachmentBuffers: (
        entries: Array<{ name: string; data: Uint8Array | number[] | ArrayBuffer }>,
      ) => Promise<ImportAttachmentBuffersResult>;
      getAttachmentSummaries: () => Promise<VaultAttachmentSummary[]>;
      getOrganizeSuggestions: (
        notePath: string,
        onProgress?: (progress: SemanticIndexProgress) => void,
      ) => Promise<OrganizeSuggestionsResponse>;
      getBulkOrganizeSuggestions: (
        onProgress?: (progress: unknown) => void,
      ) => Promise<BulkOrganizeSuggestionsResponse>;
      moveNoteToFolder: (
        notePath: string,
        targetFolder: string,
      ) => Promise<{ notePath: string; note: NoteSummary; snapshot: VaultSnapshot }>;
      moveNotesToFolders: (
        moves: Array<{ notePath: string; targetFolder: string }>,
      ) => Promise<BulkMoveNotesResponse>;
      setWorkspacePreferences: (preferences: {
        preferFolderHierarchy: boolean;
      }) => Promise<VaultSnapshot>;
      semanticSearch: (
        query: string,
        limit?: number,
        onProgress?: (progress: SemanticIndexProgress) => void,
      ) => Promise<SemanticSearchResponse>;
      getSemanticSearchSettings: () => Promise<SemanticSearchSettings>;
      revealSemanticModelCache: () => Promise<string>;
      updateSemanticSearchSettings: (
        settings: Partial<Pick<SemanticSearchSettings, "modelId" | "allowRemoteModels" | "modelCachePath">>,
      ) => Promise<SemanticSearchSettings>;
      updateSemanticIndex: (onProgress?: (progress: SemanticIndexProgress) => void) => Promise<SemanticIndexSyncResult>;
      rebuildSemanticIndex: (onProgress?: (progress: SemanticIndexProgress) => void) => Promise<SemanticIndexSyncResult>;
      readAssetDataUrls: (paths: string[]) => Promise<Record<string, string>>;
      prefetchAssets: (paths: string[]) => Promise<void>;
      getPathForFile: (file: File) => string;
      resolveAssetUrl: (relativePath: string) => string;
      toggleFullScreen: () => Promise<void>;
      onOpenFind: (callback: () => void) => () => void;
      onFindNext: (callback: () => void) => () => void;
      onFindPrevious: (callback: () => void) => () => void;
    };
  }
}
