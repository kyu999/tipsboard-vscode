import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { findNext, findPrevious, openSearchPanel } from "@codemirror/search";
import { createEditor } from "@/editor";
import { setExistingLinkTitlesEffect } from "@/editor/tipsboard-decorations";
import type { EditorViewState } from "@/lib/editorViewState";
import { NoteSaveSession, splitNoteMarkdown, type NoteDraft } from "@/lib/noteSaveSession";
import type { LinkSuggestion, NoteSummary, SaveState, VaultAttachmentSummary } from "@/types";
import { DEFAULT_ATTACHMENT_MAX_BYTES } from "@/shared/attachmentConstants";

export interface NoteEditorHandle {
  scrollToLine(lineNumber: number): void;
  focus(): void;
  setTitle(title: string): void;
  /** Explicit save (button / Mod+S). Resolves false when the save failed. */
  save(): Promise<boolean>;
  /** Waits for a running save and saves remaining edits before navigation. */
  saveBeforeLeave(): Promise<boolean>;
  /** Restores the last saved title and body. */
  discard(): void;
  isSaving(): boolean;
}

interface NoteEditorProps {
  /** Last saved note. Draft edits stay inside the editor until an explicit save. */
  note: NoteSummary;
  suggestions: LinkSuggestion[];
  existingNormalizedTitles: string[];
  onSave: (path: string, markdown: string) => Promise<string>;
  onSavedPathChange: (path: string) => void;
  onSaveStateChange: (state: SaveState) => void;
  onDraftChange?: (path: string, draft: NoteDraft) => void;
  onLinkClick: (title: string, type: "internal" | "external" | "tag", options?: { openInNewTab?: boolean }) => void;
  onImageDropError?: (message: string) => void;
  /** Merge Host-built `attachments` after Shift+drop imports into `assets/files/`. */
  onAttachmentIndexUpdated?: (attachments: VaultAttachmentSummary[]) => void;
  attachmentMaxBytes?: number;
  initialViewState?: EditorViewState | null;
  onCaptureViewState?: (path: string, state: EditorViewState) => void;
  getNoteViewScrollContainer?: () => HTMLElement | null;
}

function isSaveShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s";
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  {
    note,
    suggestions,
    existingNormalizedTitles,
    onSave,
    onSavedPathChange,
    onSaveStateChange,
    onDraftChange,
    onLinkClick,
    onImageDropError,
    onAttachmentIndexUpdated,
    attachmentMaxBytes,
    initialViewState,
    onCaptureViewState,
    getNoteViewScrollContainer,
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ReturnType<typeof createEditor> | null>(null);
  const sessionRef = useRef<NoteSaveSession | null>(null);
  const noteRef = useRef(note);
  const onSaveRef = useRef(onSave);
  const onSavedPathChangeRef = useRef(onSavedPathChange);
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  const onDraftChangeRef = useRef(onDraftChange);
  const onLinkClickRef = useRef(onLinkClick);
  const onImageDropErrorRef = useRef(onImageDropError);
  const onAttachmentIndexUpdatedRef = useRef(onAttachmentIndexUpdated);
  const suggestionsRef = useRef(suggestions);
  const existingNormalizedTitlesRef = useRef(existingNormalizedTitles);
  const attachmentMaxBytesRef = useRef(attachmentMaxBytes ?? DEFAULT_ATTACHMENT_MAX_BYTES);
  const initialViewStateRef = useRef(initialViewState);
  const onCaptureViewStateRef = useRef(onCaptureViewState);
  const getNoteViewScrollContainerRef = useRef(getNoteViewScrollContainer);

  noteRef.current = note;
  onSaveRef.current = onSave;
  onSavedPathChangeRef.current = onSavedPathChange;
  onSaveStateChangeRef.current = onSaveStateChange;
  onDraftChangeRef.current = onDraftChange;
  onLinkClickRef.current = onLinkClick;
  onImageDropErrorRef.current = onImageDropError;
  onAttachmentIndexUpdatedRef.current = onAttachmentIndexUpdated;
  suggestionsRef.current = suggestions;
  existingNormalizedTitlesRef.current = existingNormalizedTitles;
  attachmentMaxBytesRef.current = attachmentMaxBytes ?? DEFAULT_ATTACHMENT_MAX_BYTES;
  initialViewStateRef.current = initialViewState;
  onCaptureViewStateRef.current = onCaptureViewState;
  getNoteViewScrollContainerRef.current = getNoteViewScrollContainer;

  useImperativeHandle(ref, () => ({
    scrollToLine(lineNumber: number) {
      const view = viewRef.current;
      if (!view) return;
      const doc = view.state.doc;
      if (lineNumber < 1 || lineNumber > doc.lines) return;
      const line = doc.line(lineNumber);
      const lineText = line.text;
      const hashMatch = /^(\s{0,3})(#{1,6})\s/.exec(lineText);
      const cursorPos = hashMatch ? line.from + hashMatch[0].length : line.from;
      view.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        selection: EditorSelection.cursor(cursorPos),
      });
      view.focus();
    },
    focus() {
      viewRef.current?.focus();
    },
    setTitle(title: string) {
      sessionRef.current?.setTitle(title);
    },
    save() {
      return sessionRef.current?.save() ?? Promise.resolve(true);
    },
    saveBeforeLeave() {
      return sessionRef.current?.saveBeforeLeave() ?? Promise.resolve(true);
    },
    discard() {
      const session = sessionRef.current;
      const view = viewRef.current;
      if (!session || !view) return;
      const saved = session.discard();
      if (view.state.doc.toString() !== saved.body) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: saved.body } });
      }
    },
    isSaving() {
      return sessionRef.current?.saving ?? false;
    },
  }));

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setExistingLinkTitlesEffect.of(existingNormalizedTitles),
    });
  }, [existingNormalizedTitles]);

  useLayoutEffect(() => {
    if (!editorRef.current) return;
    const initialNote = noteRef.current;
    const savedViewState = initialViewStateRef.current ?? undefined;

    let reportedPath = initialNote.path;
    const session = new NoteSaveSession({
      path: initialNote.path,
      savedMarkdown: initialNote.body,
      persist: (path, markdown) => onSaveRef.current(path, markdown),
      onChange: () => {
        if (session.path !== reportedPath) {
          reportedPath = session.path;
          noteRef.current = { ...noteRef.current, path: session.path };
          onSavedPathChangeRef.current(session.path);
        }
        onSaveStateChangeRef.current(session.state);
        onDraftChangeRef.current?.(session.path, session.draft);
      },
    });
    sessionRef.current = session;
    onSaveStateChangeRef.current(session.state);
    onDraftChangeRef.current?.(session.path, session.draft);

    const view = createEditor({
      doc: splitNoteMarkdown(initialNote.body).body,
      parent: editorRef.current,
      initialViewState: savedViewState,
      getCurrentUserPageTitle: () => session.draft.title,
      onLinkClick: (title, type, options) => onLinkClickRef.current(title, type, options),
      getLinkSuggestions: () => suggestionsRef.current,
      existingNormalizedTitles: existingNormalizedTitlesRef.current,
      getMaxAttachmentBytes: () => attachmentMaxBytesRef.current,
      onImageDropError: (message) => onImageDropErrorRef.current?.(message),
      onAttachmentIndexUpdated: (attachments) => onAttachmentIndexUpdatedRef.current?.(attachments),
      onContentChange: (content) => session.setBody(content),
    });
    viewRef.current = view;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      void session.save();
    };
    document.addEventListener("keydown", onKeyDown);
    const unsubscribeOpenFind = window.tipsboardDesktop.onOpenFind(() => {
      view.focus();
      openSearchPanel(view);
    });
    const unsubscribeFindNext = window.tipsboardDesktop.onFindNext(() => {
      view.focus();
      findNext(view);
    });
    const unsubscribeFindPrevious = window.tipsboardDesktop.onFindPrevious(() => {
      view.focus();
      findPrevious(view);
    });

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unsubscribeOpenFind();
      unsubscribeFindNext();
      unsubscribeFindPrevious();
      const capture = onCaptureViewStateRef.current;
      if (capture) {
        const selection = view.state.selection.main;
        const container = getNoteViewScrollContainerRef.current?.() ?? null;
        capture(noteRef.current.path, {
          anchor: selection.anchor,
          head: selection.head,
          scrollTop: view.scrollDOM.scrollTop,
          containerScrollTop: container?.scrollTop ?? 0,
        });
      }
      session.dispose();
      sessionRef.current = null;
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  return (
    <div className="tb-editor-surface min-h-36 overflow-hidden">
      <div ref={editorRef} className="min-h-36 bg-bg-elevated" />
    </div>
  );
});
