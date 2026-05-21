/** Types aligned with the shared Tipsboard product spec (`CURRENT_SPEC.md`). Independent copy for this extension. */

export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

export interface NoteSummary {
  path: string;
  filename: string;
  title: string;
  normalizedTitle: string;
  body: string;
  preview: string;
  updatedAt: number;
  createdAt: number;
}

export interface VaultAttachmentReference {
  notePath: string;
  noteTitle: string;
  noteFilename: string;
  label: string;
}

export interface VaultAttachmentSummary {
  relativePath: string;
  filename: string;
  basename: string;
  extension: string;
  size: number;
  updatedAt: number;
  references: VaultAttachmentReference[];
  referenced: boolean;
}

export interface VaultSnapshot {
  vaultPath: string | null;
  notes: NoteSummary[];
  attachments: VaultAttachmentSummary[];
  /** Pinned paths in front-of-grid order (same as `.tipsboard/pins.json`). */
  pins: string[];
  kanban: KanbanState;
  /** From VS Code setting `tipsboard-vscode.maxAttachmentBytes`; omitted on partial RPC payloads. */
  attachmentMaxBytes?: number;
}

export interface KanbanColumn {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface KanbanCardState {
  note_path: string;
  column_id: string | null;
  position: number;
}

export interface KanbanBoard {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  columns: KanbanColumn[];
  cards: KanbanCardState[];
}

export interface KanbanState {
  version: 1;
  boards: KanbanBoard[];
}

export interface ImportedImage {
  markdown: string;
  relativePath: string;
}

/** Result of `importAttachmentBuffers` RPC: inserted markdown rows plus refreshed `assets/files/` index. */
export interface ImportAttachmentBuffersResult {
  imported: ImportedImage[];
  attachments: VaultAttachmentSummary[];
}

export interface ExportPage {
  id?: string;
  title: string;
  normalized_title: string;
  body: string;
  updated_at: string;
  created_at: string;
  deleted_at: string | null;
}

export interface ExportData {
  schemaVersion: 1;
  project: string;
  exportedAt: string;
  pages: ExportPage[];
}
