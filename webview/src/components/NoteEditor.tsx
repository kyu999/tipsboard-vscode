import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { findNext, findPrevious, openSearchPanel } from "@codemirror/search";
import { createEditor } from "@/editor";
import { setExistingLinkTitlesEffect } from "@/editor/tipsboard-decorations";
import type { EditorViewState } from "@/lib/editorViewState";
import type { LinkSuggestion, NoteSummary, SaveState, VaultAttachmentSummary } from "@/types";
import { DEFAULT_ATTACHMENT_MAX_BYTES } from "@/shared/attachmentConstants";

export interface NoteEditorHandle {
  scrollToLine(lineNumber: number): void;
}

interface NoteEditorProps {
  note: NoteSummary;
  suggestions: LinkSuggestion[];
  existingNormalizedTitles: string[];
  onSave: (path: string, body: string) => Promise<string>;
  onSavedPathChange: (path: string) => void;
  onSaveStateChange: (state: SaveState) => void;
  onLinkClick: (title: string, type: "internal" | "external" | "tag", options?: { openInNewTab?: boolean }) => void;
  onContentChange?: (path: string, body: string) => void;
  onImageDropError?: (message: string) => void;
  /** Merge Host-built `attachments` after Shift+drop imports into `assets/files/`. */
  onAttachmentIndexUpdated?: (attachments: VaultAttachmentSummary[]) => void;
  attachmentMaxBytes?: number;
  initialViewState?: EditorViewState | null;
  onCaptureViewState?: (path: string, state: EditorViewState) => void;
  getNoteViewScrollContainer?: () => HTMLElement | null;
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  {
    note,
    suggestions,
    existingNormalizedTitles,
    onSave,
    onSavedPathChange,
    onSaveStateChange,
    onLinkClick,
    onContentChange,
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
  const noteRef = useRef(note);
  const onSaveRef = useRef(onSave);
  const onSavedPathChangeRef = useRef(onSavedPathChange);
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  const onLinkClickRef = useRef(onLinkClick);
  const onContentChangeRef = useRef(onContentChange);
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
  onLinkClickRef.current = onLinkClick;
  onContentChangeRef.current = onContentChange;
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
    const view = createEditor({
      doc: initialNote.body,
      parent: editorRef.current,
      initialViewState: savedViewState,
      getCurrentUserPageTitle: () => noteRef.current.title,
      onLinkClick: (title, type, options) => onLinkClickRef.current(title, type, options),
      getLinkSuggestions: () => suggestionsRef.current,
      existingNormalizedTitles: existingNormalizedTitlesRef.current,
      getMaxAttachmentBytes: () => attachmentMaxBytesRef.current,
      onImageDropError: (message) => onImageDropErrorRef.current?.(message),
      onAttachmentIndexUpdated: (attachments) => onAttachmentIndexUpdatedRef.current?.(attachments),
      onContentChange: (content) => {
        onContentChangeRef.current?.(noteRef.current.path, content);
      },
      save: {
        onSave: async (content) => {
          const currentPath = noteRef.current.path;
          const nextPath = await onSaveRef.current(currentPath, content);
          if (nextPath !== currentPath) {
            noteRef.current = { ...noteRef.current, path: nextPath };
            onSavedPathChangeRef.current(nextPath);
          }
        },
        onStateChange: (state) => onSaveStateChangeRef.current(state),
      },
    });
    viewRef.current = view;
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
