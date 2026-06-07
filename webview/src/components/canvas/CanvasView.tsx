import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CanvasBoard, type AddCanvasNodeKind } from "@/components/canvas/CanvasBoard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TextInputDialog } from "@/components/TextInputDialog";
import { useClickOutside } from "@/shared/hooks/useClickOutside";
import type { CanvasDocument, CanvasSummary, VaultSnapshot } from "@/types";

interface CanvasViewProps {
  snapshot: VaultSnapshot;
  onCanvasesChange: (canvases: CanvasSummary[]) => void;
  onSelectNote: (path: string) => void;
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

const emptyDocument = (): CanvasDocument => ({
  version: 1,
  nodes: [],
  edges: [],
  viewport: { zoom: 1, panX: 0, panY: 0 },
});

export function CanvasView({ snapshot, onCanvasesChange, onSelectNote, onError }: CanvasViewProps) {
  const { t } = useTranslation();
  const [selectedPath, setSelectedPath] = useState<string | null>(
    snapshot.canvases[0]?.relativePath ?? null,
  );
  const [document, setDocument] = useState<CanvasDocument>(emptyDocument());
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "unsaved" | "saving" | "saved">("idle");
  const [canvasPickerOpen, setCanvasPickerOpen] = useState(false);
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const [textDialog, setTextDialog] = useState<TextDialogState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const addNodeRef = useRef<((type: AddCanvasNodeKind, payload?: Record<string, string>) => void) | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const canvasPickerRef = useClickOutside<HTMLDivElement>(canvasPickerOpen, () => setCanvasPickerOpen(false));
  const canvasMenuRef = useClickOutside<HTMLDivElement>(canvasMenuOpen, () => setCanvasMenuOpen(false));

  const selectedCanvas = useMemo(
    () => snapshot.canvases.find((c) => c.relativePath === selectedPath) ?? null,
    [selectedPath, snapshot.canvases],
  );

  const notesByPath = useMemo(
    () => new Map(snapshot.notes.map((note) => [note.path, note])),
    [snapshot.notes],
  );

  const filteredNotes = useMemo(() => {
    const q = noteQuery.trim().toLowerCase();
    const list = snapshot.notes.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return list.slice(0, 40);
    return list
      .filter((note) => note.title.toLowerCase().includes(q) || note.path.toLowerCase().includes(q))
      .slice(0, 40);
  }, [noteQuery, snapshot.notes]);

  useEffect(() => {
    if (selectedPath && snapshot.canvases.some((c) => c.relativePath === selectedPath)) return;
    setSelectedPath(snapshot.canvases[0]?.relativePath ?? null);
  }, [selectedPath, snapshot.canvases]);

  useEffect(() => {
    if (!selectedPath) {
      setDocument(emptyDocument());
      return;
    }
    let cancelled = false;
    setLoading(true);
    void window.tipsboardDesktop
      .getCanvas(selectedPath)
      .then((doc) => {
        if (!cancelled) {
          setDocument(doc);
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

  const scheduleSave = useCallback(
    (next: CanvasDocument) => {
      if (!selectedPath) return;
      setSaveState("unsaved");
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        setSaveState("saving");
        void window.tipsboardDesktop
          .saveCanvas(selectedPath, next)
          .then((canvases) => {
            onCanvasesChange(canvases);
            setSaveState("saved");
          })
          .catch((error) => {
            setSaveState("unsaved");
            onError(messageForError(error));
          });
      }, 500);
    },
    [onCanvasesChange, onError, selectedPath],
  );

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

  const registerAddNode = useCallback((fn: typeof addNodeRef.current) => {
    addNodeRef.current = fn;
  }, []);

  const addNode = useCallback((type: AddCanvasNodeKind, payload?: Record<string, string>) => {
    addNodeRef.current?.(type, payload);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-stone-300/70 bg-bg-primary px-4 py-2">
        <div ref={canvasPickerRef} className="relative">
          <button
            type="button"
            className="tb-btn-secondary text-sm"
            onClick={() => setCanvasPickerOpen((open) => !open)}
            aria-expanded={canvasPickerOpen}
          >
            {selectedCanvas?.name ?? t("canvas.noCanvas")}
            <i className="fa-solid fa-chevron-down ml-2 text-xs" aria-hidden />
          </button>
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
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-xl border border-stone-300/80 bg-bg-card py-1 shadow-soft">
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

        <div className="ml-auto flex items-center gap-2 text-xs text-text-muted">
          {saveState === "unsaved" && t("canvas.save.unsaved")}
          {saveState === "saving" && t("canvas.save.saving")}
          {saveState === "saved" && t("canvas.save.saved")}
        </div>
      </header>

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
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
            <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-stone-300/80 bg-bg-card/95 px-2 py-1.5 shadow-soft backdrop-blur">
              <ToolbarButton icon="fa-font" label={t("canvas.nodes.text")} onClick={() => addNode("text")} />
              <ToolbarButton
                icon="fa-file-lines"
                label={t("canvas.nodes.note")}
                onClick={() => {
                  setNotePickerOpen(true);
                  setNoteQuery("");
                }}
              />
              <ToolbarButton
                icon="fa-image"
                label={t("canvas.nodes.image")}
                onClick={() =>
                  setTextDialog({
                    title: t("canvas.prompts.imagePath"),
                    label: t("canvas.prompts.imagePath"),
                    confirmLabel: t("canvas.actions.add"),
                    onSubmit: (path) => {
                      addNode("image", { path });
                      setTextDialog(null);
                    },
                  })
                }
              />
              <ToolbarButton
                icon="fa-link"
                label={t("canvas.nodes.link")}
                onClick={() =>
                  setTextDialog({
                    title: t("canvas.prompts.linkUrl"),
                    label: t("canvas.prompts.linkUrl"),
                    initialValue: "https://",
                    confirmLabel: t("canvas.actions.add"),
                    onSubmit: (url) => {
                      addNode("link", { url });
                      setTextDialog(null);
                    },
                  })
                }
              />
              <ToolbarButton icon="fa-object-group" label={t("canvas.nodes.group")} onClick={() => addNode("group")} />
            </div>
          </div>

          <CanvasBoard
            key={selectedPath}
            document={document}
            notesByPath={notesByPath}
            onSelectNote={onSelectNote}
            onDocumentChange={scheduleSave}
            registerAddNode={registerAddNode}
          />
        </div>
      )}

      {notePickerOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNotePickerOpen(false);
          }}
        >
          <div className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-accent-link/20 bg-bg-card shadow-soft">
            <div className="border-b border-stone-200/80 px-4 py-3">
              <p className="text-sm font-semibold text-text-primary">{t("canvas.prompts.pickNote")}</p>
              <input
                className="tb-input mt-2 w-full"
                value={noteQuery}
                placeholder={t("search.placeholder")}
                onChange={(event) => setNoteQuery(event.target.value)}
                autoFocus
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto py-1">
              {filteredNotes.map((note) => (
                <li key={note.path}>
                  <button
                    type="button"
                    className="block w-full px-4 py-2 text-left hover:bg-bg-hover"
                    onClick={() => {
                      addNode("note", { path: note.path });
                      setNotePickerOpen(false);
                    }}
                  >
                    <span className="block text-sm font-medium text-text-primary">{note.title}</span>
                    <span className="block text-xs text-text-muted">{note.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
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

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-9 min-w-9 items-center justify-center gap-2 rounded-xl px-2 text-sm text-text-primary hover:bg-bg-hover"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <i className={`fa-solid ${icon}`} aria-hidden />
    </button>
  );
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
