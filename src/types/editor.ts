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

export type VaultResolutionStatus = "ready" | "no-workspace" | "multi-root";

export interface VaultSnapshot {
  vaultPath: string | null;
  vaultResolution?: VaultResolutionStatus;
  notes: NoteSummary[];
  attachments: VaultAttachmentSummary[];
  /** Pinned paths in front-of-grid order (same as `.tipsboard/pins.json`). */
  pins: string[];
  kanban: KanbanState;
  canvases: CanvasSummary[];
  /** From VS Code setting `tipsboard-vscode.maxAttachmentBytes`; omitted on partial RPC payloads. */
  attachmentMaxBytes?: number;
  /** Workspace-level Tipsboard preferences (`.tipsboard/workspace.json`). */
  workspacePreferences?: WorkspacePreferences;
}

export interface WorkspacePreferences {
  version: 1;
  preferFolderHierarchy: boolean;
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

export type CanvasSide = "top" | "right" | "bottom" | "left";

export interface CanvasViewport {
  zoom: number;
  panX: number;
  panY: number;
}

interface CanvasNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
}

export type CanvasNode =
  | (CanvasNodeBase & { type: "text"; text: string })
  | (CanvasNodeBase & { type: "note"; path: string })
  | (CanvasNodeBase & { type: "image"; path: string })
  | (CanvasNodeBase & { type: "link"; url: string })
  | (CanvasNodeBase & { type: "group"; label: string });

export type CanvasEdgeEnd = "none" | "arrow";

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide: CanvasSide;
  toSide: CanvasSide;
  label?: string;
  fromEnd?: CanvasEdgeEnd;
  toEnd?: CanvasEdgeEnd;
}

export interface CanvasDocument {
  version: 1;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
}

export interface CanvasSummary {
  relativePath: string;
  name: string;
  updatedAt: number;
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

export type OrganizeSuggestionConfidence = "high" | "medium" | "low";

export type OrganizeSuggestionSignal =
  | "wiki-link"
  | "semantic-neighbor"
  | "tag-distribution"
  | "title-pattern"
  | "folder-profile";

export interface OrganizeSuggestionReason {
  signal: OrganizeSuggestionSignal;
  message: string;
}

export interface OrganizeSuggestion {
  folder: string;
  score: number;
  confidence: OrganizeSuggestionConfidence;
  reasons: OrganizeSuggestionReason[];
}

export interface OrganizeSuggestionsResponse {
  notePath: string;
  suggestions: OrganizeSuggestion[];
  semanticEnabled: boolean;
  lowConfidence: boolean;
  hasRelativeMarkdownLinks: boolean;
}

export interface BulkOrganizeSuggestionsResponse {
  items: OrganizeSuggestionsResponse[];
  semanticEnabled: boolean;
}

export interface BulkMoveNoteResult {
  fromPath: string;
  toPath: string;
  note: NoteSummary;
}

export interface BulkMoveNotesResponse {
  snapshot: VaultSnapshot;
  moved: BulkMoveNoteResult[];
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
