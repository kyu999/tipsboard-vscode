import type { ImportedImage, NoteSummary, VaultSnapshot } from "@/types";

export {};

declare global {
  interface Window {
    tipsboardDesktop: {
      getSnapshot: () => Promise<VaultSnapshot>;
      selectFolder: () => Promise<VaultSnapshot>;
      createNote: (title: string) => Promise<{ notePath: string; snapshot: VaultSnapshot }>;
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
      importJson: () => Promise<VaultSnapshot>;
      importImages: (paths: string[]) => Promise<ImportedImage[]>;
      importImageBuffers: (
        entries: Array<{ name: string; data: Uint8Array | number[] | ArrayBuffer }>,
      ) => Promise<ImportedImage[]>;
      prefetchAssets: (paths: string[]) => Promise<void>;
      getPathForFile: (file: File) => string;
      resolveAssetUrl: (relativePath: string) => string;
      onOpenFind: (callback: () => void) => () => void;
      onFindNext: (callback: () => void) => () => void;
      onFindPrevious: (callback: () => void) => () => void;
    };
  }
}
