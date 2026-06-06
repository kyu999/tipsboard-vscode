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

export {};

declare global {
  interface Window {
    tipsboardDesktop: {
      getSnapshot: () => Promise<VaultSnapshot>;
      createNote: (title: string) => Promise<{ notePath: string; note: NoteSummary }>;
      saveNote: (
        path: string,
        body: string,
      ) => Promise<{ notePath: string; note: NoteSummary }>;
      deleteNote: (path: string) => Promise<VaultSnapshot>;
      setNotePinned: (path: string, pinned: boolean) => Promise<VaultSnapshot>;
      createKanbanBoard: (name: string) => Promise<VaultSnapshot>;
      updateKanbanBoard: (boardId: string, data: { name?: string }) => Promise<VaultSnapshot>;
      deleteKanbanBoard: (boardId: string) => Promise<VaultSnapshot>;
      createKanbanColumn: (boardId: string, name: string) => Promise<VaultSnapshot>;
      updateKanbanColumn: (
        columnId: string,
        data: { name?: string; position?: number },
      ) => Promise<VaultSnapshot>;
      deleteKanbanColumn: (columnId: string) => Promise<VaultSnapshot>;
      reorderKanbanColumns: (boardId: string, columnIds: string[]) => Promise<VaultSnapshot>;
      moveKanbanNote: (
        boardId: string,
        notePath: string,
        toColumnId: string | null,
        position?: number,
      ) => Promise<VaultSnapshot>;
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
      onOpenFind: (callback: () => void) => () => void;
      onFindNext: (callback: () => void) => () => void;
      onFindPrevious: (callback: () => void) => () => void;
    };
  }
}
