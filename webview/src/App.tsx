import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { extractFirstCardRenderableImageSrc } from "@/domain/preview/firstCardImage";
import { rewriteInboundWikiTitles, wouldRewriteInboundWikiTitles } from "@/domain/links/rewriteInboundWikiTitles";
import { normalizeTitle } from "@/domain/title/title";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { KanbanBoardView } from "@/components/KanbanBoardView";
import { AttachmentLibraryView } from "@/components/AttachmentLibraryView";
import { NoteEditor } from "@/components/NoteEditor";
import { NoteTabBar } from "@/components/NoteTabBar";
import { SaveStatus } from "@/components/SaveStatus";
import { buildStandalonePageHtml } from "@/export/buildPageHtml";
import { UserGuideView } from "@/user-guide/UserGuideView";
import { collectVaultMarkdownImagePaths, sanitizeExportFilename } from "@/export/exportMarkdownPreprocess";
import { buildNoteIndex, searchNotes, type TwoHopLink } from "@/lib/noteIndex";
import { sortNotesWithPinOrder } from "@/lib/sortNotesWithPinOrder";
import {
  addOrFocusNoteTab,
  addOrFocusTagTab,
  dropTabsForMissingPaths,
  type EditorTab,
  removeTabAtId,
  renameNotePathInTabs,
} from "@/lib/editorTabs";
import {
  cloneNavMemory,
  type NavMemory,
  navMemoryEqual,
  pushNavStackLimited,
} from "@/lib/navMemory";
import { mergeCreatedNoteIntoSnapshot } from "@/lib/mergeCreatedNote";
import { runUnlessInFlight } from "@/lib/runUnlessInFlight";
import { resolveVaultFilesChangedAction } from "@/lib/vaultFilesChangedHandling";
import { changeLanguage, getSupportedLanguage, supportedLanguages } from "@/shared/i18n";
import { useClickOutside } from "@/shared/hooks/useClickOutside";
import { clearTipsboardResolvedAssetCache } from "@/vscode-bridge-client";
import type { NoteSummary, SaveState, SemanticSearchResult, VaultAttachmentSummary, VaultSnapshot } from "@/types";

const CARD_GAP = 12;
const MAX_CARD_WIDTH = 168;

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm?: () => void | Promise<void>;
}

function normalizeVaultNotePath(notePath: string): string {
  return notePath.replace(/\\/g, "/");
}

function rebuildDiskCommittedTitles(snapshot: VaultSnapshot, mapRef: { current: Map<string, string> }): void {
  const map = mapRef.current;
  map.clear();
  for (const note of snapshot.notes) map.set(normalizeVaultNotePath(note.path), note.title);
}

function canUseTipsboardNavInput(confirmDialogOpen: boolean, focusTarget: EventTarget | null): boolean {
  if (confirmDialogOpen) return false;
  const tag = (focusTarget as HTMLElement | null)?.tagName ?? "";
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
}

export function App() {
  const { t, i18n } = useTranslation();
  const [snapshot, setSnapshot] = useState<VaultSnapshot>({
    vaultPath: null,
    notes: [],
    attachments: [],
    pins: [],
    kanban: { version: 1, boards: [] },
  });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "kanban" | "attachments">("list");
  const [kanbanFocus, setKanbanFocus] = useState<{
    boardId: string | null;
    columnId: string | null;
    notePath: string | null;
  }>({ boardId: null, columnId: null, notePath: null });
  const [editorSessionId, setEditorSessionId] = useState(0);
  const [query, setQuery] = useState("");
  const [listSearchFilter, setListSearchFilter] = useState<string | null>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [semanticSearchOpen, setSemanticSearchOpen] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
  const [semanticSearchBusy, setSemanticSearchBusy] = useState(false);
  const [semanticSearchError, setSemanticSearchError] = useState<string | null>(null);
  const [semanticIndexedChunkCount, setSemanticIndexedChunkCount] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const hasUnsavedChanges = saveState === "unsaved" || saveState === "error";
  const [error, setError] = useState<string | null>(null);
  const [externalChangesPending, setExternalChangesPending] = useState(false);
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false);
  const [localMenuOpen, setLocalMenuOpen] = useState(false);
  const [userGuideOpen, setUserGuideOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const noteViewScrollContainerRef = useRef<HTMLElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const listContentRef = useRef<HTMLDivElement>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const exportHtmlBannerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const createNoteInFlightRef = useRef(false);
  const prevVaultPathRef = useRef<string | null | undefined>(undefined);
  const snapshotRef = useRef(snapshot);
  const selectedPathRef = useRef(selectedPath);
  const openTabsRef = useRef(openTabs);
  const activeTabIdRef = useRef(activeTabId);
  const diskCommittedTitleRef = useRef<Map<string, string>>(new Map());
  const [exportHtmlError, setExportHtmlError] = useState<string | null>(null);
  const [exportHtmlSuccess, setExportHtmlSuccess] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(0);
  const currentLanguage = getSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

  useEffect(() => {
    openTabsRef.current = openTabs;
  }, [openTabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useLayoutEffect(() => {
    if (!selectedPath) return;
    const el = noteViewScrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [selectedPath]);

  const mergeVaultSnapshotFromHost = useCallback((next: VaultSnapshot) => {
    setSnapshot((prev) => {
      const merged: VaultSnapshot = {
        ...next,
        attachments: next.attachments ?? prev.attachments,
        attachmentMaxBytes: next.attachmentMaxBytes ?? prev.attachmentMaxBytes,
      };
      rebuildDiskCommittedTitles(merged, diskCommittedTitleRef);
      return merged;
    });
  }, []);

  const mergeNoteCreatedFromHost = useCallback((note: NoteSummary) => {
    setSnapshot((prev) => {
      const merged = mergeCreatedNoteIntoSnapshot(prev, note);
      rebuildDiskCommittedTitles(merged, diskCommittedTitleRef);
      return merged;
    });
  }, []);

  const mergeAttachmentsFromHost = useCallback((attachments: VaultAttachmentSummary[]) => {
    setSnapshot((prev) => ({ ...prev, attachments }));
  }, []);

  const refreshSnapshot = useCallback(async () => {
    try {
      setError(null);
      const next = await window.tipsboardDesktop.getSnapshot();
      const currentSelectedPath = selectedPathRef.current;
      const previousSelectedNote = currentSelectedPath
        ? snapshotRef.current.notes.find((note) => note.path === currentSelectedPath)
        : null;
      const nextSelectedNote = currentSelectedPath
        ? next.notes.find((note) => note.path === currentSelectedPath)
        : null;

      if (previousSelectedNote && nextSelectedNote && previousSelectedNote.body !== nextSelectedNote.body) {
        setEditorSessionId((current) => current + 1);
      }

      mergeVaultSnapshotFromHost(next);
      setExternalChangesPending(false);

      const pathSet = new Set(next.notes.map((n) => normalizeVaultNotePath(n.path)));
      const tabSync = dropTabsForMissingPaths(openTabsRef.current, activeTabIdRef.current, pathSet);
      setOpenTabs(tabSync.tabs);
      setActiveTabId(tabSync.activeTabId);

      const at = tabSync.tabs.find((t) => t.id === tabSync.activeTabId);
      if (tabSync.tabs.length === 0) {
        setSelectedPath((current) =>
          current && next.notes.some((note) => note.path === current) ? current : null,
        );
      } else if (at?.kind === "note") {
        setSelectedPath(next.notes.some((n) => n.path === at.path) ? at.path : null);
        setShowSearchResults(false);
      } else if (at?.kind === "tag") {
        setSelectedPath(null);
        setQuery(`#${at.tag}`);
        setListSearchFilter(null);
        setShowSearchResults(true);
      }
    } catch (caught) {
      setError(messageForError(caught));
    }
  }, [mergeVaultSnapshotFromHost]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    function onHostEvent(ev: MessageEvent) {
      const d = ev.data as { source?: string; kind?: string; event?: string };
      if (d?.source !== "tipsboard-vscode-host" || d?.kind !== "event") {
        return;
      }
      if (d.event === "vault-root-changed") {
        setExternalChangesPending(false);
        void refreshSnapshot();
        return;
      }
      if (d.event === "vault-files-changed") {
        const payload = d as { paths?: string[] };
        const action = resolveVaultFilesChangedAction({
          paths: payload.paths,
          selectedPath: selectedPathRef.current,
          hasUnsavedChanges,
        });
        if (action === "banner") {
          setExternalChangesPending(true);
          return;
        }
        void refreshSnapshot();
      }
    }
    window.addEventListener("message", onHostEvent);
    return () => window.removeEventListener("message", onHostEvent);
  }, [hasUnsavedChanges, refreshSnapshot]);

  useEffect(() => {
    if (prevVaultPathRef.current === undefined) {
      prevVaultPathRef.current = snapshot.vaultPath;
      return;
    }
    if (prevVaultPathRef.current !== snapshot.vaultPath) {
      clearTipsboardResolvedAssetCache();
      prevVaultPathRef.current = snapshot.vaultPath;
    }
  }, [snapshot.vaultPath]);

  useEffect(() => {
    function handleClickOutside(event: globalThis.MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const index = useMemo(() => buildNoteIndex(snapshot.notes), [snapshot.notes]);
  const notesByPath = useMemo(() => {
    const m = new Map<string, NoteSummary>();
    for (const n of snapshot.notes) {
      m.set(normalizeVaultNotePath(n.path), n);
    }
    return m;
  }, [snapshot.notes]);
  const selectedNote = useMemo(
    () => snapshot.notes.find((note) => note.path === selectedPath) ?? null,
    [selectedPath, snapshot.notes],
  );
  const selectedEntry = selectedNote ? index.entries.get(selectedNote.path) : null;
  const noteTagsByPath = useMemo(() => {
    return new Map([...index.entries.entries()].map(([path, entry]) => [path, entry.tags]));
  }, [index.entries]);
  const selectedKanbanStatuses = useMemo(() => {
    if (!selectedNote) return [];
    return snapshot.kanban.boards.flatMap((board) => {
      const card = board.cards.find((item) => item.note_path === selectedNote.path);
      if (!card || !card.column_id) return [];
      const column = board.columns.find((item) => item.id === card.column_id);
      if (!column) return [];
      return [{ board, column }];
    });
  }, [selectedNote, snapshot.kanban.boards]);
  const searchResults = useMemo(
    () => query.trim() ? searchNotes(snapshot.notes, query) : [],
    [query, snapshot.notes],
  );
  const listDisplayNotes = useMemo(() => {
    const subset = listSearchFilter ? searchNotes(snapshot.notes, listSearchFilter) : snapshot.notes;
    return sortNotesWithPinOrder(subset, snapshot.pins);
  }, [listSearchFilter, snapshot.notes, snapshot.pins]);

  const pinnedPathSet = useMemo(
    () => new Set((snapshot.pins ?? []).map((p) => p.replace(/\\/g, "/"))),
    [snapshot.pins],
  );

  const selectedNotePinned = Boolean(
    selectedNote && pinnedPathSet.has(selectedNote.path.replace(/\\/g, "/")),
  );

  useEffect(() => {
    const element = listContentRef.current;
    if (!element) return;

    const updateWidth = () => setListWidth(element.clientWidth);
    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [selectedPath, snapshot.notes.length, viewMode, userGuideOpen, listDisplayNotes.length]);

  const listColumns = getColumnCount(listWidth);
  const listCardWidth = getCardWidth(listWidth, listColumns);

  const vaultMenuRef = useClickOutside<HTMLDivElement>(vaultMenuOpen, () => setVaultMenuOpen(false));
  const localMenuRef = useClickOutside<HTMLDivElement>(localMenuOpen, () => setLocalMenuOpen(false));

  const navHistoryRef = useRef<NavMemory[]>([]);
  const navForwardRef = useRef<NavMemory[]>([]);
  const applyingNavHistoryRef = useRef(false);
  const navStateRef = useRef<NavMemory>({
    selectedPath: null,
    viewMode: "list",
    kanbanFocus: { boardId: null, columnId: null, notePath: null },
    userGuideOpen: false,
    listSearchFilter: null,
    openTabs: [],
    activeTabId: null,
    query: "",
    showSearchResults: false,
  });

  useEffect(() => {
    navStateRef.current = {
      selectedPath,
      viewMode,
      kanbanFocus: { ...kanbanFocus },
      userGuideOpen,
      listSearchFilter,
      openTabs,
      activeTabId,
      query,
      showSearchResults,
    };
  }, [selectedPath, viewMode, kanbanFocus, userGuideOpen, listSearchFilter, openTabs, activeTabId, query, showSearchResults]);

  function pushNavHistory() {
    if (applyingNavHistoryRef.current) return;
    navForwardRef.current = [];
    const entry = cloneNavMemory(navStateRef.current);
    const stack = navHistoryRef.current;
    const last = stack[stack.length - 1];
    if (last && navMemoryEqual(last, entry)) return;
    pushNavStackLimited(stack, entry);
  }

  const requestConfirm = useCallback((dialog: ConfirmDialogState) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog(dialog);
    });
  }, []);

  const closeConfirmDialog = useCallback((confirmed: boolean) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    resolver?.(confirmed);
  }, []);

  const confirmDiscardChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return true;
    return requestConfirm({
      title: t("page.editor.discardUnsavedTitle"),
      message: t("page.editor.discardUnsavedConfirm"),
      confirmLabel: t("page.editor.discardUnsaved"),
      destructive: true,
    });
  }, [hasUnsavedChanges, requestConfirm, t]);

  const handleSelectNote = useCallback(
    async (path: string | null, options?: { openInNewTab?: boolean }) => {
      const openInNewTab = Boolean(options?.openInNewTab);

      if (path === null) {
        if (!(await confirmDiscardChanges())) return false;
        pushNavHistory();
        setSelectedPath(null);
        setViewMode("list");
        setUserGuideOpen(false);
        setSaveState("idle");
        return true;
      }

      if (!openInNewTab && path === selectedPath && selectedPath != null) return true;

      if (!openInNewTab && !(await confirmDiscardChanges())) return false;

      if (!openInNewTab) pushNavHistory();

      const prevPath = selectedPathRef.current;
      const r = addOrFocusNoteTab(openTabsRef.current, activeTabIdRef.current, path, {
        newTab: openInNewTab,
      });
      setOpenTabs(r.tabs);
      setActiveTabId(r.activeTabId);
      const active = r.tabs.find((t) => t.id === r.activeTabId);
      if (active?.kind === "note") {
        const needsRemount = !r.focusedExisting || prevPath !== active.path;
        setSelectedPath(active.path);
        if (needsRemount) setEditorSessionId((c) => c + 1);
        setUserGuideOpen(false);
        setViewMode("list");
        setSaveState("idle");
        setShowSearchResults(false);
      }
      return true;
    },
    [confirmDiscardChanges, selectedPath],
  );

  const runSemanticSearch = useCallback(async () => {
    const trimmed = semanticQuery.trim();
    if (!trimmed) {
      setSemanticResults([]);
      setSemanticSearchError(null);
      return;
    }
    setSemanticSearchBusy(true);
    setSemanticSearchError(null);
    try {
      const response = await window.tipsboardDesktop.semanticSearch(trimmed, 20);
      setSemanticResults(response.results);
      setSemanticIndexedChunkCount(response.indexedChunkCount);
    } catch (caught) {
      setSemanticSearchError(messageForError(caught));
      setSemanticResults([]);
    } finally {
      setSemanticSearchBusy(false);
    }
  }, [semanticQuery]);

  const handleActivateTab = useCallback(
    async (tabId: string) => {
      if (tabId === activeTabId) return;
      if (!(await confirmDiscardChanges())) return;
      pushNavHistory();
      setActiveTabId(tabId);
      const target = openTabsRef.current.find((t) => t.id === tabId);
      if (!target) return;
      if (target.kind === "note") {
        setSelectedPath(target.path);
        setEditorSessionId((c) => c + 1);
        setSaveState("idle");
        setUserGuideOpen(false);
        setViewMode("list");
        setShowSearchResults(false);
      } else {
        setSelectedPath(null);
        setQuery(`#${target.tag}`);
        setListSearchFilter(null);
        setUserGuideOpen(false);
        setViewMode("list");
        setSaveState("idle");
        setShowSearchResults(true);
      }
    },
    [activeTabId, confirmDiscardChanges],
  );

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      if (tabId === activeTabIdRef.current && hasUnsavedChanges) {
        if (!(await confirmDiscardChanges())) return;
      }
      const removed = removeTabAtId(openTabsRef.current, activeTabIdRef.current, tabId);
      if (!removed) return;
      pushNavHistory();
      setOpenTabs(removed.tabs);
      setActiveTabId(removed.activeTabId);
      const na = removed.tabs.find((t) => t.id === removed.activeTabId);
      if (na?.kind === "note") {
        setSelectedPath(na.path);
        setEditorSessionId((c) => c + 1);
        setSaveState("idle");
        setShowSearchResults(false);
      } else if (na?.kind === "tag") {
        setSelectedPath(null);
        setQuery(`#${na.tag}`);
        setListSearchFilter(null);
        setSaveState("idle");
        setShowSearchResults(true);
      }
    },
    [confirmDiscardChanges, hasUnsavedChanges],
  );

  const handleCloseActiveTabFromHost = useCallback(() => {
    const id = activeTabIdRef.current;
    if (id) void handleCloseTab(id);
  }, [handleCloseTab]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    return () => {
      clearTimeout(exportHtmlBannerTimer.current);
    };
  }, []);

  const handleSelectFolder = useCallback(async () => {
    if (!(await confirmDiscardChanges())) return;
    try {
      setError(null);
      const next = await window.tipsboardDesktop.selectFolder();
      mergeVaultSnapshotFromHost(next);
      setSelectedPath(null);
      setOpenTabs([]);
      setActiveTabId(null);
      setVaultMenuOpen(false);
      setLocalMenuOpen(false);
      setUserGuideOpen(false);
      setQuery("");
      setListSearchFilter(null);
      setShowSearchResults(false);
      navHistoryRef.current = [];
      navForwardRef.current = [];
    } catch (caught) {
      setError(messageForError(caught));
    }
  }, [confirmDiscardChanges, mergeVaultSnapshotFromHost]);

  const handleApplyExternalChanges = useCallback(async () => {
    if (!(await confirmDiscardChanges())) return;
    setSaveState("idle");
    await refreshSnapshot();
  }, [confirmDiscardChanges, refreshSnapshot]);

  const handleCreateNote = useCallback(
    async (initialTitle?: string, options?: { openInNewTab?: boolean }) => {
      const wantNewTab = Boolean(options?.openInNewTab);
      const out = await runUnlessInFlight(createNoteInFlightRef, async () => {
        if (!wantNewTab && !(await confirmDiscardChanges())) return null;
        if (!wantNewTab) pushNavHistory();
        const title = initialTitle?.trim() || t("common.untitled");
        try {
          setError(null);
          const result = await window.tipsboardDesktop.createNote(title);
          mergeNoteCreatedFromHost(result.note);
          const r = addOrFocusNoteTab(
            openTabsRef.current,
            activeTabIdRef.current,
            result.notePath,
            { newTab: wantNewTab || openTabsRef.current.length === 0 },
          );
          setOpenTabs(r.tabs);
          setActiveTabId(r.activeTabId);
          setSelectedPath(result.notePath);
          setViewMode("list");
          setUserGuideOpen(false);
          setEditorSessionId((current) => current + 1);
          setSaveState("saved");
          setShowSearchResults(false);
          return result.notePath;
        } catch (caught) {
          setError(messageForError(caught));
          return null;
        }
      });
      return out ?? null;
    },
    [confirmDiscardChanges, mergeNoteCreatedFromHost, t],
  );

  useEffect(() => {
    function onCreateNoteFromHost(ev: MessageEvent) {
      const d = ev.data as { source?: string; kind?: string; event?: string };
      if (d?.source !== "tipsboard-vscode-host" || d?.kind !== "event" || d.event !== "create-note") {
        return;
      }
      const target = document.activeElement as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }
      void handleCreateNote();
    }
    window.addEventListener("message", onCreateNoteFromHost);
    return () => window.removeEventListener("message", onCreateNoteFromHost);
  }, [handleCreateNote]);

  useEffect(() => {
    function onCloseTabFromHost(ev: MessageEvent) {
      const d = ev.data as { source?: string; kind?: string; event?: string };
      if (d?.source !== "tipsboard-vscode-host" || d?.kind !== "event" || d.event !== "close-editor-tab") {
        return;
      }
      const target = document.activeElement as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }
      handleCloseActiveTabFromHost();
    }
    window.addEventListener("message", onCloseTabFromHost);
    return () => window.removeEventListener("message", onCloseTabFromHost);
  }, [handleCloseActiveTabFromHost]);

  const handleSaveNote = useCallback(
    async (path: string, body: string) => {
      let inboundRewriteConfirmed = false;
      const pathNorm = normalizeVaultNotePath(path);
      const oldCommittedTitle = diskCommittedTitleRef.current.get(pathNorm);
      const result = await window.tipsboardDesktop.saveNote(path, body);
      let mergedNotes: NoteSummary[] = [];
      setSnapshot((current) => {
        mergedNotes = upsertSavedNote(current.notes, path, result.note);
        return { ...current, notes: mergedNotes };
      });
      const resultPathNorm = normalizeVaultNotePath(result.note.path);
      if (pathNorm !== resultPathNorm) diskCommittedTitleRef.current.delete(pathNorm);
      diskCommittedTitleRef.current.set(resultPathNorm, result.note.title);

      if (
        selectedPathRef.current != null &&
        normalizeVaultNotePath(selectedPathRef.current) === pathNorm
      ) {
        selectedPathRef.current = result.note.path;
        setSelectedPath(result.note.path);
      }

      if (resultPathNorm !== pathNorm) {
        setOpenTabs((prev) => renameNotePathInTabs(prev, path, result.note.path));
      }

      const refreshDiskAttachments = () => {
        void window.tipsboardDesktop.getAttachmentSummaries().then((attachments) => {
          setSnapshot((current) => ({ ...current, attachments }));
        });
      };

      if (body.includes("assets/files/")) {
        refreshDiskAttachments();
      }

      if (oldCommittedTitle === undefined) return result.notePath;

      const oldNorm = normalizeTitle(oldCommittedTitle);
      const newTitle = result.note.title;
      if (oldNorm === normalizeTitle(newTitle)) return result.notePath;

      /** Disc-based bodies: in-memory snapshot can lag (e.g. deferred refresh while Tipsboard editor is dirty). */
      const freshSnapshot = await window.tipsboardDesktop.getSnapshot();
      const scannedNotes = freshSnapshot.notes.map((n) =>
        normalizeVaultNotePath(n.path) === resultPathNorm ? result.note : n,
      );

      const targets: { path: string; nextBody: string }[] = [];
      for (const note of scannedNotes) {
        if (!wouldRewriteInboundWikiTitles(note.body, oldNorm, newTitle)) continue;
        targets.push({
          path: note.path,
          nextBody: rewriteInboundWikiTitles(note.body, oldNorm, newTitle),
        });
      }
      if (targets.length === 0) return result.notePath;

      const confirmed = await requestConfirm({
        title: t("page.editor.rewriteInboundLinksTitle"),
        message: t("page.editor.rewriteInboundLinksMessage", {
          count: targets.length,
          oldTitle: oldCommittedTitle,
          newTitle,
        }),
        confirmLabel: t("page.editor.rewriteInboundLinksConfirm"),
        destructive: false,
      });
      if (!confirmed) return result.notePath;

      inboundRewriteConfirmed = true;

      const selfPath = result.note.path;
      const others = targets.filter((t) => t.path !== selfPath);
      const selfTarget = targets.find((t) => t.path === selfPath);

      for (const { path: targetPath, nextBody } of others) {
        try {
          const r2 = await window.tipsboardDesktop.saveNote(targetPath, nextBody);
          setSnapshot((current) => ({
            ...current,
            notes: upsertSavedNote(current.notes, targetPath, r2.note),
          }));
          diskCommittedTitleRef.current.set(r2.note.path, r2.note.title);
        } catch (caught) {
          setError(messageForError(caught));
          break;
        }
      }

      if (selfTarget) {
        try {
          const r2 = await window.tipsboardDesktop.saveNote(selfPath, selfTarget.nextBody);
          setSnapshot((current) => ({
            ...current,
            notes: upsertSavedNote(current.notes, selfPath, r2.note),
          }));
          diskCommittedTitleRef.current.set(r2.note.path, r2.note.title);
          setEditorSessionId((c) => c + 1);
        } catch (caught) {
          setError(messageForError(caught));
        }
      }

      if (inboundRewriteConfirmed) {
        refreshDiskAttachments();
      }

      return result.notePath;
    },
    [requestConfirm, t],
  );

  const handleDraftNoteChange = useCallback((path: string, body: string) => {
    setSnapshot((current) => ({
      ...current,
      notes: current.notes.map((note) => {
        if (note.path !== path) return note;
        const title = extractDraftTitle(body, note.title);
        return {
          ...note,
          title,
          normalizedTitle: normalizeTitle(title),
          body,
          preview: extractDraftPreview(body, note.filename),
        };
      }),
    }));
  }, []);

  const handleExportHtml = useCallback(async () => {
    if (!selectedNote) return;
    try {
      clearTimeout(exportHtmlBannerTimer.current);
      setExportHtmlError(null);
      setExportHtmlSuccess(null);

      const imagePaths = collectVaultMarkdownImagePaths(selectedNote.body);
      const dataUrlMap = await window.tipsboardDesktop.readAssetDataUrls(imagePaths);

      const html = await buildStandalonePageHtml({
        title: selectedNote.title,
        bodyMarkdown: selectedNote.body,
        resolveVaultImageSrcSync: (p) => dataUrlMap[p] ?? "",
      });
      const saved = await window.tipsboardDesktop.exportHtml({
        html,
        suggestedFileName: sanitizeExportFilename(selectedNote.title),
      });
      if (saved) {
        setExportHtmlSuccess(t("page.editor.exportHtmlSuccess"));
        clearTimeout(exportHtmlBannerTimer.current);
        exportHtmlBannerTimer.current = setTimeout(() => setExportHtmlSuccess(null), 4000);
      }
    } catch {
      setExportHtmlSuccess(null);
      setExportHtmlError(t("page.editor.exportHtmlError"));
      clearTimeout(exportHtmlBannerTimer.current);
      exportHtmlBannerTimer.current = setTimeout(() => setExportHtmlError(null), 4500);
    }
  }, [selectedNote, t]);

  const handleDeleteNote = useCallback(async () => {
    if (!selectedNote) return;
    const confirmed = await requestConfirm({
      title: t("page.editor.delete"),
      message: t("page.editor.deleteConfirm", { title: selectedNote.title }),
      confirmLabel: t("page.editor.delete"),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      const pathNorm = normalizeVaultNotePath(selectedNote.path);
      const next = await window.tipsboardDesktop.deleteNote(selectedNote.path);
      mergeVaultSnapshotFromHost(next);
      const prevTabs = openTabsRef.current;
      const filtered = prevTabs.filter(
        (t) => t.kind === "tag" || normalizeVaultNotePath(t.path) !== pathNorm,
      );
      if (filtered.length === 0) {
        setOpenTabs([]);
        setActiveTabId(null);
        setSelectedPath(null);
        setSaveState("idle");
        return;
      }
      let nextActive = activeTabIdRef.current;
      if (!filtered.some((t) => t.id === nextActive)) {
        nextActive = filtered[0]!.id;
      }
      const na = filtered.find((t) => t.id === nextActive);
      setOpenTabs(filtered);
      setActiveTabId(nextActive);
      if (na?.kind === "note") {
        setSelectedPath(na.path);
        setEditorSessionId((c) => c + 1);
        setShowSearchResults(false);
      } else if (na?.kind === "tag") {
        setSelectedPath(null);
        setQuery(`#${na.tag}`);
        setListSearchFilter(null);
        setShowSearchResults(true);
      }
      setSaveState("idle");
    } catch (caught) {
      setError(messageForError(caught));
    }
  }, [mergeVaultSnapshotFromHost, requestConfirm, selectedNote, t]);

  const handleToggleNotePin = useCallback(async (notePath: string, pinned: boolean) => {
    try {
      setError(null);
      const next = await window.tipsboardDesktop.setNotePinned(notePath, pinned);
      mergeVaultSnapshotFromHost(next);
    } catch (caught) {
      setError(messageForError(caught));
    }
  }, [mergeVaultSnapshotFromHost]);

  const handleLinkClick = useCallback(
    async (
      title: string,
      type: "internal" | "external" | "tag",
      options?: { openInNewTab?: boolean },
    ) => {
      const wantNewTab = Boolean(options?.openInNewTab);
      if (type === "tag") {
        if (!wantNewTab && !(await confirmDiscardChanges())) return;
        if (!wantNewTab) pushNavHistory();
        const r = addOrFocusTagTab(openTabsRef.current, activeTabIdRef.current, title, {
          newTab: wantNewTab,
        });
        setOpenTabs(r.tabs);
        setActiveTabId(r.activeTabId);
        const active = r.tabs.find((t) => t.id === r.activeTabId);
        if (active?.kind === "tag") {
          setSelectedPath(null);
          setQuery(`#${active.tag}`);
          setListSearchFilter(null);
          setUserGuideOpen(false);
          setSaveState("idle");
          setShowSearchResults(true);
          setViewMode("list");
          setKanbanFocus({ boardId: null, columnId: null, notePath: null });
        }
        return;
      }
      const existing = index.byNormalizedTitle.get(normalizeTitle(title));
      if (existing) {
        void handleSelectNote(existing.path, { openInNewTab: wantNewTab });
        return;
      }
      await handleCreateNote(title, { openInNewTab: wantNewTab });
    },
    [confirmDiscardChanges, handleCreateNote, handleSelectNote, index.byNormalizedTitle],
  );

  const handleExportJson = useCallback(async () => {
    try {
      await window.tipsboardDesktop.exportJson();
      setVaultMenuOpen(false);
      setLocalMenuOpen(false);
    } catch (caught) {
      setError(messageForError(caught));
    }
  }, []);

  const handleImportJson = useCallback(async () => {
    if (!(await confirmDiscardChanges())) return;
    try {
      const next = await window.tipsboardDesktop.importJson();
      mergeVaultSnapshotFromHost(next);
      setSelectedPath(null);
      setOpenTabs([]);
      setActiveTabId(null);
      setVaultMenuOpen(false);
      setLocalMenuOpen(false);
      setUserGuideOpen(false);
      setQuery("");
      setListSearchFilter(null);
      setShowSearchResults(false);
      navHistoryRef.current = [];
      navForwardRef.current = [];
    } catch (caught) {
      setError(messageForError(caught));
    }
  }, [confirmDiscardChanges, mergeVaultSnapshotFromHost]);

  const handleOpenCardView = useCallback(async () => {
    if (!(await confirmDiscardChanges())) return;
    pushNavHistory();
    setSelectedPath(null);
    setViewMode("list");
    setKanbanFocus({ boardId: null, columnId: null, notePath: null });
    setSaveState("idle");
    setVaultMenuOpen(false);
    setLocalMenuOpen(false);
    setUserGuideOpen(false);
  }, [confirmDiscardChanges]);

  const handleOpenKanban = useCallback(async (focus?: { boardId: string; columnId: string; notePath: string }) => {
    if (!(await confirmDiscardChanges())) return;
    pushNavHistory();
    setSelectedPath(null);
    setViewMode("kanban");
    setListSearchFilter(null);
    setKanbanFocus(focus ?? { boardId: null, columnId: null, notePath: null });
    setSaveState("idle");
    setVaultMenuOpen(false);
    setLocalMenuOpen(false);
    setUserGuideOpen(false);
  }, [confirmDiscardChanges]);

  const handleOpenAttachments = useCallback(async () => {
    if (!(await confirmDiscardChanges())) return;
    pushNavHistory();
    setSelectedPath(null);
    setViewMode("attachments");
    setListSearchFilter(null);
    setKanbanFocus({ boardId: null, columnId: null, notePath: null });
    setSaveState("idle");
    setVaultMenuOpen(false);
    setLocalMenuOpen(false);
    setUserGuideOpen(false);
    setShowSearchResults(false);
  }, [confirmDiscardChanges]);

  const handleToggleUserGuide = useCallback(async () => {
    if (userGuideOpen) {
      setUserGuideOpen(false);
      setVaultMenuOpen(false);
      setLocalMenuOpen(false);
      return;
    }
    if (!(await confirmDiscardChanges())) return;
    pushNavHistory();
    setUserGuideOpen(true);
    setSelectedPath(null);
    setViewMode("list");
    setKanbanFocus({ boardId: null, columnId: null, notePath: null });
    setSaveState("idle");
    setVaultMenuOpen(false);
    setLocalMenuOpen(false);
    setShowSearchResults(false);
  }, [confirmDiscardChanges, userGuideOpen]);

  const applyNavMemoryEntry = useCallback(
    (entry: NavMemory) => {
      let path = entry.selectedPath;
      if (path && !snapshot.notes.some((note) => note.path === path)) {
        path = null;
      }
      applyingNavHistoryRef.current = true;
      try {
        setOpenTabs(entry.openTabs.map((t) => ({ ...t })));
        setActiveTabId(entry.activeTabId);
        setQuery(entry.query);
        setShowSearchResults(entry.showSearchResults);
        setSelectedPath(path);
        setViewMode(entry.viewMode);
        setKanbanFocus({ ...entry.kanbanFocus });
        setUserGuideOpen(entry.userGuideOpen);
        setListSearchFilter(entry.listSearchFilter);
        setSaveState("idle");
        setVaultMenuOpen(false);
        setLocalMenuOpen(false);
        if (path) setEditorSessionId((current) => current + 1);
      } finally {
        applyingNavHistoryRef.current = false;
      }
    },
    [snapshot.notes],
  );

  const handleNavigateBack = useCallback(async () => {
    const stack = navHistoryRef.current;
    const prev = stack.pop();
    if (!prev) return;
    if (!(await confirmDiscardChanges())) {
      stack.push(prev);
      return;
    }
    pushNavStackLimited(navForwardRef.current, cloneNavMemory(navStateRef.current));
    applyNavMemoryEntry(prev);
  }, [applyNavMemoryEntry, confirmDiscardChanges]);

  const handleNavigateForward = useCallback(async () => {
    const forward = navForwardRef.current;
    const next = forward.pop();
    if (!next) return;
    if (!(await confirmDiscardChanges())) {
      forward.push(next);
      return;
    }
    pushNavStackLimited(navHistoryRef.current, cloneNavMemory(navStateRef.current));
    applyNavMemoryEntry(next);
  }, [applyNavMemoryEntry, confirmDiscardChanges]);

  useEffect(() => {
    const dialogOpen = confirmDialog != null;

    function onDocumentKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const inNativeField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.shiftKey && event.key.toLowerCase() === "l") {
        if (inNativeField) return;
        event.preventDefault();
        void handleOpenCardView();
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "k") {
        if (inNativeField) return;
        event.preventDefault();
        void handleOpenKanban();
        return;
      }

      const navAllowed = canUseTipsboardNavInput(dialogOpen, event.target);

      if (
        navAllowed &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();
        void handleNavigateBack();
        return;
      }

      if (navAllowed && mod && !event.shiftKey && !event.altKey && event.code === "BracketLeft") {
        event.preventDefault();
        void handleNavigateBack();
        return;
      }

      if (
        navAllowed &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        void handleNavigateForward();
        return;
      }

      if (navAllowed && mod && !event.shiftKey && !event.altKey && event.code === "BracketRight") {
        event.preventDefault();
        void handleNavigateForward();
        return;
      }

      if (navAllowed) {
        const k = event.key;
        if (k === "BrowserBack" || k === "XF86Back") {
          event.preventDefault();
          void handleNavigateBack();
          return;
        }
        if (k === "BrowserForward" || k === "XF86Forward") {
          event.preventDefault();
          void handleNavigateForward();
          return;
        }
      }
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [
    confirmDialog,
    handleNavigateBack,
    handleNavigateForward,
    handleOpenCardView,
    handleOpenKanban,
  ]);

  useEffect(() => {
    const dialogOpen = confirmDialog != null;

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      if (event.button !== 3 && event.button !== 4) return;
      if (!canUseTipsboardNavInput(dialogOpen, event.target)) return;
      event.preventDefault();
      if (event.button === 3) void handleNavigateBack();
      else void handleNavigateForward();
    }

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [confirmDialog, handleNavigateBack, handleNavigateForward]);

  const handleLanguageChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    void changeLanguage(getSupportedLanguage(event.target.value));
  }, []);

  if (!snapshot.vaultPath) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <section className="tb-card max-w-xl px-8 py-10 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-link/10 text-xl text-accent-link">
            <i className="fa-solid fa-leaf" aria-hidden />
          </div>
          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-accent-link">
            {t("onboarding.eyebrow")}
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{t("onboarding.title")}</h1>
          <p className="mt-4 text-sm leading-7 text-text-secondary">
            {t("onboarding.description")}
          </p>
          <button type="button" onClick={handleSelectFolder} className="tb-btn-primary mt-6">
            <i className="fa-solid fa-folder-open" aria-hidden />
            {t("onboarding.selectFolder")}
          </button>
          {error && <p className="mt-4 text-sm text-accent-error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <div className="m-0 flex h-[100dvh] min-h-0 w-full min-w-0 max-w-none flex-col overflow-hidden bg-bg-primary p-0">
      <div className="m-0 flex min-h-0 min-w-0 flex-1 p-0">
        <aside
          className="relative z-20 flex w-[52px] min-w-[52px] shrink-0 flex-col items-center gap-1 border-r border-stone-300/70 bg-bg-primary py-2"
          aria-label={t("layout.activityBar")}
        >
          <button
            type="button"
            onClick={() => {
              void handleToggleUserGuide();
              setVaultMenuOpen(false);
              setLocalMenuOpen(false);
            }}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 ${
              userGuideOpen
                ? "bg-accent-link/12 text-accent-link shadow-[inset_0_0_0_1px_rgba(8,127,54,0.18)]"
                : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
            }`}
            aria-pressed={userGuideOpen}
            title={t("layout.userGuide")}
            aria-label={t("layout.userGuide")}
          >
            <i className="fa-solid fa-book" aria-hidden />
          </button>

          <div className="my-0.5 h-px w-7 bg-accent-link/15" aria-hidden />

          <div ref={vaultMenuRef} className="relative flex flex-col items-center">
            <button
              type="button"
              onClick={() => {
                setVaultMenuOpen((open) => !open);
                setLocalMenuOpen(false);
              }}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 ${
                vaultMenuOpen
                  ? "bg-accent-link/12 text-accent-link shadow-[inset_0_0_0_1px_rgba(8,127,54,0.18)]"
                  : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
              }`}
              title={snapshot.vaultPath ?? undefined}
              aria-label={t("layout.currentVault")}
              aria-haspopup="menu"
              aria-expanded={vaultMenuOpen}
            >
              <i className="fa-solid fa-folder-open" aria-hidden />
            </button>
            {vaultMenuOpen && (
              <div className="absolute left-[calc(100%+10px)] top-0 z-50 w-[min(18rem,calc(100vw-5rem))] overflow-hidden rounded-2xl border border-accent-link/10 bg-bg-card py-1 text-sm shadow-dropdown">
                <p
                  className="truncate border-b border-accent-link/10 px-3 py-2 text-2xs text-text-muted"
                  title={snapshot.vaultPath ?? undefined}
                >
                  {snapshot.vaultPath}
                </p>
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <i className="fa-solid fa-folder-open text-[10px]" aria-hidden />
                  {t("layout.changeFolder")}
                </button>
              </div>
            )}
          </div>

          <div className="my-0.5 h-px w-7 bg-accent-link/15" aria-hidden />

          <button
            type="button"
            onClick={() => {
              void handleOpenCardView();
              setVaultMenuOpen(false);
              setLocalMenuOpen(false);
            }}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 ${
              viewMode === "list" && !userGuideOpen
                ? "bg-accent-link/12 text-accent-link shadow-[inset_0_0_0_1px_rgba(8,127,54,0.18)]"
                : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
            }`}
            aria-pressed={viewMode === "list" && !userGuideOpen}
            title={`${t("layout.cardView")} — ${t("layout.shortcutCards")}`}
            aria-label={t("layout.cardView")}
          >
            <i className="fa-solid fa-grip" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              void handleOpenKanban();
              setVaultMenuOpen(false);
              setLocalMenuOpen(false);
            }}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 ${
              viewMode === "kanban"
                ? "bg-accent-link/12 text-accent-link shadow-[inset_0_0_0_1px_rgba(8,127,54,0.18)]"
                : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
            }`}
            aria-pressed={viewMode === "kanban"}
            title={`${t("layout.kanban")} — ${t("layout.shortcutKanban")}`}
            aria-label={t("layout.kanban")}
          >
            <i className="fa-solid fa-table-columns" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              void handleOpenAttachments();
              setVaultMenuOpen(false);
              setLocalMenuOpen(false);
            }}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 ${
              viewMode === "attachments"
                ? "bg-accent-link/12 text-accent-link shadow-[inset_0_0_0_1px_rgba(8,127,54,0.18)]"
                : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
            }`}
            aria-pressed={viewMode === "attachments"}
            title={t("layout.attachments")}
            aria-label={t("layout.attachments")}
          >
            <i className="fa-solid fa-paperclip" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCreateNote();
              setVaultMenuOpen(false);
              setLocalMenuOpen(false);
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
            title={`${t("layout.newPage")} — ${t("layout.shortcutNewNote")}`}
            aria-label={t("layout.newPage")}
          >
            <i className="fa-solid fa-plus" aria-hidden />
          </button>
          <div className="min-h-2 flex-1" aria-hidden />
          <div ref={localMenuRef} className="relative flex flex-col items-center">
            <button
              type="button"
              onClick={() => {
                setLocalMenuOpen((open) => !open);
                setVaultMenuOpen(false);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
              title={t("layout.settings")}
              aria-label={t("layout.settings")}
              aria-haspopup="menu"
              aria-expanded={localMenuOpen}
            >
              <i className="fa-solid fa-gear" aria-hidden />
            </button>
            {localMenuOpen && (
              <div className="absolute bottom-0 left-[calc(100%+10px)] z-50 max-h-[min(22rem,calc(100dvh-4rem))] w-52 overflow-y-auto overflow-x-hidden rounded-2xl border border-accent-link/10 bg-bg-card py-1 text-sm shadow-dropdown">
                <button
                  type="button"
                  onClick={() => void handleImportJson()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <i className="fa-solid fa-file-import text-[10px]" aria-hidden />
                  {t("layout.importJson")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportJson()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <i className="fa-solid fa-file-export text-[10px]" aria-hidden />
                  {t("layout.exportJson")}
                </button>
                <div className="border-t border-accent-link/10 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                    {t("settings.sections.language")}
                  </p>
                  <p className="mt-1 text-xs text-text-primary">{t("settings.language.label")}</p>
                  <p className="mt-1 text-2xs text-text-muted">{t("settings.language.helper")}</p>
                  <select
                    value={currentLanguage}
                    onChange={handleLanguageChange}
                    className="tb-input mt-2 w-full text-sm"
                  >
                    {supportedLanguages.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="relative z-10 shrink-0 border-b border-accent-link/10 bg-bg-card/95 px-4 py-2 backdrop-blur-sm sm:px-6 lg:px-8 supports-[backdrop-filter]:bg-bg-card/80">
            <div className="mx-auto flex w-full min-w-0 max-w-6xl items-center gap-3">
              {selectedNote ? (
                <button
                  type="button"
                  onClick={() => void handleSelectNote(null)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
                  aria-label={t("page.editor.backToList")}
                  title={`${t("page.editor.backToList")} — ${t("layout.shortcutBack")}`}
                >
                  <i className="fa-solid fa-arrow-left text-sm" aria-hidden />
                </button>
              ) : userGuideOpen ? (
                <button
                  type="button"
                  onClick={() => setUserGuideOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
                  aria-label={t("page.userGuide.closeGuide")}
                  title={t("page.userGuide.closeGuide")}
                >
                  <i className="fa-solid fa-arrow-left text-sm" aria-hidden />
                </button>
              ) : (
                <span className="inline-flex h-9 w-9 shrink-0" aria-hidden />
              )}
              <div ref={searchContainerRef} className="relative min-w-0 flex-1">
                <input
                  type="text"
                  className="tb-input"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setShowSearchResults(Boolean(event.target.value.trim()));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void (async () => {
                        const trimmed = query.trim();
                        setShowSearchResults(false);
                        const needsNavigateAway =
                          selectedNote !== null || userGuideOpen || viewMode === "kanban" || viewMode === "attachments";
                        if (needsNavigateAway) {
                          if (!(await confirmDiscardChanges())) {
                            return;
                          }
                          pushNavHistory();
                          setSelectedPath(null);
                          setViewMode("list");
                          setUserGuideOpen(false);
                          setKanbanFocus({ boardId: null, columnId: null, notePath: null });
                          setSaveState("idle");
                          setVaultMenuOpen(false);
                          setLocalMenuOpen(false);
                        }
                        setListSearchFilter(trimmed || null);
                      })();
                    }
                    if (event.key === "Escape") {
                      setShowSearchResults(false);
                    }
                  }}
                  placeholder={t("search.placeholder")}
                  autoComplete="off"
                  spellCheck={false}
                />
                {showSearchResults && searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-auto rounded-2xl border border-accent-link/10 bg-bg-card shadow-dropdown">
                    {searchResults.map((note) => (
                      <button
                        key={note.path}
                        type="button"
                        onClick={(event) => {
                          const openInNewTab = event.metaKey || event.ctrlKey;
                          void handleSelectNote(note.path, { openInNewTab }).then((selected) => {
                            if (selected) {
                              setQuery("");
                              setShowSearchResults(false);
                            }
                          });
                        }}
                        className="w-full border-b border-accent-link/8 px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-bg-hover"
                      >
                        <div className="truncate text-sm font-medium text-text-primary">{note.title}</div>
                        {(note.preview || note.filename) && (
                          <div className="mt-0.5 line-clamp-1 text-2xs text-text-muted">
                            {formatPreview(note.preview || note.filename)}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {showSearchResults && searchResults.length === 0 && query.trim() && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-accent-link/10 bg-bg-card px-3.5 py-3 text-sm text-text-muted shadow-dropdown">
                    {t("search.noResults")}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setSemanticSearchOpen(true);
                    setSemanticSearchError(null);
                  }}
                  disabled={!snapshot.vaultPath}
                  aria-label={t("semanticSearch.open")}
                  title={t("semanticSearch.open")}
                >
                  <i className="fa-solid fa-wand-magic-sparkles text-sm" aria-hidden />
                </button>
                <SaveStatus state={saveState} />
              </div>
            </div>
          </header>

          <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 sm:px-6 lg:px-8">


        {error && (
          <div className="tb-shell pt-4">
            <div className="rounded-xl border border-accent-error/25 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">
              {error}
            </div>
          </div>
        )}

        {externalChangesPending && (
          <div className="tb-shell pt-4">
            <div className="flex flex-col gap-3 rounded-xl border border-accent-link/20 bg-accent-link/10 px-4 py-3 text-sm text-text-primary sm:flex-row sm:items-center sm:justify-between">
              <p>{t("sync.externalChangesPending")}</p>
              <button
                type="button"
                className="tb-btn-secondary self-start sm:self-auto"
                onClick={() => void handleApplyExternalChanges()}
              >
                {t("sync.reload")}
              </button>
            </div>
          </div>
        )}

        {openTabs.length > 0 && viewMode === "list" && !userGuideOpen && (
          <div className="tb-shell shrink-0 pt-1">
            <div className="mx-auto w-full min-w-0 max-w-5xl">
              <NoteTabBar
                tabs={openTabs}
                activeTabId={activeTabId}
                notesByPath={notesByPath}
                canClose={openTabs.length > 1}
                tabListAriaLabel={t("layout.editorTabs.tabListLabel")}
                onActivate={(id) => {
                  void handleActivateTab(id);
                }}
                onClose={(id) => {
                  void handleCloseTab(id);
                }}
                lastTabCloseTitle={t("layout.editorTabs.lastTabCannotClose")}
              />
            </div>
          </div>
        )}

        {selectedNote ? (
          <section
            ref={noteViewScrollContainerRef}
            className="tb-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto py-4 sm:py-6"
          >
            <div className="relative mx-auto w-full min-w-0 max-w-5xl">
              {exportHtmlError && (
                <div className="mb-2 rounded-lg border border-accent-error/25 bg-accent-error/10 px-2 py-1 text-xs text-accent-error">
                  {exportHtmlError}
                </div>
              )}
              {exportHtmlSuccess && (
                <div className="mb-2 rounded-lg border border-accent-link/25 bg-accent-link/10 px-2 py-1 text-xs text-accent-link">
                  {exportHtmlSuccess}
                </div>
              )}

              {selectedKanbanStatuses.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {selectedKanbanStatuses.map(({ board, column }) => (
                    <button
                      key={board.id}
                      type="button"
                      onClick={() => {
                        void handleOpenKanban({
                          boardId: board.id,
                          columnId: column.id,
                          notePath: selectedNote.path,
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-accent-link/15 bg-bg-elevated px-3 py-1 text-2xs font-medium text-text-muted transition-colors hover:border-accent-link/35 hover:bg-bg-hover hover:text-text-primary"
                      title={t("page.editor.kanbanStatus")}
                    >
                      <i className="fa-solid fa-table-columns text-[10px]" aria-hidden />
                      {board.name} / {column.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative">
                <nav
                  className="absolute right-1 top-1 z-20 flex flex-col gap-0.5 rounded-lg border border-accent-link/[0.08] bg-bg-elevated/80 p-0.5 shadow-sm backdrop-blur-[6px] sm:right-2 sm:top-2"
                  aria-label={t("page.editor.stickyNav")}
                >
                  <button
                    type="button"
                    onClick={() => void handleToggleNotePin(selectedNote.path, !selectedNotePinned)}
                    aria-pressed={selectedNotePinned}
                    aria-label={selectedNotePinned ? t("page.editor.unpinNote") : t("page.editor.pinNote")}
                    title={selectedNotePinned ? t("page.editor.unpinNote") : t("page.editor.pinNote")}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 ${
                      selectedNotePinned
                        ? "text-accent-link bg-accent-link/[0.09]"
                        : "text-text-muted/80 hover:bg-bg-hover hover:text-text-primary"
                    }`}
                  >
                    <i className="fa-solid fa-thumbtack" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExportHtml()}
                    aria-label={t("page.editor.exportHtml")}
                    title={t("page.editor.exportHtmlHint")}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[13px] text-text-muted/80 transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
                  >
                    <i className="fa-solid fa-file-export" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteNote()}
                    aria-label={t("page.editor.delete")}
                    title={t("page.editor.delete")}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[13px] text-text-muted/70 transition-colors hover:bg-accent-error/[0.08] hover:text-accent-error focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-error/25"
                  >
                    <i className="fa-solid fa-trash-can" aria-hidden />
                  </button>
                </nav>

                <NoteEditor
                  key={editorSessionId}
                  note={selectedNote}
                  suggestions={index.suggestions}
                  existingNormalizedTitles={Array.from(index.byNormalizedTitle.keys())}
                  onSave={handleSaveNote}
                  onSavedPathChange={setSelectedPath}
                  onSaveStateChange={setSaveState}
                  onLinkClick={handleLinkClick}
                  onContentChange={handleDraftNoteChange}
                  onImageDropError={setError}
                  onAttachmentIndexUpdated={mergeAttachmentsFromHost}
                  attachmentMaxBytes={snapshot.attachmentMaxBytes}
                />
              </div>

              <div className="mt-6 border-t border-accent-link/10 pt-6">
                <RelatedLinks
                  outgoing={selectedEntry?.outgoing ?? []}
                  backlinks={selectedEntry?.backlinks ?? []}
                  twoHop={selectedEntry?.twoHop ?? []}
                  newLinks={selectedEntry?.newLinks ?? []}
                  onSelect={(note, event) => {
                    const openInNewTab = event.metaKey || event.ctrlKey;
                    void handleSelectNote(note.path, { openInNewTab });
                  }}
                  onCreateLink={(title, linkOpts) => {
                    void handleLinkClick(title, "internal", linkOpts);
                  }}
                />
              </div>
            </div>
          </section>
        ) : userGuideOpen ? (
          <UserGuideView />
        ) : viewMode === "attachments" ? (
          <AttachmentLibraryView
            vaultPath={snapshot.vaultPath}
            attachments={snapshot.attachments}
            onSelectNote={(path) => {
              void handleSelectNote(path);
            }}
          />
        ) : viewMode === "kanban" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <KanbanBoardView
              snapshot={snapshot}
              tagMap={noteTagsByPath}
              focusedBoardId={kanbanFocus.boardId}
              focusedColumnId={kanbanFocus.columnId}
              focusedNotePath={kanbanFocus.notePath}
              onSnapshotChange={mergeVaultSnapshotFromHost}
              onSelectNote={(path) => {
                void handleSelectNote(path);
              }}
              onFocusConsumed={() => setKanbanFocus({ boardId: null, columnId: null, notePath: null })}
              onError={setError}
            />
          </div>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col">
            {snapshot.notes.length === 0 ? (
              <div className="tb-shell flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-20">
                <div className="tb-card max-w-md px-8 py-10 text-center">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-link/10 text-xl font-semibold text-accent-link">
                    <i className="fa-solid fa-leaf" aria-hidden />
                  </div>
                  <p className="text-lg font-semibold text-text-primary">{t("page.list.emptyTitle")}</p>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    {t("page.list.emptyDescription", {
                      newPage: t("layout.newPage"),
                      shortcut: t("layout.shortcutNewNote"),
                      shortcutCards: t("layout.shortcutCards"),
                      shortcutKanban: t("layout.shortcutKanban"),
                      shortcutBack: t("layout.shortcutBack"),
                      shortcutForward: t("layout.shortcutForward"),
                    })}
                  </p>
                  <button type="button" className="tb-btn-primary mt-5" onClick={() => void handleCreateNote()}>
                    <i className="fa-solid fa-plus" aria-hidden />
                    {t("layout.newPage")}
                  </button>
                </div>
              </div>
            ) : listDisplayNotes.length === 0 && listSearchFilter ? (
              <div className="tb-shell flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-20">
                <div className="tb-card max-w-md px-8 py-10 text-center">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-link/10 text-xl font-semibold text-accent-link">
                    <i className="fa-solid fa-magnifying-glass" aria-hidden />
                  </div>
                  <p className="text-lg font-semibold text-text-primary">{t("page.list.searchEmptyTitle")}</p>
                  <p className="mt-2 text-sm leading-6 text-text-muted">{t("page.list.searchEmptyDescription")}</p>
                  <button
                    type="button"
                    className="tb-btn-primary mt-5"
                    onClick={() => {
                      setListSearchFilter(null);
                      setQuery("");
                      setShowSearchResults(false);
                    }}
                  >
                    {t("page.list.clearSearch")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto pb-6">
                <div ref={listContentRef} className="mx-auto w-full max-w-6xl py-4 sm:py-6">
                  <div
                    className="grid justify-center gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(listDisplayNotes.length, listColumns)}, ${listCardWidth}px)`,
                    }}
                  >
                    {listDisplayNotes.map((note) => (
                      <NoteCard
                        key={note.path}
                        note={note}
                        showPinnedBadge={pinnedPathSet.has(note.path.replace(/\\/g, "/"))}
                        className="h-[150px] w-full"
                        onClick={(event) => {
                          void handleSelectNote(note.path, {
                            openInNewTab: event.metaKey || event.ctrlKey,
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
          </div>
      </main>
      </div>
      {semanticSearchOpen && (
        <SemanticSearchModal
          query={semanticQuery}
          results={semanticResults}
          busy={semanticSearchBusy}
          error={semanticSearchError}
          indexedChunkCount={semanticIndexedChunkCount}
          onQueryChange={setSemanticQuery}
          onSearch={() => void runSemanticSearch()}
          onClose={() => setSemanticSearchOpen(false)}
          onSelect={(result, event) => {
            void handleSelectNote(result.path, { openInNewTab: event.metaKey || event.ctrlKey }).then((selected) => {
              if (selected) setSemanticSearchOpen(false);
            });
          }}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.destructive}
          onCancel={() => closeConfirmDialog(false)}
          onConfirm={() => {
            void confirmDialog.onConfirm?.();
            closeConfirmDialog(true);
          }}
        />
      )}
    </div>
  );
}

function SemanticSearchModal({
  query,
  results,
  busy,
  error,
  indexedChunkCount,
  onQueryChange,
  onSearch,
  onClose,
  onSelect,
}: {
  query: string;
  results: SemanticSearchResult[];
  busy: boolean;
  error: string | null;
  indexedChunkCount: number | null;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onClose: () => void;
  onSelect: (result: SemanticSearchResult, event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation();
  const hasQuery = query.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 px-4 py-12 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-accent-link/10 bg-bg-card shadow-dropdown">
        <div className="flex items-start justify-between gap-4 border-b border-accent-link/10 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">{t("semanticSearch.title")}</h2>
            <p className="mt-1 text-xs leading-5 text-text-muted">{t("semanticSearch.description")}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
            onClick={onClose}
            aria-label={t("semanticSearch.close")}
            title={t("semanticSearch.close")}
          >
            <i className="fa-solid fa-xmark text-sm" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch();
            }}
          >
            <input
              type="text"
              className="tb-input"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("semanticSearch.placeholder")}
              autoFocus
              disabled={busy}
            />
            <button type="submit" className="tb-btn-primary shrink-0" disabled={busy || !hasQuery}>
              {busy ? t("semanticSearch.searching") : t("semanticSearch.search")}
            </button>
          </form>

          {indexedChunkCount !== null && (
            <p className="text-xs text-text-muted">
              {t("semanticSearch.indexedChunks", { count: indexedChunkCount })}
            </p>
          )}

          {error && (
            <div className="rounded-xl border border-accent-error/25 bg-accent-error/10 px-3.5 py-3 text-sm text-accent-error">
              {error}
            </div>
          )}

          <div className="max-h-[55vh] overflow-auto rounded-xl border border-accent-link/10">
            {busy ? (
              <div className="px-4 py-8 text-center text-sm text-text-muted">
                {t("semanticSearch.preparing")}
              </div>
            ) : results.length > 0 ? (
              <div className="divide-y divide-accent-link/10">
                {results.map((result) => (
                  <button
                    key={`${result.path}:${result.startLine}:${result.endLine}`}
                    type="button"
                    className="block w-full px-4 py-3 text-left transition-colors hover:bg-bg-hover focus:outline-none focus-visible:bg-bg-hover"
                    onClick={(event) => onSelect(result, event)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-text-primary">{result.title}</div>
                        {result.heading && result.heading !== result.title && (
                          <div className="mt-0.5 truncate text-xs text-accent-link">{result.heading}</div>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-accent-link/10 px-2 py-0.5 text-2xs font-semibold text-accent-link">
                        {Math.round(result.score * 100)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">{result.snippet}</p>
                  </button>
                ))}
              </div>
            ) : hasQuery ? (
              <div className="px-4 py-8 text-center text-sm text-text-muted">
                {t("semanticSearch.noResults")}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-text-muted">
                {t("semanticSearch.empty")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteCard({
  note,
  showPinnedBadge,
  onClick,
  className = "",
}: {
  note: NoteSummary;
  /** Shown only on pinned notes; toggle pin from the editor header. */
  showPinnedBadge?: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const cardImageSrc = useMemo(() => extractFirstCardRenderableImageSrc(note.body), [note.body]);
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!cardImageSrc) {
      setCardImageUrl(null);
      return;
    }
    if (cardImageSrc.startsWith("assets/images/")) {
      void window.tipsboardDesktop.prefetchAssets([cardImageSrc]).then(() => {
        const resolved = window.tipsboardDesktop.resolveAssetUrl(cardImageSrc);
        setCardImageUrl(resolved || null);
      });
      return;
    }
    setCardImageUrl(cardImageSrc);
  }, [cardImageSrc]);

  useEffect(() => {
    setPreviewImageFailed(false);
  }, [cardImageUrl]);

  return (
    <div
      className={`group tb-card relative flex min-h-0 min-w-0 flex-col overflow-hidden transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-accent-link/30 hover:shadow-soft ${className}`}
    >
      {showPinnedBadge ? (
        <span
          className="pointer-events-none absolute right-2.5 top-2.5 z-10 text-accent-link drop-shadow-[0_0_1px_rgba(255,255,255,0.95)]"
          aria-hidden
        >
          <i className="fa-solid fa-thumbtack text-xs" />
        </span>
      ) : null}

      <button
        type="button"
        onClick={(e) => onClick(e)}
        title={note.title}
        aria-label={note.title}
        className="relative flex min-h-0 flex-1 flex-col items-stretch overflow-hidden p-3 text-left"
      >
        <h3
          className={`line-clamp-2 shrink-0 min-h-0 min-w-0 break-words overflow-hidden text-xs font-semibold leading-4 tracking-tight text-text-primary ${showPinnedBadge ? "pr-8" : ""}`}
        >
          {note.title}
        </h3>
        {cardImageUrl && !previewImageFailed ? (
          <div className="mt-2.5 min-h-0 w-full flex-1 basis-0 overflow-hidden rounded-xl bg-bg-primary">
            <img
              src={cardImageUrl}
              alt=""
              loading="lazy"
              onError={() => setPreviewImageFailed(true)}
              className="block h-full w-full object-cover object-center transition-transform duration-200 group-hover:scale-[1.03]"
            />
          </div>
        ) : (
          <p className="mt-2.5 line-clamp-5 min-h-0 shrink-0 overflow-hidden whitespace-pre-line break-words text-[11px] leading-4 text-text-secondary">
            {formatPreview(note.preview || note.filename)}
          </p>
        )}
      </button>
    </div>
  );
}

function RelatedLinks({
  outgoing,
  backlinks,
  twoHop,
  newLinks,
  onSelect,
  onCreateLink,
}: {
  outgoing: NoteSummary[];
  backlinks: NoteSummary[];
  twoHop: TwoHopLink[];
  newLinks: string[];
  onSelect: (note: NoteSummary, event: ReactMouseEvent) => void;
  onCreateLink: (title: string, options?: { openInNewTab?: boolean }) => void;
}) {
  const { t } = useTranslation();

  if (outgoing.length === 0 && backlinks.length === 0 && twoHop.length === 0 && newLinks.length === 0) {
    return null;
  }

  const linkedNotes = uniqueNotes([...outgoing, ...backlinks]);

  return (
    <div className="space-y-4">
      {linkedNotes.length > 0 && (
        <RelatedLinkRow title={t("links.links")} variant="links">
          <LinkCardGrid
            notes={linkedNotes}
            onSelect={(note, event) => {
              onSelect(note, event);
            }}
          />
        </RelatedLinkRow>
      )}

      {twoHop.length > 0 && (
        <div className="space-y-4">
          {twoHop.map((hop) => (
            <TwoHopSection
              key={hop.linkingTitle}
              hop={hop}
              linkedNote={outgoing.find((note) => note.title === hop.linkingTitle)}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      <NewLinkSection titles={newLinks} onCreate={onCreateLink} />
    </div>
  );
}

type NavigationVariant = "links" | "hop" | "new";

function RelatedLinkRow({
  title,
  onNavigate,
  variant = "links",
  children,
}: {
  title: string;
  onNavigate?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  variant?: NavigationVariant;
  children: ReactNode;
}) {
  const variantClass = {
    links: "border-accent-link/40 bg-accent-link/[0.10] text-accent-link hover:border-accent-link/70",
    hop: "border-[#2563eb] bg-[#dbeafe] text-[#1d4ed8] hover:border-[#1d4ed8]",
    new: "border-[rgba(217,119,6,0.55)] bg-[rgba(217,119,6,0.08)] text-[#d97706] hover:border-[rgba(217,119,6,0.85)]",
  }[variant];
  const notchClass = {
    links: "border-r-accent-link/40",
    hop: "border-r-[#2563eb]",
    new: "border-r-[rgba(217,119,6,0.55)]",
  }[variant];
  const navCardClass = `tb-card relative flex aspect-square w-[156px] max-w-full shrink-0 flex-col items-center justify-center px-4 py-4 text-center transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-soft md:mr-1 ${variantClass}`;
  const titleNode = (
    <h3 className="line-clamp-5 break-words text-sm font-semibold leading-relaxed tracking-tight">
      {title}
    </h3>
  );

  return (
    <section className="flex flex-col gap-3 md:flex-row md:items-start">
      {onNavigate ? (
        <button type="button" onClick={(e) => onNavigate(e)} className={navCardClass} title={title}>
          <span className={`pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 border-y-[12px] border-r-[12px] border-y-transparent md:block ${notchClass}`} />
          {titleNode}
        </button>
      ) : (
        <div className={navCardClass} title={title}>
          <span className={`pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 border-y-[12px] border-r-[12px] border-y-transparent md:block ${notchClass}`} />
          {titleNode}
        </div>
      )}
      {children}
    </section>
  );
}

function TwoHopSection({
  hop,
  linkedNote,
  onSelect,
}: {
  hop: TwoHopLink;
  linkedNote?: NoteSummary;
  onSelect: (note: NoteSummary, event: ReactMouseEvent) => void;
}) {
  return (
    <RelatedLinkRow
      title={hop.linkingTitle}
      onNavigate={
        linkedNote ? (e) => onSelect(linkedNote, e) : undefined
      }
      variant="hop"
    >
      <LinkCardGrid notes={hop.pages} onSelect={onSelect} />
    </RelatedLinkRow>
  );
}

function NewLinkSection({
  titles,
  onCreate,
}: {
  titles: string[];
  onCreate: (title: string, options?: { openInNewTab?: boolean }) => void;
}) {
  const { t } = useTranslation();

  if (titles.length === 0) return null;

  return (
    <RelatedLinkRow title={t("links.newLinks")} variant="new">
      <div className="grid flex-1 grid-cols-[repeat(auto-fill,156px)] auto-rows-[156px] justify-start gap-3">
        {titles.map((title) => (
          <NewLinkCard
            key={title}
            title={title}
            onCreate={(e) =>
              onCreate(title, { openInNewTab: e.metaKey || e.ctrlKey })
            }
          />
        ))}
      </div>
    </RelatedLinkRow>
  );
}

function NewLinkCard({
  title,
  onCreate,
}: {
  title: string;
  onCreate: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onCreate(e)}
      className="group tb-card relative flex h-[156px] w-[156px] min-w-0 flex-col overflow-hidden p-3 text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-accent-link/30 hover:shadow-soft"
      title={title}
    >
      <h3 className="line-clamp-3 min-h-0 min-w-0 shrink-0 overflow-hidden break-words text-xs font-semibold leading-4 tracking-tight text-text-primary">
        {title}
      </h3>
    </button>
  );
}

function LinkCardGrid({
  notes,
  onSelect,
}: {
  notes: NoteSummary[];
  onSelect: (note: NoteSummary, event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="grid flex-1 grid-cols-[repeat(auto-fill,156px)] auto-rows-[156px] justify-start gap-3">
      {notes.map((note) => (
        <div key={note.path} className="h-[156px] w-[156px]">
          <NoteCard
            note={note}
            className="h-[156px] w-[156px]"
            onClick={(e) => onSelect(note, e)}
          />
        </div>
      ))}
    </div>
  );
}

function uniqueNotes(notes: NoteSummary[]): NoteSummary[] {
  const seen = new Set<string>();
  return notes.filter((note) => {
    if (seen.has(note.path)) return false;
    seen.add(note.path);
    return true;
  });
}

function vaultName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "Local Vault";
}

function getColumnCount(width: number): number {
  if (width >= 1080) return 7;
  if (width >= 900) return 6;
  if (width >= 740) return 5;
  if (width >= 600) return 4;
  if (width >= 460) return 3;
  if (width >= 320) return 2;
  return 1;
}

function getCardWidth(width: number, columns: number): number {
  if (width <= 0) return 156;
  return Math.min(MAX_CARD_WIDTH, (width - CARD_GAP * (columns - 1)) / columns);
}

function upsertSavedNote(
  notes: NoteSummary[],
  previousPath: string,
  savedNote: NoteSummary,
): NoteSummary[] {
  return [
    ...notes.filter((note) => note.path !== previousPath && note.path !== savedNote.path),
    savedNote,
  ].sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
}

function formatPreview(preview: string): string {
  return preview
    .replace(/(?<!\\)\[image:\S+\]/g, "")
    .replace(/(?<!\\)\[([^\[\]\n]+?)\.icon(?:\*\d+)?\]/g, "$1")
    .replace(/(?<!\\)\[([^\[\]\n]+?)\s+https?:\/\/\S+\]/g, "$1")
    .replace(/(?<!\\)\[([^\[\]\n]+?)\](?!\()/g, "$1")
    .trim();
}

function extractDraftTitle(body: string, fallback: string): string {
  const firstLine = body.split("\n", 1)[0]?.trim();
  return firstLine || fallback;
}

function extractDraftPreview(body: string, fallback: string): string {
  return body.split("\n").slice(1).join("\n").trim() || fallback;
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}
