import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TextInputDialog } from "@/components/TextInputDialog";
import { CanvasGraph, type CanvasLinkMode } from "@/components/canvas/CanvasGraph";
import { CanvasDetailPane } from "@/components/canvas/CanvasDetailPane";
import { useClickOutside } from "@/shared/hooks/useClickOutside";
import {
  addChildProblem,
  addChildSolution,
  buildCanvasGraphIndex,
  connectExistingNode,
  createNodeId,
  isLeafProblem,
  reassignEdgeTarget,
  removeEdgeFromDocument,
  removeNodeFromDocument,
  updateNodeInDocument,
} from "@/lib/canvas/graphUtils";
import type { CanvasDocument, CanvasEdge, CanvasLoadResult, CanvasSummary, VaultSnapshot } from "@/types";
import { CANVAS_AUTOSAVE_DELAY_MS } from "@/shared/autosaveDelays";
import { validateCanvasRules } from "@/lib/canvas/canvasRuleValidation";

interface CanvasViewProps {
  snapshot: VaultSnapshot;
  onCanvasesChange: (canvases: CanvasSummary[]) => void;
  onError: (message: string) => void;
}

interface TextDialogState {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

type LinkModeState = CanvasLinkMode | null;

const emptyDocument = (): CanvasDocument => ({ version: 1, nodes: [], edges: [] });

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function canUseCanvasShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  const tag = target.tagName;
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
}

export function CanvasView({ snapshot, onCanvasesChange, onError }: CanvasViewProps) {
  const { t } = useTranslation();
  const [selectedPath, setSelectedPath] = useState<string | null>(
    snapshot.canvases[0]?.relativePath ?? null,
  );
  const [document, setDocument] = useState<CanvasDocument>(emptyDocument());
  const [loadResult, setLoadResult] = useState<CanvasLoadResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<LinkModeState>(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "unsaved" | "saving" | "saved">("idle");
  const [canvasPickerOpen, setCanvasPickerOpen] = useState(false);
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [textDialog, setTextDialog] = useState<TextDialogState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const documentRef = useRef(document);
  const pendingSaveRef = useRef<CanvasDocument | null>(null);
  const saveStateRef = useRef(saveState);
  const canvasPickerRef = useClickOutside<HTMLDivElement>(canvasPickerOpen, () => setCanvasPickerOpen(false));
  const canvasMenuRef = useClickOutside<HTMLDivElement>(canvasMenuOpen, () => setCanvasMenuOpen(false));
  const warningsRef = useClickOutside<HTMLDivElement>(warningsOpen, () => setWarningsOpen(false));

  const ruleViolations = useMemo(() => validateCanvasRules(document), [document]);
  const parseWarnings = loadResult?.warnings ?? [];
  const warningCount = ruleViolations.length + parseWarnings.length;

  const nodeTitle = useCallback(
    (nodeId: string) => document.nodes.find((n) => n.id === nodeId)?.title?.trim() || nodeId,
    [document.nodes],
  );

  const selectedCanvas = useMemo(
    () => snapshot.canvases.find((c) => c.relativePath === selectedPath) ?? null,
    [selectedPath, snapshot.canvases],
  );

  useEffect(() => {
    if (selectedPath && snapshot.canvases.some((c) => c.relativePath === selectedPath)) return;
    setSelectedPath(snapshot.canvases[0]?.relativePath ?? null);
  }, [selectedPath, snapshot.canvases]);

  useEffect(() => {
    if (!selectedPath) {
      setDocument(emptyDocument());
      setLoadResult(null);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setEditingNodeId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void window.tipsboardDesktop
      .getCanvas(selectedPath)
      .then((result) => {
        if (!cancelled) {
          setDocument(result.document);
          setLoadResult(result);
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          setEditingNodeId(null);
          setSaveState("idle");
        }
      })
      .catch((error) => onError(messageForError(error)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onError, selectedPath]);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  const persistCanvas = useCallback(
    (doc: CanvasDocument) => {
      if (!selectedPath) return;
      setSaveState("saving");
      void window.tipsboardDesktop
        .saveCanvas(selectedPath, doc)
        .then((canvases) => {
          onCanvasesChange(canvases);
          setSaveState("saved");
        })
        .catch((error) => {
          setSaveState("unsaved");
          onError(messageForError(error));
        });
    },
    [onCanvasesChange, onError, selectedPath],
  );

  const scheduleSave = useCallback(
    (next: CanvasDocument) => {
      if (!selectedPath) return;
      pendingSaveRef.current = next;
      documentRef.current = next;
      setSaveState("unsaved");
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        persistCanvas(pendingSaveRef.current ?? documentRef.current);
      }, CANVAS_AUTOSAVE_DELAY_MS);
    },
    [persistCanvas, selectedPath],
  );

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current === null) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    persistCanvas(pendingSaveRef.current ?? documentRef.current);
  }, [persistCanvas]);

  const reloadCanvasFromDisk = useCallback(() => {
    if (!selectedPath) return;
    void window.tipsboardDesktop
      .getCanvas(selectedPath)
      .then((result) => {
        setDocument(result.document);
        setLoadResult(result);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setEditingNodeId(null);
        setSaveState("idle");
      })
      .catch((error) => onError(messageForError(error)));
  }, [onError, selectedPath]);

  useEffect(() => {
    function onHostEvent(ev: MessageEvent) {
      const d = ev.data as { source?: string; kind?: string; event?: string; paths?: string[] };
      if (d?.source !== "tipsboard-vscode-host" || d?.kind !== "event" || d.event !== "vault-files-changed") {
        return;
      }
      if (!selectedPath) return;
      const normalizedSelected = selectedPath.replace(/\\/g, "/");
      const paths = d.paths?.map((p) => p.replace(/\\/g, "/"));
      if (paths && paths.length > 0 && !paths.includes(normalizedSelected)) return;
      if (saveStateRef.current === "unsaved" || saveStateRef.current === "saving") return;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      reloadCanvasFromDisk();
    }
    window.addEventListener("message", onHostEvent);
    return () => window.removeEventListener("message", onHostEvent);
  }, [reloadCanvasFromDisk, selectedPath]);

  const openMermaidInEditor = useCallback(() => {
    if (!selectedPath) return;
    void window.tipsboardDesktop.openCanvasInEditor(selectedPath);
  }, [selectedPath]);

  const applyDocument = useCallback(
    (next: CanvasDocument) => {
      setDocument(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canUseCanvasShortcut(event.target)) return;
      if (event.key === "Escape") {
        if (linkMode) {
          setLinkMode(null);
          return;
        }
        flushPendingSave();
        setEditingNodeId(null);
        if (selectedNodeId) {
          setSelectedNodeId(null);
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedEdgeId) {
          event.preventDefault();
          applyDocument(removeEdgeFromDocument(document, selectedEdgeId));
          setSelectedEdgeId(null);
          return;
        }
        if (selectedNodeId) {
          event.preventDefault();
          const next = removeNodeFromDocument(document, selectedNodeId);
          applyDocument(next);
          setSelectedNodeId(null);
          setEditingNodeId(null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyDocument, document, flushPendingSave, linkMode, selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleCreateCanvas = useCallback(() => {
    setTextDialog({
      title: t("canvas.create.title"),
      label: t("canvas.create.name"),
      confirmLabel: t("canvas.create.create"),
      onSubmit: (name) => {
        void window.tipsboardDesktop
          .createCanvas(name)
          .then((canvases) => {
            onCanvasesChange(canvases);
            setSelectedPath(canvases[0]?.relativePath ?? null);
            setTextDialog(null);
          })
          .catch((error) => onError(messageForError(error)));
      },
    });
  }, [onCanvasesChange, onError, t]);

  const handleDeleteCanvas = useCallback(() => {
    if (!selectedPath) return;
    setConfirmDialog({
      title: t("canvas.actions.deleteCanvas"),
      message: t("canvas.deleteConfirm"),
      confirmLabel: t("canvas.actions.deleteCanvas"),
      destructive: true,
      onConfirm: () => {
        void window.tipsboardDesktop
          .deleteCanvas(selectedPath)
          .then((canvases) => {
            onCanvasesChange(canvases);
            setSelectedPath(canvases[0]?.relativePath ?? null);
            setConfirmDialog(null);
          })
          .catch((error) => onError(messageForError(error)));
      },
    });
  }, [onCanvasesChange, onError, selectedPath, t]);

  const addRootProblem = useCallback(() => {
    const id = createNodeId("problem");
    const next: CanvasDocument = {
      ...document,
      nodes: [...document.nodes, { id, type: "problem", title: "", status: "open" }],
      edges: document.edges,
    };
    applyDocument(next);
    setSelectedNodeId(id);
    setEditingNodeId(id);
  }, [applyDocument, document]);

  const addWhyChild = useCallback(
    (parentId: string) => {
      const next = addChildProblem(document, parentId, "");
      const child = next.nodes.find((n) => !document.nodes.some((o) => o.id === n.id));
      applyDocument(next);
      if (child) {
        setSelectedNodeId(child.id);
        setEditingNodeId(child.id);
      }
    },
    [applyDocument, document],
  );

  const addSolutionChild = useCallback(
    (parentId: string) => {
      const index = buildCanvasGraphIndex(document);
      if (!isLeafProblem(index, parentId)) return;
      const next = addChildSolution(document, parentId, "");
      if (next.nodes.length === document.nodes.length) return;
      const child = next.nodes.find((n) => !document.nodes.some((o) => o.id === n.id));
      applyDocument(next);
      if (child) {
        setSelectedNodeId(child.id);
        setEditingNodeId(child.id);
      }
    },
    [applyDocument, document],
  );

  const handleConnect = useCallback(
    (fromId: string, toId: string, edgeType: CanvasEdge["type"]) => {
      let next = document;
      if (linkMode?.reassignEdgeId) {
        next = reassignEdgeTarget(document, linkMode.reassignEdgeId, toId);
      } else {
        next = connectExistingNode(document, fromId, toId, edgeType);
      }
      applyDocument(next);
      setLinkMode(null);
      setSelectedEdgeId(null);
      setSelectedNodeId(toId);
    },
    [applyDocument, document, linkMode],
  );

  const handleUpdateNode = useCallback(
    (
      nodeId: string,
      patch: Parameters<typeof updateNodeInDocument>[2],
    ) => {
      setDocument((prev) => {
        const next = updateNodeInDocument(prev, nodeId, patch);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const handleChangeTitle = useCallback(
    (nodeId: string, title: string) => {
      handleUpdateNode(nodeId, { title });
    },
    [handleUpdateNode],
  );

  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  }, []);

  const handleEndEditNode = useCallback(() => {
    flushPendingSave();
    setEditingNodeId(null);
  }, [flushPendingSave]);

  const startLinkBecause = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setLinkMode({ fromId: nodeId, edgeType: "because" });
  }, []);

  const startLinkSolution = useCallback((nodeId: string) => {
    const index = buildCanvasGraphIndex(document);
    if (!isLeafProblem(index, nodeId)) return;
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setLinkMode({ fromId: nodeId, edgeType: "solved_by" });
  }, [document]);

  const reassignEdge = useCallback(
    (edgeId: string) => {
      const edge = document.edges.find((e) => e.id === edgeId);
      if (!edge) return;
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
      setLinkMode({ fromId: edge.from, edgeType: edge.type, reassignEdgeId: edgeId });
    },
    [document.edges],
  );

  const deleteNodeNow = useCallback(
    (nodeId: string) => {
      setConfirmDialog({
        title: t("canvas.actions.deleteNode"),
        message: t("canvas.deleteNodeConfirm"),
        confirmLabel: t("canvas.actions.deleteNode"),
        destructive: true,
        onConfirm: () => {
          const next = removeNodeFromDocument(document, nodeId);
          applyDocument(next);
          if (selectedNodeId === nodeId) setSelectedNodeId(null);
          if (editingNodeId === nodeId) setEditingNodeId(null);
          setConfirmDialog(null);
        },
      });
    },
    [applyDocument, document, editingNodeId, selectedNodeId, t],
  );

  const deleteEdgeNow = useCallback(
    (edgeId: string) => {
      applyDocument(removeEdgeFromDocument(document, edgeId));
      if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
    },
    [applyDocument, document, selectedEdgeId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-stone-300/70 bg-bg-primary px-4 py-2">
        <div ref={canvasPickerRef} className="relative flex items-center gap-2">
          <button
            type="button"
            className="tb-btn-secondary text-sm"
            onClick={() => setCanvasPickerOpen((open) => !open)}
            aria-expanded={canvasPickerOpen}
          >
            {selectedCanvas?.name ?? t("canvas.noCanvas")}
            <i className="fa-solid fa-chevron-down ml-2 text-xs" aria-hidden />
          </button>
          <span
            className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
            title={t("canvas.compatibilityNotice")}
          >
            {t("canvas.experimentalBadge")}
          </span>
          {canvasPickerOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[220px] rounded-xl border border-stone-300/80 bg-bg-card py-1 shadow-soft">
              {snapshot.canvases.map((canvas) => (
                <button
                  key={canvas.relativePath}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-bg-hover ${
                    canvas.relativePath === selectedPath ? "text-accent-link" : "text-text-primary"
                  }`}
                  onClick={() => {
                    setSelectedPath(canvas.relativePath);
                    setCanvasPickerOpen(false);
                  }}
                >
                  {canvas.name}
                </button>
              ))}
              <div className="my-1 h-px bg-stone-200/80" />
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-accent-link hover:bg-bg-hover"
                onClick={() => {
                  setCanvasPickerOpen(false);
                  handleCreateCanvas();
                }}
              >
                {t("canvas.actions.newCanvas")}
              </button>
            </div>
          )}
        </div>

        <div ref={canvasMenuRef} className="relative">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover"
            aria-label={t("canvas.actions.canvasMenu")}
            onClick={() => setCanvasMenuOpen((open) => !open)}
          >
            <i className="fa-solid fa-ellipsis-vertical" aria-hidden />
          </button>
          {canvasMenuOpen && selectedPath && (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[200px] rounded-xl border border-stone-300/80 bg-bg-card py-1 shadow-soft">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover"
                onClick={() => {
                  setCanvasMenuOpen(false);
                  openMermaidInEditor();
                }}
              >
                {t("canvas.actions.openInEditor")}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-accent-error hover:bg-bg-hover"
                onClick={() => {
                  setCanvasMenuOpen(false);
                  handleDeleteCanvas();
                }}
              >
                {t("canvas.actions.deleteCanvas")}
              </button>
            </div>
          )}
        </div>

        <button type="button" className="tb-btn-secondary text-xs" onClick={addRootProblem}>
          {t("canvas.actions.addRootProblem")}
        </button>

        <div className="ml-auto flex items-center gap-1.5 text-xs text-text-muted">
          {warningCount > 0 && (
            <div ref={warningsRef} className="relative">
              <button
                type="button"
                className="relative flex h-8 w-8 items-center justify-center rounded-lg text-amber-600 hover:bg-amber-50"
                title={t("canvas.rules.warningsTitle")}
                aria-label={t("canvas.rules.warningsTitle")}
                aria-expanded={warningsOpen}
                onClick={() => setWarningsOpen((open) => !open)}
              >
                <i className="fa-solid fa-triangle-exclamation text-sm" aria-hidden />
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white">
                  {warningCount > 9 ? "9+" : warningCount}
                </span>
              </button>
              {warningsOpen && (
                <div className="absolute right-0 top-full z-40 mt-1 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-amber-200/80 bg-bg-card py-2 shadow-soft">
                  <p className="px-3 pb-2 text-2xs leading-relaxed text-text-muted">{t("canvas.rules.intro")}</p>
                  {parseWarnings.length > 0 && (
                    <div className="border-t border-stone-200/80 px-3 pt-2">
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-text-muted">
                        {t("canvas.rules.parseWarningsHeading")}
                      </p>
                      <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-amber-900">
                        {parseWarnings.map((warning, index) => (
                          <li key={`parse-${index}-${warning.message}`}>
                            {warning.line
                              ? t("canvas.parseError", { line: warning.line, message: warning.message })
                              : warning.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ruleViolations.length > 0 && (
                    <div className="border-t border-stone-200/80 px-3 pt-2">
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-text-muted">
                        {t("canvas.rules.ruleViolationsHeading")}
                      </p>
                      <ul className="max-h-48 space-y-1 overflow-y-auto">
                        {ruleViolations.map((violation) => {
                          const title = nodeTitle(violation.nodeId);
                          const label =
                            violation.kind === "solution_on_non_leaf"
                              ? t("canvas.rules.solutionOnNonLeaf", {
                                  title,
                                  count: violation.solutionCount ?? 1,
                                })
                              : t("canvas.rules.uncoveredProblem", { title });
                          return (
                            <li key={`${violation.kind}-${violation.nodeId}`}>
                              <button
                                type="button"
                                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-amber-900 hover:bg-amber-50"
                                title={t("canvas.rules.selectNode")}
                                onClick={() => {
                                  setSelectedNodeId(violation.nodeId);
                                  setSelectedEdgeId(null);
                                  setWarningsOpen(false);
                                }}
                              >
                                {label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {selectedPath && (
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary"
              title={t("canvas.actions.openMermaidSource")}
              aria-label={t("canvas.actions.openMermaidSource")}
              onClick={openMermaidInEditor}
            >
              <i className="fa-solid fa-file-code text-xs" aria-hidden />
            </button>
          )}
          {saveState === "unsaved" && t("canvas.save.unsaved")}
          {saveState === "saving" && t("canvas.save.saving")}
          {saveState === "saved" && t("canvas.save.saved")}
        </div>
      </header>

      <div
        className="shrink-0 border-b border-stone-200/80 bg-stone-50/90 px-4 py-1 text-2xs leading-relaxed text-text-muted"
        role="note"
        title={t("canvas.compatibilityNotice")}
      >
        {t("canvas.experimentalBadge")} — {t("canvas.compatibilityNoticeShort")}
      </div>

      {loadResult && loadResult.errors.length > 0 && (
        <div className="shrink-0 border-b border-amber-300/60 bg-amber-50/80 px-4 py-2 text-xs text-amber-900">
          {loadResult.errors.map((e) => (
            <p key={`${e.line}-${e.message}`}>
              {t("canvas.parseError", { line: e.line, message: e.message })}
            </p>
          ))}
        </div>
      )}

      {snapshot.canvases.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
          <p className="text-lg font-semibold text-text-primary">{t("canvas.empty.title")}</p>
          <p className="mt-2 max-w-md text-center text-sm text-text-muted">{t("canvas.empty.description")}</p>
          <button type="button" className="tb-btn-primary mt-5" onClick={handleCreateCanvas}>
            {t("canvas.actions.newCanvas")}
          </button>
        </div>
      ) : loading || !selectedPath ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">{t("canvas.loading")}</div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <CanvasGraph
            document={document}
            layoutKey={selectedPath ?? ""}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            editingNodeId={editingNodeId}
            linkMode={linkMode}
            onSelectNode={handleSelectNode}
            onSelectEdge={setSelectedEdgeId}
            onStartEditNode={(id) => {
              handleSelectNode(id);
              setEditingNodeId(id);
            }}
            onUpdateNodeTitle={handleChangeTitle}
            onEndEditNode={handleEndEditNode}
            onConnect={handleConnect}
            onCancelLink={() => setLinkMode(null)}
            onStartLinkBecause={startLinkBecause}
            onStartLinkSolution={startLinkSolution}
            onAddWhy={addWhyChild}
            onAddSolution={addSolutionChild}
            onDeleteNode={deleteNodeNow}
            onDeleteEdge={deleteEdgeNow}
            onReassignEdge={reassignEdge}
            onAddRootProblem={addRootProblem}
          />
          {selectedNodeId && (
            <CanvasDetailPane
              document={document}
              selectedNodeId={selectedNodeId}
              onClose={() => handleSelectNode(null)}
              onSelectNode={(id) => handleSelectNode(id)}
              onUpdateNode={handleUpdateNode}
              onAddWhy={addWhyChild}
              onAddSolution={addSolutionChild}
              onStartLinkBecause={startLinkBecause}
              onStartLinkSolution={startLinkSolution}
            />
          )}
        </div>
      )}

      {textDialog && (
        <TextInputDialog
          title={textDialog.title}
          label={textDialog.label}
          confirmLabel={textDialog.confirmLabel}
          initialValue={textDialog.initialValue}
          onCancel={() => setTextDialog(null)}
          onSubmit={textDialog.onSubmit}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.destructive}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
        />
      )}
    </div>
  );
}
