import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { autocompletion } from "@codemirror/autocomplete";

import type { LinkSuggestion, VaultAttachmentSummary } from "@/types";
import { tipsboardLanguage } from "./tipsboard-language";
import { tipsboardDecorations, tipsboardTheme } from "./tipsboard-decorations";
import { tipsboardKeymap } from "./tipsboard-keymap";
import { createLinkClickHandler, type LinkClickHandler } from "./tipsboard-links";
import { createManualSavePlugin, type EditorSaveConfig } from "./tipsboard-save";
import { createLocalLinkCompletionSource } from "./tipsboard-link-completion";
import { createLocalAttachmentDropExtension } from "./tipsboard-image-drop";
import { DEFAULT_ATTACHMENT_MAX_BYTES } from "@/shared/attachmentConstants";
import { clampEditorViewState, type EditorViewState } from "@/lib/editorViewState";
import { palette } from "@/theme/palette";

const ed = palette.editor;
const accent = palette.accent;
const text = palette.text;

const notebookTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: ed.paper,
      color: text.primary,
      fontSize: "15px",
      lineHeight: "1.85",
      minHeight: "9rem",
    },
    ".cm-content": {
      caretColor: accent.link,
      padding: "var(--tb-cm-content-padding-top, 28px) 32px 24px",
      minHeight: "9rem",
    },
    ".cm-scroller": {
      backgroundColor: ed.paper,
      fontFamily:
        "Inter, ui-sans-serif, system-ui, 'Segoe UI', Helvetica Neue, Hiragino Sans, 'Noto Sans JP', sans-serif",
    },
    ".cm-line": {
      padding: "1px 0",
    },
    // Page-title spacing for line 1 only. Avoid `.cm-line:first-child` alone:
    // fenced blocks wrap inner `.cm-line`s so the opening ``` row becomes a false first-child.
    ".cm-content > .cm-line:first-child": {
      paddingBottom: "14px",
    },
    ".cm-cursor": {
      borderLeftColor: accent.link,
    },
    ".cm-activeLine": {
      backgroundColor: ed.activeLine,
    },
    ".cm-selectionBackground": {
      backgroundColor: `${ed.selection} !important`,
    },
    ".cm-matchingBracket": {
      backgroundColor: ed.accentSoft,
    },
    ".cm-nonmatchingBracket": {
      backgroundColor: "rgba(200,71,63,0.2)",
    },
    ".cm-panels.cm-panels-top": {
      backgroundColor: "transparent",
      borderBottom: "none",
      display: "flex",
      justifyContent: "flex-end",
      pointerEvents: "none",
      position: "static",
      zIndex: "20",
    },
    ".cm-panel.cm-search": {
      alignItems: "center",
      backgroundColor: ed.paper,
      border: `1px solid ${ed.border}`,
      borderRadius: "10px",
      boxShadow: `0 14px 34px rgba(${palette.shadow.ink}, 0.14)`,
      display: "inline-flex",
      flexWrap: "wrap",
      gap: "6px",
      maxWidth: "min(96vw, 34rem)",
      padding: "6px 36px 6px 8px",
      pointerEvents: "auto",
      position: "fixed",
      right: "24px",
      top: "72px",
      zIndex: "1000",
    },
    ".cm-panel.cm-search br": {
      flexBasis: "100%",
      width: 0,
      height: 0,
      margin: 0,
      padding: 0,
    },
    ".cm-panel.cm-search label": {
      alignItems: "center",
      display: "inline-flex",
      fontSize: "12px",
      gap: "4px",
      margin: 0,
      whiteSpace: "nowrap",
    },
    ".cm-panel.cm-search input[type=checkbox]": {
      accentColor: accent.link,
      height: "14px",
      width: "14px",
    },
    ".cm-panel.cm-search input[name=search], .cm-panel.cm-search input[name=replace]": {
      border: `1px solid ${ed.border}`,
      borderRadius: "7px",
      font: "inherit",
      height: "28px",
      minWidth: "220px",
      padding: "0 8px",
    },
    ".cm-panel.cm-search button": {
      backgroundColor: "transparent",
      border: `1px solid ${ed.border}`,
      borderRadius: "7px",
      color: text.primary,
      cursor: "pointer",
      font: "inherit",
      height: "28px",
      padding: "0 8px",
    },
    ".cm-panel.cm-search button:hover": {
      backgroundColor: ed.hover,
    },
    ".cm-panel.cm-search button[name=close]": {
      border: "none",
      color: text.muted,
      fontSize: "18px",
      height: "28px",
      position: "absolute",
      right: "6px",
      top: "6px",
      width: "28px",
    },
  },
  { dark: false },
);

export interface EditorConfig {
  doc: string;
  parent: HTMLElement;
  currentUserPageTitle?: string | null;
  getCurrentUserPageTitle?: () => string | null | undefined;
  onLinkClick: LinkClickHandler;
  save?: EditorSaveConfig;
  getLinkSuggestions: () => LinkSuggestion[];
  existingNormalizedTitles?: Iterable<string>;
  onImageDropError?: (message: string) => void;
  /** VS Code `tipsboard-vscode.maxAttachmentBytes`; used before RPC and for error copy. */
  getMaxAttachmentBytes?: () => number;
  /** After Shift+drop file import, merge refreshed `VaultSnapshot.attachments` from Host. */
  onAttachmentIndexUpdated?: (attachments: VaultAttachmentSummary[]) => void;
  onContentChange?: (content: string) => void;
  initialViewState?: EditorViewState;
  extensions?: Extension[];
}

export function createEditor(config: EditorConfig): EditorView {
  const extensions: Extension[] = [
    history(),
    drawSelection(),
    highlightActiveLine(),
    autocompletion({
      override: [createLocalLinkCompletionSource(config.getLinkSuggestions)],
      icons: false,
    }),
    search({
      top: true,
      scrollToMatch: (range) => EditorView.scrollIntoView(range, { y: "center" }),
    }),
    highlightSelectionMatches(),
    keymap.of([
      ...tipsboardKeymap({
        getCurrentUserPageTitle:
          config.getCurrentUserPageTitle ??
          (() => config.currentUserPageTitle),
      }),
      ...searchKeymap,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    tipsboardLanguage,
    bracketMatching(),
    tipsboardDecorations(config.existingNormalizedTitles),
    tipsboardTheme,
    notebookTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        config.onContentChange?.(update.state.doc.toString());
      }
    }),
    createLinkClickHandler(config.onLinkClick),
    ...(config.save
      ? createManualSavePlugin({
          ...config.save,
          initialContent: config.doc,
        })
      : []),
    createLocalAttachmentDropExtension({
      getMaxAttachmentBytes: () => config.getMaxAttachmentBytes?.() ?? DEFAULT_ATTACHMENT_MAX_BYTES,
      onError: config.onImageDropError,
      onAttachmentIndexUpdated: config.onAttachmentIndexUpdated,
    }),
    EditorView.lineWrapping,
    ...(config.extensions ?? []),
  ];

  const doc = config.doc;
  const initialViewState = config.initialViewState
    ? clampEditorViewState(config.initialViewState, doc.length)
    : undefined;

  const state = EditorState.create({
    doc,
    selection: initialViewState
      ? EditorSelection.single(initialViewState.head, initialViewState.anchor)
      : undefined,
    extensions,
  });

  const view = new EditorView({
    state,
    parent: config.parent,
  });

  if (initialViewState) {
    const scrollTop = initialViewState.scrollTop;
    requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = scrollTop;
    });
  }

  return view;
}
