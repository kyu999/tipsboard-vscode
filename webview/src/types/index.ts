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
  pins: string[];
  kanban: KanbanState;
  canvases: CanvasSummary[];
  attachmentMaxBytes?: number;
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

export interface KanbanRpcResult {
  kanban: KanbanState;
}

export type CanvasNodeType = "problem" | "solution";
export type CanvasEdgeType = "because" | "solved_by";

export type CanvasProblemStatus =
  | "open"
  | "needs_deeper_analysis"
  | "root_cause_candidate"
  | "covered";

export type CanvasSolutionDecision =
  | "undecided"
  | "accepted"
  | "rejected"
  | "deferred"
  | "experiment";

export type CanvasRatingLevel = "low" | "medium" | "high";

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  title: string;
  description?: string;
  status?: CanvasProblemStatus;
  decision?: CanvasSolutionDecision;
  impact?: CanvasRatingLevel;
  effort?: CanvasRatingLevel;
  confidence?: CanvasRatingLevel;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  type: CanvasEdgeType;
}

export interface CanvasDocument {
  version: 1;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasSummary {
  relativePath: string;
  name: string;
  updatedAt: number;
}

export interface CanvasParseError {
  line: number;
  message: string;
}

export interface CanvasParseWarning {
  line?: number;
  message: string;
}

export interface CanvasLoadResult {
  document: CanvasDocument;
  warnings: CanvasParseWarning[];
  errors: CanvasParseError[];
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

export interface SemanticSearchResult {
  path: string;
  title: string;
  heading: string;
  snippet: string;
  score: number;
  startLine: number;
  endLine: number;
}

export interface SemanticSearchResponse {
  results: SemanticSearchResult[];
  indexedChunkCount: number;
  modelId: string;
}

export interface SemanticIndexProgress {
  completed: number;
  total: number;
}

export interface SemanticSearchSettings {
  modelId: string;
  allowRemoteModels: boolean;
  modelCachePath: string;
  modelIds: string[];
  /** False when `tipsboard-vscode.semanticSearch.provider` is `off`. */
  enabled: boolean;
  /** Direct URL to the semantic runtime zip for this OS (GitHub Releases). */
  runtimeDownloadUrl: string;
  /** Hugging Face page for the currently selected embedding model. */
  modelDownloadUrl: string;
  /** Hugging Face pages for each selectable model id. */
  modelDownloadUrls: Record<string, string>;
}

export interface SemanticIndexSyncResult {
  chunkCount: number;
  modelId: string;
  newlyEmbeddedCount: number;
  reusedChunkCount: number;
  updatedAt: number;
}

export interface LinkSuggestion {
  title: string;
  filename: string;
  path: string;
  duplicateTitle: boolean;
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
