import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TextInputDialog } from "@/components/TextInputDialog";
import { getKanbanDropPosition, type KanbanDropPlacement } from "@/lib/kanbanDropPosition";
import { runUnlessInFlight } from "@/lib/runUnlessInFlight";
import { useClickOutside } from "@/shared/hooks/useClickOutside";
import type { KanbanBoard, KanbanCardState, NoteSummary, VaultSnapshot } from "@/types";

interface KanbanBoardViewProps {
  snapshot: VaultSnapshot;
  tagMap: Map<string, string[]>;
  focusedBoardId: string | null;
  focusedColumnId: string | null;
  focusedNotePath: string | null;
  onSnapshotChange: (snapshot: VaultSnapshot) => void;
  onSelectNote: (path: string) => void;
  onFocusConsumed: () => void;
  onError: (message: string) => void;
}

interface TextDialogState {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  onSubmit: (value: string) => Promise<void> | void;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

export function KanbanBoardView({
  snapshot,
  tagMap,
  focusedBoardId,
  focusedColumnId,
  focusedNotePath,
  onSnapshotChange,
  onSelectNote,
  onFocusConsumed,
  onError,
}: KanbanBoardViewProps) {
  const { t } = useTranslation();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(
    focusedBoardId ?? snapshot.kanban.boards[0]?.id ?? null,
  );
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [existingPicker, setExistingPicker] = useState<{ columnId: string } | null>(null);
  const [existingQuery, setExistingQuery] = useState("");
  const [selectedExistingPaths, setSelectedExistingPaths] = useState<Set<string>>(() => new Set());
  const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(() => new Set());
  const [textDialog, setTextDialog] = useState<TextDialogState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const focusedScrollKeyRef = useRef<string | null>(null);
  const createKanbanCardInFlightRef = useRef(false);
  const boardPickerRef = useClickOutside<HTMLDivElement>(boardPickerOpen, () => setBoardPickerOpen(false));
  const boardMenuRef = useClickOutside<HTMLDivElement>(boardMenuOpen, () => setBoardMenuOpen(false));

  const selectedBoard = useMemo(() => {
    return snapshot.kanban.boards.find((board) => board.id === selectedBoardId) ?? null;
  }, [selectedBoardId, snapshot.kanban.boards]);

  const notesByPath = useMemo(() => {
    return new Map(snapshot.notes.map((note) => [note.path, note]));
  }, [snapshot.notes]);

  useEffect(() => {
    if (focusedBoardId) {
      setSelectedBoardId(focusedBoardId);
      return;
    }
    if (selectedBoardId && snapshot.kanban.boards.some((board) => board.id === selectedBoardId)) return;
    setSelectedBoardId(snapshot.kanban.boards[0]?.id ?? null);
  }, [focusedBoardId, selectedBoardId, snapshot.kanban.boards]);

  useEffect(() => {
    if (!focusedNotePath) return;
    setActiveTagFilters((current) => (current.size === 0 ? current : new Set()));
  }, [focusedNotePath]);

  useEffect(() => {
    if (!selectedBoard || !focusedNotePath) return;
    const scrollKey = `${selectedBoard.id}:${focusedColumnId ?? ""}:${focusedNotePath}`;
    if (focusedScrollKeyRef.current === scrollKey) return;
    const target =
      document.getElementById(`kanban-card-${encodeURIComponent(focusedNotePath)}`) ??
      (focusedColumnId ? document.getElementById(`kanban-column-${focusedColumnId}`) : null);
    if (!target) return;
    focusedScrollKeyRef.current = scrollKey;
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      onFocusConsumed();
    }, 0);
  }, [focusedColumnId, focusedNotePath, onFocusConsumed, selectedBoard]);

  const cardsByColumn = useMemo(() => {
    const grouped = new Map<string, KanbanCardState[]>();
    for (const column of selectedBoard?.columns ?? []) {
      grouped.set(column.id, []);
    }
    for (const card of selectedBoard?.cards ?? []) {
      if (card.column_id) grouped.get(card.column_id)?.push(card);
    }
    for (const cards of grouped.values()) {
      cards.sort((a, b) => a.position - b.position || titleForPath(a.note_path, notesByPath).localeCompare(titleForPath(b.note_path, notesByPath)));
    }
    return grouped;
  }, [notesByPath, selectedBoard]);

  const boardTags = useMemo(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const card of selectedBoard?.cards ?? []) {
      for (const tag of tagMap.get(card.note_path) ?? []) {
        if (seen.has(tag)) continue;
        seen.add(tag);
        tags.push(tag);
      }
    }
    return tags.sort((a, b) => a.localeCompare(b)).slice(0, 24);
  }, [selectedBoard?.cards, tagMap]);

  const tagColors = useMemo(() => {
    const colors = new Map<string, string>();
    boardTags.forEach((tag, index) => {
      colors.set(tag, TAG_COLOR_CLASSES[index % TAG_COLOR_CLASSES.length] ?? DEFAULT_TAG_COLOR_CLASS);
    });
    return colors;
  }, [boardTags]);

  const visibleCardsByColumn = useMemo(() => {
    if (activeTagFilters.size === 0) return cardsByColumn;
    const filtered = new Map<string, KanbanCardState[]>();
    for (const [columnId, cards] of cardsByColumn.entries()) {
      filtered.set(
        columnId,
        cards.filter((card) => (tagMap.get(card.note_path) ?? []).some((tag) => activeTagFilters.has(tag))),
      );
    }
    return filtered;
  }, [activeTagFilters, cardsByColumn, tagMap]);

  const availableExistingNotes = useMemo(() => {
    const cardPaths = new Set((selectedBoard?.cards ?? []).map((card) => card.note_path));
    const query = existingQuery.trim().toLowerCase();
    return snapshot.notes
      .filter((note) => !cardPaths.has(note.path))
      .filter((note) => {
        if (!query) return true;
        return (
          note.title.toLowerCase().includes(query) ||
          note.filename.toLowerCase().includes(query) ||
          note.preview.toLowerCase().includes(query) ||
          (tagMap.get(note.path) ?? []).some((tag) => tag.toLowerCase().includes(query))
        );
      });
  }, [existingQuery, selectedBoard?.cards, snapshot.notes, tagMap]);

  const applySnapshot = useCallback((next: VaultSnapshot) => {
    onSnapshotChange(next);
  }, [onSnapshotChange]);

  const handleCreateBoard = useCallback(() => {
    setTextDialog({
      title: t("kanban.createBoard.title"),
      label: t("kanban.createBoard.name"),
      confirmLabel: t("kanban.createBoard.create"),
      onSubmit: async (name) => {
        try {
          const next = await window.tipsboardDesktop.createKanbanBoard(name);
          setTextDialog(null);
          applySnapshot(next);
          setSelectedBoardId(next.kanban.boards[0]?.id ?? null);
        } catch (error) {
          onError(messageForError(error));
        }
      },
    });
  }, [applySnapshot, onError, t]);

  const handleRenameBoard = useCallback(() => {
    if (!selectedBoard) return;
    setTextDialog({
      title: t("kanban.actions.renameBoard"),
      label: t("kanban.prompts.boardName"),
      initialValue: selectedBoard.name,
      confirmLabel: t("kanban.actions.renameBoard"),
      onSubmit: async (name) => {
        try {
          const next = await window.tipsboardDesktop.updateKanbanBoard(selectedBoard.id, { name });
          setTextDialog(null);
          applySnapshot(next);
        } catch (error) {
          onError(messageForError(error));
        }
      },
    });
  }, [applySnapshot, onError, selectedBoard, t]);

  const handleDeleteBoard = useCallback(() => {
    if (!selectedBoard) return;
    setConfirmDialog({
      title: t("kanban.actions.deleteBoard"),
      message: t("kanban.deleteBoardConfirm"),
      confirmLabel: t("kanban.actions.deleteBoard"),
      destructive: true,
      onConfirm: async () => {
        try {
          const next = await window.tipsboardDesktop.deleteKanbanBoard(selectedBoard.id);
          setConfirmDialog(null);
          applySnapshot(next);
          setSelectedBoardId(next.kanban.boards[0]?.id ?? null);
        } catch (error) {
          onError(messageForError(error));
        }
      },
    });
  }, [applySnapshot, onError, selectedBoard, t]);

  const handleCreateColumn = useCallback(() => {
    if (!selectedBoard) return;
    setTextDialog({
      title: t("kanban.actions.newColumn"),
      label: t("kanban.prompts.columnName"),
      confirmLabel: t("kanban.actions.newColumn"),
      onSubmit: async (name) => {
        try {
          const next = await window.tipsboardDesktop.createKanbanColumn(selectedBoard.id, name);
          setTextDialog(null);
          applySnapshot(next);
        } catch (error) {
          onError(messageForError(error));
        }
      },
    });
  }, [applySnapshot, onError, selectedBoard, t]);

  const handleRenameColumn = useCallback((columnId: string, currentName: string) => {
    setTextDialog({
      title: t("kanban.actions.renameColumn"),
      label: t("kanban.prompts.columnName"),
      initialValue: currentName,
      confirmLabel: t("kanban.actions.renameColumn"),
      onSubmit: async (name) => {
        try {
          const next = await window.tipsboardDesktop.updateKanbanColumn(columnId, { name });
          setTextDialog(null);
          applySnapshot(next);
        } catch (error) {
          onError(messageForError(error));
        }
      },
    });
  }, [applySnapshot, onError, t]);

  const handleDeleteColumn = useCallback((columnId: string) => {
    setConfirmDialog({
      title: t("kanban.actions.deleteColumn"),
      message: t("kanban.deleteColumnConfirm"),
      confirmLabel: t("kanban.actions.deleteColumn"),
      destructive: true,
      onConfirm: async () => {
        try {
          const next = await window.tipsboardDesktop.deleteKanbanColumn(columnId);
          setConfirmDialog(null);
          applySnapshot(next);
        } catch (error) {
          onError(messageForError(error));
        }
      },
    });
  }, [applySnapshot, onError, t]);

  const handleCreateCard = useCallback((columnId: string | null) => {
    if (!selectedBoard) return;
    setTextDialog({
      title: t("kanban.actions.newCard"),
      label: t("kanban.prompts.cardTitle"),
      confirmLabel: t("kanban.actions.newCard"),
      onSubmit: async (title) => {
        await runUnlessInFlight(createKanbanCardInFlightRef, async () => {
          try {
            const created = await window.tipsboardDesktop.createNote(title);
            let next = created.snapshot;
            if (columnId) {
              const position = cardsByColumn.get(columnId)?.length ?? 0;
              next = await window.tipsboardDesktop.moveKanbanNote(selectedBoard.id, created.notePath, columnId, position);
            }
            setTextDialog(null);
            applySnapshot(next);
          } catch (error) {
            onError(messageForError(error));
          }
        });
      },
    });
  }, [applySnapshot, cardsByColumn, onError, selectedBoard, t]);

  const handleMoveNote = useCallback(async (notePath: string, columnId: string | null, position?: number) => {
    if (!selectedBoard) return;
    try {
      const nextPosition = position ?? (columnId ? getKanbanDropPosition(cardsByColumn.get(columnId) ?? [], notePath, null, "end") : 0);
      applySnapshot(await window.tipsboardDesktop.moveKanbanNote(selectedBoard.id, notePath, columnId, nextPosition));
    } catch (error) {
      onError(messageForError(error));
    }
  }, [applySnapshot, cardsByColumn, onError, selectedBoard]);

  const handleRemoveCard = useCallback((notePath: string) => {
    setConfirmDialog({
      title: t("kanban.actions.removeCard"),
      message: t("kanban.removeCardConfirm"),
      confirmLabel: t("kanban.actions.removeCard"),
      destructive: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        await handleMoveNote(notePath, null);
      },
    });
  }, [handleMoveNote, t]);

  const handleAddSelectedExisting = useCallback(async () => {
    if (!selectedBoard || !existingPicker) return;
    let next: VaultSnapshot | null = null;
    try {
      const basePosition = cardsByColumn.get(existingPicker.columnId)?.length ?? 0;
      const paths = Array.from(selectedExistingPaths);
      for (const [index, path] of paths.entries()) {
        next = await window.tipsboardDesktop.moveKanbanNote(selectedBoard.id, path, existingPicker.columnId, basePosition + index);
      }
      if (next) applySnapshot(next);
      setExistingPicker(null);
      setSelectedExistingPaths(new Set());
      setExistingQuery("");
    } catch (error) {
      onError(messageForError(error));
    }
  }, [applySnapshot, cardsByColumn, existingPicker, onError, selectedBoard, selectedExistingPaths]);

  const toggleTagFilter = useCallback((tag: string) => {
    setActiveTagFilters((current) => {
      const next = new Set(current);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  return (
    <div className="tb-shell flex min-h-0 min-w-0 flex-1 flex-col py-4 sm:py-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div ref={boardPickerRef} className="relative">
            <button
              type="button"
              className="tb-btn-ghost h-9 max-w-64 px-3 py-2 text-sm"
              onClick={() => setBoardPickerOpen((open) => !open)}
              aria-expanded={boardPickerOpen}
              aria-haspopup="menu"
              title={selectedBoard?.name ?? t("kanban.noBoard")}
            >
              <span className="truncate">{selectedBoard?.name ?? t("kanban.noBoard")}</span>
              <i className="fa-solid fa-chevron-down text-[10px] text-text-muted" aria-hidden />
            </button>
            {boardPickerOpen && (
              <div className="absolute left-0 top-10 z-40 w-64 overflow-hidden rounded-2xl border border-accent-link/10 bg-bg-card py-1 text-sm shadow-card">
                <div className="max-h-64 overflow-y-auto py-1">
                  {snapshot.kanban.boards.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-text-muted">{t("kanban.noBoard")}</p>
                  ) : (
                    snapshot.kanban.boards.map((board) => (
                      <button
                        key={board.id}
                        type="button"
                        onClick={() => {
                          setBoardPickerOpen(false);
                          setSelectedBoardId(board.id);
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                      >
                        <span className="truncate">{board.name}</span>
                        {board.id === selectedBoardId && <i className="fa-solid fa-check text-[10px] text-accent-link" aria-hidden />}
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBoardPickerOpen(false);
                    handleCreateBoard();
                  }}
                  className="flex w-full items-center gap-2 border-t border-accent-link/10 px-3 py-2 text-left text-xs font-medium text-accent-link transition-colors hover:bg-bg-hover"
                >
                  <i className="fa-solid fa-plus text-[10px]" aria-hidden />
                  {t("kanban.actions.newBoard")}
                </button>
              </div>
            )}
          </div>
          {selectedBoard && (
            <div ref={boardMenuRef} className="relative">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-text-muted hover:bg-bg-hover hover:text-text-primary"
                onClick={() => setBoardMenuOpen((open) => !open)}
                aria-expanded={boardMenuOpen}
                aria-haspopup="true"
                aria-label={t("kanban.actions.boardMenu")}
                title={t("kanban.actions.boardMenu")}
              >
                ⋯
              </button>
              {boardMenuOpen && (
                <div className="absolute right-0 top-10 z-40 w-44 overflow-hidden rounded-xl border border-accent-link/15 bg-bg-elevated p-1 shadow-dropdown">
                  <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-text-primary hover:bg-bg-hover" onClick={handleRenameBoard}>
                    {t("kanban.actions.renameBoard")}
                  </button>
                  <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-accent-error hover:bg-bg-hover" onClick={handleDeleteBoard}>
                    {t("kanban.actions.deleteBoard")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!selectedBoard ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-accent-link/20 bg-bg-primary p-8 text-center">
          <p className="text-lg font-semibold text-text-primary">{t("kanban.empty.title")}</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-text-muted">{t("kanban.empty.description")}</p>
          <button type="button" className="tb-btn-primary mt-5" onClick={handleCreateBoard}>
            {t("kanban.actions.newBoard")}
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-64 flex-1">
              <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xs text-text-muted" aria-hidden />
              <input
                value={existingPicker ? existingQuery : ""}
                onFocus={() => {
                  const columnId = selectedBoard.columns[0]?.id;
                  if (columnId) setExistingPicker({ columnId });
                }}
                onChange={(event) => setExistingQuery(event.target.value)}
                placeholder={t("kanban.existing.quickSearchPlaceholder")}
                disabled={selectedBoard.columns.length === 0}
                className="w-full rounded-full border border-accent-link/15 bg-bg-elevated py-2 pl-9 pr-4 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-link/40 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>
          {boardTags.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-2xs text-text-muted">
              <span className="font-semibold uppercase tracking-wide">{t("kanban.tagLegend")}</span>
              {boardTags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 transition-colors ${
                    activeTagFilters.has(tag)
                      ? "border-accent-link/30 bg-accent-link/10 text-text-primary"
                      : "border-accent-link/10 bg-bg-elevated hover:bg-bg-hover"
                  }`}
                >
                  <span className={`h-1.5 w-5 rounded-full ${tagColors.get(tag) ?? fallbackTagColorClass(tag)}`} aria-hidden />
                  #{tag}
                </button>
              ))}
              {activeTagFilters.size > 0 && (
                <button type="button" className="rounded-full px-2 py-1 text-2xs text-text-muted hover:bg-bg-hover hover:text-text-primary" onClick={() => setActiveTagFilters(new Set())}>
                  {t("kanban.clearTagFilters")}
                </button>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-x-auto pb-3">
            <div className="flex min-h-full gap-2">
              {selectedBoard.columns.length === 0 && (
                <div className="flex min-h-[28rem] w-60 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-accent-link/20 bg-bg-primary p-6 text-center">
                  <p className="text-sm font-semibold text-text-primary">{t("kanban.emptyColumns.title")}</p>
                  <p className="mt-2 text-xs leading-5 text-text-muted">{t("kanban.emptyColumns.description")}</p>
                  <button type="button" className="tb-btn-primary mt-4 px-4 py-2 text-xs" onClick={handleCreateColumn}>
                    {t("kanban.actions.newColumn")}
                  </button>
                </div>
              )}
              {selectedBoard.columns.map((column) => (
                <KanbanColumnLane
                  key={column.id}
                  columnId={column.id}
                  title={column.name}
                  cards={visibleCardsByColumn.get(column.id) ?? []}
                  allCards={cardsByColumn.get(column.id) ?? []}
                  notesByPath={notesByPath}
                  tagMap={tagMap}
                  tagColors={tagColors}
                  focusedNotePath={focusedNotePath}
                  focusedColumnId={focusedColumnId}
                  onDropCard={(notePath, position) => void handleMoveNote(notePath, column.id, position)}
                  onRemoveCard={handleRemoveCard}
                  onCreateCard={() => handleCreateCard(column.id)}
                  onAddExisting={() => setExistingPicker({ columnId: column.id })}
                  onRename={() => handleRenameColumn(column.id, column.name)}
                  onDelete={() => handleDeleteColumn(column.id)}
                  onSelectNote={onSelectNote}
                />
              ))}
              {selectedBoard.columns.length > 0 && (
                <button
                  type="button"
                  className="flex h-11 w-60 shrink-0 items-center gap-2 rounded-xl border border-accent-link/10 bg-bg-elevated px-3 text-left text-sm font-medium text-text-muted transition-colors hover:border-accent-link/20 hover:bg-bg-hover hover:text-text-primary"
                  onClick={handleCreateColumn}
                >
                  <span className="text-base leading-none">+</span>
                  {t("kanban.actions.addAnotherColumn")}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {existingPicker && selectedBoard && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExistingPicker(null);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-accent-link/20 bg-bg-card shadow-soft">
            <div className="flex items-center justify-between border-b border-accent-link/15 bg-bg-elevated px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">{t("kanban.existing.title")}</p>
                <p className="mt-1 text-2xs text-text-muted">{t("kanban.existing.description")}</p>
              </div>
              <button type="button" className="rounded-full px-2 py-1 text-xs text-text-muted hover:bg-bg-hover" onClick={() => setExistingPicker(null)} aria-label={t("kanban.existing.close")}>
                ×
              </button>
            </div>
            <div className="border-b border-accent-link/10 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xs text-text-muted" aria-hidden />
                  <input
                    value={existingQuery}
                    onChange={(event) => setExistingQuery(event.target.value)}
                    placeholder={t("kanban.existing.searchPlaceholder")}
                    className="w-full rounded-full border border-accent-link/15 bg-bg-elevated py-2 pl-9 pr-4 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-link/40"
                    autoFocus
                  />
                </div>
                <label className="flex shrink-0 items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  {t("kanban.existing.destination")}
                  <select
                    value={existingPicker.columnId}
                    onChange={(event) => setExistingPicker({ columnId: event.target.value })}
                    className="rounded-full border border-accent-link/15 bg-bg-elevated px-3 py-2 text-xs font-medium normal-case tracking-normal text-text-primary"
                  >
                    {selectedBoard.columns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto p-3">
              {availableExistingNotes.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-text-muted">{t("kanban.existing.empty")}</p>
              ) : (
                <div className="space-y-2">
                  {availableExistingNotes.map((note) => (
                    <button
                      key={note.path}
                      type="button"
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors hover:border-accent-link/25 hover:bg-bg-hover ${
                        selectedExistingPaths.has(note.path) ? "border-accent-link/35 bg-accent-link/10" : "border-accent-link/10 bg-bg-elevated"
                      }`}
                      onClick={() => {
                        setSelectedExistingPaths((current) => {
                          const next = new Set(current);
                          if (next.has(note.path)) next.delete(note.path);
                          else next.add(note.path);
                          return next;
                        });
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            selectedExistingPaths.has(note.path) ? "border-accent-link bg-accent-link text-white" : "border-accent-link/25 bg-bg-card"
                          }`}
                          aria-hidden
                        >
                          {selectedExistingPaths.has(note.path) && <i className="fa-solid fa-check text-[9px]" aria-hidden />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-text-primary">{note.title || t("common.untitled")}</span>
                          <span className="mt-1 block truncate text-2xs text-text-muted">
                            {(tagMap.get(note.path) ?? []).length > 0 ? (tagMap.get(note.path) ?? []).map((tag) => `#${tag}`).join(" ") : t("kanban.existing.noTags")}
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-accent-link/10 px-4 py-3">
              <span className="text-2xs text-text-muted">{t("kanban.existing.selected", { count: selectedExistingPaths.size })}</span>
              <button type="button" className="tb-btn-primary px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={selectedExistingPaths.size === 0} onClick={() => void handleAddSelectedExisting()}>
                {t("kanban.existing.addSelected")}
              </button>
            </div>
          </div>
        </div>
      )}

      {textDialog && (
        <TextInputDialog
          title={textDialog.title}
          label={textDialog.label}
          initialValue={textDialog.initialValue}
          confirmLabel={textDialog.confirmLabel}
          onCancel={() => setTextDialog(null)}
          onSubmit={(value) => {
            void textDialog.onSubmit(value);
          }}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.destructive}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => {
            void confirmDialog.onConfirm();
          }}
        />
      )}
    </div>
  );
}

function KanbanColumnLane({
  columnId,
  title,
  cards,
  allCards,
  notesByPath,
  tagMap,
  tagColors,
  focusedNotePath,
  focusedColumnId,
  onDropCard,
  onRemoveCard,
  onCreateCard,
  onAddExisting,
  onRename,
  onDelete,
  onSelectNote,
}: {
  columnId: string;
  title: string;
  cards: KanbanCardState[];
  allCards: KanbanCardState[];
  notesByPath: Map<string, NoteSummary>;
  tagMap: Map<string, string[]>;
  tagColors: Map<string, string>;
  focusedNotePath: string | null;
  focusedColumnId: string | null;
  onDropCard: (notePath: string, position: number) => void;
  onRemoveCard: (notePath: string) => void;
  onCreateCard: () => void;
  onAddExisting: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSelectNote: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useClickOutside<HTMLDivElement>(menuOpen, () => setMenuOpen(false));

  const dropCard = useCallback((event: DragEvent<HTMLElement>, targetNotePath: string | null, placement: KanbanDropPlacement) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const notePath = event.dataTransfer.getData("text/plain");
    if (!notePath) return;
    onDropCard(notePath, getKanbanDropPosition(allCards, notePath, targetNotePath, placement));
  }, [allCards, onDropCard]);

  return (
    <section
      id={`kanban-column-${columnId}`}
      className={`flex max-h-full min-h-[28rem] w-60 shrink-0 flex-col rounded-xl border bg-bg-code p-2 transition-colors ${
        dragOver || focusedColumnId === columnId ? "border-accent-link/50" : "border-accent-link/10"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        dropCard(event, null, "end");
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="truncate text-sm font-semibold text-text-primary">{title}</h2>
        <div className="flex items-center gap-1">
          <span className="rounded-full px-2 py-0.5 text-2xs text-text-muted">{cards.length}</span>
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-base font-semibold text-text-muted hover:bg-bg-hover hover:text-accent-link" onClick={onCreateCard} title={t("kanban.actions.newCard")} aria-label={t("kanban.actions.newCard")}>
            +
          </button>
          <div ref={menuRef} className="relative">
            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm font-semibold text-text-muted hover:bg-bg-hover hover:text-text-primary" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-haspopup="true" aria-label={t("kanban.actions.columnMenu")} title={t("kanban.actions.columnMenu")}>
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-30 w-36 overflow-hidden rounded-xl border border-accent-link/15 bg-bg-elevated p-1 shadow-dropdown">
                <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left text-2xs font-medium text-text-primary hover:bg-bg-hover" onClick={onAddExisting}>
                  {t("kanban.actions.addExisting")}
                </button>
                <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left text-2xs font-medium text-text-primary hover:bg-bg-hover" onClick={onRename}>
                  {t("kanban.actions.renameColumn")}
                </button>
                <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left text-2xs font-medium text-accent-error hover:bg-bg-hover" onClick={onDelete}>
                  {t("kanban.actions.deleteColumn")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-0.5 pb-1">
        {cards.map((card) => {
          const note = notesByPath.get(card.note_path);
          if (!note) return null;
          const tags = tagMap.get(note.path) ?? [];
          return (
            <div
              key={note.path}
              id={`kanban-card-${encodeURIComponent(note.path)}`}
              className="group relative scroll-m-6"
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragOver(true);
              }}
              onDrop={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                dropCard(event, note.path, placement);
              }}
            >
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", note.path);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => onSelectNote(note.path)}
                className={`flex min-h-[52px] w-full shrink-0 flex-col justify-center rounded-lg border bg-bg-card px-2.5 py-1.5 text-left shadow-sm transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-accent-link/25 hover:shadow-card ${
                  focusedNotePath === note.path ? "border-accent-link/60 ring-2 ring-accent-link/20" : "border-accent-link/10"
                }`}
                title={note.title || t("common.untitled")}
              >
                {tags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1" title={tags.map((tag) => `#${tag}`).join(" ")}>
                    {tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="inline-flex max-w-[6.5rem] items-center gap-1 rounded-full bg-stone-200/55 px-1.5 py-0.5 text-[10px] font-medium leading-none text-text-muted">
                        <span className={`h-1.5 w-4 shrink-0 rounded-full ${tagColors.get(tag) ?? fallbackTagColorClass(tag)}`} aria-hidden />
                        <span className="truncate">#{tag}</span>
                      </span>
                    ))}
                    {tags.length > 3 && <span className="rounded-full bg-stone-200/55 px-1.5 py-0.5 text-[10px] font-medium leading-none text-text-muted">+{tags.length - 3}</span>}
                  </div>
                )}
                <h3 className="line-clamp-2 min-h-0 min-w-0 shrink-0 overflow-hidden break-words pr-4 text-xs font-medium leading-4 text-text-primary">
                  {note.title || t("common.untitled")}
                </h3>
              </button>
              <button
                type="button"
                className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-md bg-bg-elevated/90 text-xs text-text-muted shadow-sm hover:bg-bg-hover hover:text-accent-error group-hover:inline-flex"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveCard(note.path);
                }}
                title={t("kanban.actions.removeCard")}
                aria-label={t("kanban.actions.removeCard")}
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function titleForPath(path: string, notesByPath: Map<string, NoteSummary>): string {
  return notesByPath.get(path)?.title ?? path;
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

const TAG_COLOR_CLASSES = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-lime-500",
  "bg-fuchsia-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-pink-500",
  "bg-yellow-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-red-500",
  "bg-green-500",
  "bg-slate-500",
] as const;

const DEFAULT_TAG_COLOR_CLASS = "bg-slate-500";

function fallbackTagColorClass(tag: string): string {
  let hash = 0;
  for (const char of tag) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return TAG_COLOR_CLASSES[hash % TAG_COLOR_CLASSES.length] ?? DEFAULT_TAG_COLOR_CLASS;
}
