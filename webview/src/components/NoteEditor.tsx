import { useEffect, useRef } from "react";
import { findNext, findPrevious, openSearchPanel } from "@codemirror/search";
import { createEditor } from "@/editor";
import { setExistingLinkTitlesEffect } from "@/editor/tipsboard-decorations";
import type { LinkSuggestion, NoteSummary, SaveState } from "@/types";

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
}

export function NoteEditor({
  note,
  suggestions,
  existingNormalizedTitles,
  onSave,
  onSavedPathChange,
  onSaveStateChange,
  onLinkClick,
  onContentChange,
  onImageDropError,
}: NoteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ReturnType<typeof createEditor> | null>(null);
  const noteRef = useRef(note);
  const onSaveRef = useRef(onSave);
  const onSavedPathChangeRef = useRef(onSavedPathChange);
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  const onLinkClickRef = useRef(onLinkClick);
  const onContentChangeRef = useRef(onContentChange);
  const onImageDropErrorRef = useRef(onImageDropError);
  const suggestionsRef = useRef(suggestions);
  const existingNormalizedTitlesRef = useRef(existingNormalizedTitles);

  noteRef.current = note;
  onSaveRef.current = onSave;
  onSavedPathChangeRef.current = onSavedPathChange;
  onSaveStateChangeRef.current = onSaveStateChange;
  onLinkClickRef.current = onLinkClick;
  onContentChangeRef.current = onContentChange;
  onImageDropErrorRef.current = onImageDropError;
  suggestionsRef.current = suggestions;
  existingNormalizedTitlesRef.current = existingNormalizedTitles;

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setExistingLinkTitlesEffect.of(existingNormalizedTitles),
    });
  }, [existingNormalizedTitles]);

  useEffect(() => {
    if (!editorRef.current) return;
    const initialNote = noteRef.current;
    const view = createEditor({
      doc: initialNote.body,
      parent: editorRef.current,
      getCurrentUserPageTitle: () => noteRef.current.title,
      onLinkClick: (title, type, options) => onLinkClickRef.current(title, type, options),
      getLinkSuggestions: () => suggestionsRef.current,
      existingNormalizedTitles: existingNormalizedTitlesRef.current,
      onImageDropError: (message) => onImageDropErrorRef.current?.(message),
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
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  return (
    <div className="tb-card tb-reading-panel min-h-36 overflow-hidden bg-bg-elevated ring-1 ring-white/80">
      <div ref={editorRef} className="min-h-36 bg-bg-elevated" />
    </div>
  );
}
