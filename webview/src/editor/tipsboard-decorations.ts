import {
  BlockWrapper,
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from "@codemirror/view";
import {
  EditorState,
  Range,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import katex from "katex";
import { bareHttpUrlInTextRe, trimAutolinkUrl } from "@/domain/autolink";
import { parseIconSyntax } from "@/domain/links/iconSyntax";
import { isRenderableCardImageSrc } from "@/domain/preview/firstCardImage";
import { normalizeTitle } from "@/domain/title/title";
import { getCaretLineNumbers } from "./tipsboard-caret-line";
import {
  collectCustomSyntaxSkipRanges,
  intersectsRanges,
  rangeFullyContainedInAny,
  type TextRange,
} from "./tipsboard-markdown-ranges";
import {
  findMarkdownTables,
  type MarkdownTableAlignment,
  type MarkdownTableBlock,
} from "./tipsboard-tables";
import { findMermaidBlocks, type MermaidBlock } from "./tipsboard-mermaid";
import { findRenderableMathSpans } from "./tipsboard-katex-math";
import i18n from "@/shared/i18n/config";
import { openImageLightbox } from "@/shared/utils/imageLightbox";
import { ensureVaultImageUrl } from "@/vscode-bridge-client";
import { palette } from "@/theme/palette";

const pe = palette.editor;
const pa = palette.accent;
const pt = palette.text;

function attachEmbeddedImageLightbox(img: HTMLImageElement): void {
  const label = i18n.t("editor.clickToEnlargeImage");
  img.classList.add("cursor-pointer");
  img.title = label;
  img.setAttribute("role", "button");
  img.setAttribute("aria-label", label);
  img.addEventListener("click", (event) => {
    event.stopPropagation();
    openImageLightbox(img.currentSrc || img.src, img.alt);
  });
}

class BulletWidget extends WidgetType {
  constructor(private level: number) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-tipsboard-bullet-marker";
    const bullets = ["\u2022", "\u25E6", "\u25AA", "\u25B8"];
    span.textContent = bullets[Math.min(this.level, bullets.length - 1)]!;
    return span;
  }

  eq(other: BulletWidget): boolean {
    return this.level === other.level;
  }
}

class DividerWidget extends WidgetType {
  constructor(private from: number) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-tipsboard-divider";
    wrapper.dataset.tipsboardDividerFrom = String(this.from);

    const before = document.createElement("span");
    before.className = "cm-tipsboard-divider-line";
    const after = document.createElement("span");
    after.className = "cm-tipsboard-divider-line";

    wrapper.append(before, after);
    return wrapper;
  }

  eq(other: DividerWidget): boolean {
    return this.from === other.from;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class MarkdownImageWidget extends WidgetType {
  constructor(
    private src: string,
    private alt: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-image-widget";

    const img = document.createElement("img");
    let placeholderShown = false;
    const showPlaceholder = () => {
      if (placeholderShown) return;
      placeholderShown = true;
      img.style.display = "none";
      const placeholder = document.createElement("span");
      placeholder.className = "text-accent-error text-xs";
      placeholder.textContent = this.alt || this.src;
      wrapper.appendChild(placeholder);
    };
    if (this.src.startsWith("assets/images/")) {
      const resolved = resolveMarkdownImageSrc(this.src);
      if (resolved) img.src = resolved;
      void ensureVaultImageUrl(this.src).then((url) => {
        if (url) {
          img.src = url;
        } else {
          showPlaceholder();
        }
      });
    } else {
      img.src = this.src;
    }
    img.alt = this.alt;
    img.className = "inline-block max-w-full max-h-64 rounded my-1";
    img.loading = "lazy";
    img.onerror = showPlaceholder;
    attachEmbeddedImageLightbox(img);
    wrapper.appendChild(img);

    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }

  eq(other: MarkdownImageWidget): boolean {
    return this.src === other.src && this.alt === other.alt;
  }
}

class TableWidget extends WidgetType {
  constructor(
    private table: MarkdownTableBlock,
    private existingLinkTitles: ReadonlySet<string>,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-tipsboard-table-wrapper";
    wrapper.dataset.tipsboardTableFrom = String(this.table.from);

    const table = document.createElement("table");
    table.className = "cm-tipsboard-table";

    const thead = document.createElement("thead");
    thead.appendChild(createTableRow(this.table.header, "th", this.table.alignments, this.existingLinkTitles));
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const row of this.table.rows) {
      tbody.appendChild(createTableRow(row, "td", this.table.alignments, this.existingLinkTitles));
    }
    table.appendChild(tbody);

    wrapper.appendChild(table);
    return wrapper;
  }

  eq(other: TableWidget): boolean {
    return (
      JSON.stringify(this.table) === JSON.stringify(other.table) &&
      this.existingLinkTitles === other.existingLinkTitles
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

type MermaidInstance = typeof import("mermaid").default;

let mermaidReady: Promise<MermaidInstance> | null = null;
let mermaidRenderSequence = 0;

function getMermaid(): Promise<MermaidInstance> {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
      });
      return mermaid;
    });
  }
  return mermaidReady;
}

let mermaidWrapperGenCounter = 0;

async function waitAnimationFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

function assignMermaidWrapperGeneration(wrapper: HTMLElement): number {
  mermaidWrapperGenCounter += 1;
  const gen = mermaidWrapperGenCounter;
  wrapper.dataset.tipsboardMermaidGen = String(gen);
  return gen;
}

function isActiveMermaidGeneration(wrapper: HTMLElement, gen: number): boolean {
  return wrapper.dataset.tipsboardMermaidGen === String(gen);
}

class MermaidWidget extends WidgetType {
  constructor(private block: MermaidBlock) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-tipsboard-mermaid-wrapper";
    wrapper.dataset.tipsboardMermaidFrom = String(this.block.from);

    const placeholder = document.createElement("div");
    placeholder.className = "cm-tipsboard-mermaid-loading";
    placeholder.textContent = "Rendering Mermaid diagram...";
    wrapper.appendChild(placeholder);

    void renderMermaidBlock(this.block.code, wrapper, view);

    return wrapper;
  }

  eq(other: MermaidWidget): boolean {
    return this.block.from === other.block.from && this.block.code === other.block.code;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class KaTeXWidget extends WidgetType {
  constructor(
    private anchorFrom: number,
    private tex: string,
    private displayMode: boolean,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.dataset.tipsboardMathFrom = String(this.anchorFrom);
    wrapper.className = this.displayMode ? "cm-tipsboard-katex-display" : "cm-tipsboard-katex-inline";

    try {
      wrapper.innerHTML = katex.renderToString(this.tex, {
        displayMode: this.displayMode,
        throwOnError: false,
        strict: "ignore",
        trust: false,
      });
    } catch {
      wrapper.classList.add("cm-tipsboard-katex-error");
      wrapper.textContent = this.tex;
    }

    return wrapper;
  }

  eq(other: KaTeXWidget): boolean {
    return (
      other instanceof KaTeXWidget &&
      other.anchorFrom === this.anchorFrom &&
      other.tex === this.tex &&
      other.displayMode === this.displayMode
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

async function paintMermaidIntoWrapper(
  code: string,
  wrapper: HTMLElement,
  view: EditorView,
  gen: number,
): Promise<boolean> {
  const mermaid = await getMermaid();
  const renderId = `tipsboard-mermaid-${Date.now()}-${mermaidRenderSequence}`;
  mermaidRenderSequence += 1;
  const { svg } = await mermaid.render(renderId, code);
  if (!wrapper.isConnected || !isActiveMermaidGeneration(wrapper, gen)) {
    return false;
  }

  wrapper.innerHTML = svg;
  void wrapper.offsetWidth;
  view.requestMeasure();
  return true;
}

async function renderMermaidBlock(code: string, wrapper: HTMLElement, view: EditorView) {
  const gen = assignMermaidWrapperGeneration(wrapper);

  await waitAnimationFrames(1);
  if (!wrapper.isConnected || !isActiveMermaidGeneration(wrapper, gen)) {
    return;
  }

  try {
    const ok = await paintMermaidIntoWrapper(code, wrapper, view, gen);
    if (!ok) {
      return;
    }

    queueMicrotask(() => {
      if (wrapper.isConnected && isActiveMermaidGeneration(wrapper, gen)) {
        view.requestMeasure();
      }
    });
  } catch (error) {
    if (!wrapper.isConnected || !isActiveMermaidGeneration(wrapper, gen)) {
      return;
    }
    wrapper.replaceChildren(createMermaidErrorElement(error));
    view.requestMeasure();
  }
}

function createMermaidErrorElement(error: unknown): HTMLElement {
  const element = document.createElement("div");
  element.className = "cm-tipsboard-mermaid-error";
  element.textContent =
    error instanceof Error
      ? `Mermaid diagram could not be rendered: ${error.message}`
      : "Mermaid diagram could not be rendered.";
  return element;
}

function createTableRow(
  cells: readonly string[],
  cellTag: "td" | "th",
  alignments: readonly MarkdownTableAlignment[],
  existingLinkTitles: ReadonlySet<string>,
): HTMLTableRowElement {
  const row = document.createElement("tr");
  cells.forEach((cell, index) => {
    const element = document.createElement(cellTag);
    element.className = "cm-tipsboard-table-cell";
    const alignment = alignments[index];
    if (alignment) {
      element.style.textAlign = alignment;
    }
    element.appendChild(renderTableCellContent(cell, existingLinkTitles));
    row.appendChild(element);
  });
  return row;
}

const tableInlineRe =
  /`([^`\n]+?)`|\*\*(.+?)\*\*|\*(?!\*)([^*\n]+?)\*(?!\*)|_([^_\n]+?)_|~~(.+?)~~|\[([^\[\]\n]+?)\]\((assets\/files\/[^)\s]+)\)|\[([^\[\]\n]+?)\]\((https?:\/\/[^)\s]+)\)|\[([^\[\]\n]+?)\s+(https?:\/\/\S+)\]|\[(https?:\/\/\S+)\]|\[([^\[\]\n]+?)\](?!\()|(?<!\[)(?<![\w/])(https?:\/\/\S+)|(?<!\S)(#[^\s#]+)/g;

function renderTableCellContent(
  text: string,
  existingLinkTitles: ReadonlySet<string>,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let pos = 0;
  tableInlineRe.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = tableInlineRe.exec(text)) !== null) {
    if (match.index > pos) {
      fragment.append(document.createTextNode(text.slice(pos, match.index)));
    }
    fragment.appendChild(createTableInlineElement(match, existingLinkTitles));
    pos = match.index + match[0].length;
  }

  if (pos < text.length) {
    fragment.append(document.createTextNode(text.slice(pos)));
  }

  return fragment;
}

function createTableInlineElement(
  match: RegExpExecArray,
  existingLinkTitles: ReadonlySet<string>,
): Node {
  if (match[1] != null) {
    return createInlineSpan("cm-tipsboard-inline-code", match[1]);
  }
  if (match[2] != null) {
    return createInlineSpan("cm-tipsboard-bold", match[2]);
  }
  if (match[3] != null || match[4] != null) {
    return createInlineSpan("cm-tipsboard-italic", match[3] ?? match[4] ?? "");
  }
  if (match[5] != null) {
    return createInlineSpan("cm-tipsboard-strike", match[5]);
  }
  if (match[6] != null && match[7] != null) {
    return createTableLink("vaultAttachment", match[6], match[7], existingLinkTitles);
  }
  if (match[8] != null && match[9] != null) {
    return createTableLink("external", match[8], match[9], existingLinkTitles);
  }
  if (match[10] != null && match[11] != null) {
    return createTableLink("external", match[10], match[11], existingLinkTitles);
  }
  if (match[12] != null) {
    return createTableLink("external", match[12], match[12], existingLinkTitles);
  }
  if (match[13] != null) {
    return createTableLink("internal", match[13], match[13], existingLinkTitles);
  }
  if (match[14] != null) {
    const href = trimAutolinkUrl(match[14]);
    return createTableLink("external", href, href, existingLinkTitles);
  }
  if (match[15] != null) {
    const tag = match[15].slice(1);
    return createTableLink("tag", match[15], tag, existingLinkTitles);
  }

  return document.createTextNode(match[0]);
}

function createInlineSpan(className: string, text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

/** Vault attachment `[label](assets/files/...)`. Icon via CSS `::before`, not FA classes on label text. */
const VAULT_ATTACHMENT_LINK_CLASS = "cm-tipsboard-vault-attachment-link" as const;

function createVaultAttachmentTableLink(label: string, target: string): HTMLElement {
  const span = document.createElement("span");
  span.className = `${VAULT_ATTACHMENT_LINK_CLASS} cm-tipsboard-vault-attachment-link--dom-icon`;
  span.dataset.tipsboardTableLinkType = "vaultAttachment";
  span.dataset.tipsboardTableLinkTarget = target;
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-paperclip fa-xs";
  icon.setAttribute("aria-hidden", "true");
  span.append(icon, document.createTextNode(` ${label}`));
  return span;
}

function createTableLink(
  type: "external" | "internal" | "tag" | "vaultAttachment",
  label: string,
  target: string,
  existingLinkTitles: ReadonlySet<string>,
): HTMLElement {
  if (type === "vaultAttachment") {
    return createVaultAttachmentTableLink(label, target);
  }
  const span = createInlineSpan(
    type === "external"
      ? "cm-tipsboard-external-link"
      : type === "tag"
        ? "cm-tipsboard-tag"
        : linkClassForTitle(target, existingLinkTitles),
    label,
  );
  span.dataset.tipsboardTableLinkType = type;
  span.dataset.tipsboardTableLinkTarget = target;
  return span;
}

const boldMark = Decoration.mark({ class: "cm-tipsboard-bold" });
const italicMark = Decoration.mark({ class: "cm-tipsboard-italic" });
const strikeMark = Decoration.mark({ class: "cm-tipsboard-strike" });
const indentMark = Decoration.mark({ class: "cm-tipsboard-indent" });
const inlineCodeMark = Decoration.mark({ class: "cm-tipsboard-inline-code" });
const linkMark = Decoration.mark({ class: "cm-tipsboard-link" });
const missingLinkMark = Decoration.mark({ class: "cm-tipsboard-missing-link" });
const externalLinkMark = Decoration.mark({ class: "cm-tipsboard-external-link" });
const vaultAttachmentLinkMark = Decoration.mark({ class: VAULT_ATTACHMENT_LINK_CLASS });
const tagMark = Decoration.mark({ class: "cm-tipsboard-tag" });
const quoteMark = Decoration.mark({ class: "cm-tipsboard-quote" });
const codeMark = Decoration.mark({ class: "cm-tipsboard-code" });

const codeBlockShellWrapper = BlockWrapper.create({
  tagName: "div",
  attributes: { class: "cm-tipsboard-code-shell" },
  rank: 52,
});
const pageTitleLineMark = Decoration.mark({ class: "cm-page-title-line" });
const orderedMarkerMark = Decoration.mark({ class: "cm-tipsboard-ordered-marker" });

export const setExistingLinkTitlesEffect = StateEffect.define<readonly string[]>();

const existingLinkTitlesField = StateField.define<ReadonlySet<string>>({
  create() {
    return new Set();
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setExistingLinkTitlesEffect)) {
        return new Set(effect.value);
      }
    }
    return value;
  },
});

function hasExistingLinkTitlesEffect(update: ViewUpdate): boolean {
  return update.transactions.some((transaction) =>
    transaction.effects.some((effect) => effect.is(setExistingLinkTitlesEffect)),
  );
}

function linkClassForTitle(
  rawTitle: string,
  existingLinkTitles: ReadonlySet<string>,
): string {
  return existingLinkTitles.has(normalizeTitle(linkTitleFromRaw(rawTitle)))
    ? "cm-tipsboard-link"
    : "cm-tipsboard-missing-link";
}

function linkMarkForTitle(
  rawTitle: string,
  existingLinkTitles: ReadonlySet<string>,
): Decoration {
  return existingLinkTitles.has(normalizeTitle(linkTitleFromRaw(rawTitle)))
    ? linkMark
    : missingLinkMark;
}

function linkTitleFromRaw(rawTitle: string): string {
  return parseIconSyntax(rawTitle.trim())?.title ?? rawTitle.trim();
}

const headingMarks = [
  Decoration.mark({ class: "cm-tipsboard-h1" }),
  Decoration.mark({ class: "cm-tipsboard-h2" }),
  Decoration.mark({ class: "cm-tipsboard-h3" }),
  Decoration.mark({ class: "cm-tipsboard-h4" }),
  Decoration.mark({ class: "cm-tipsboard-h5" }),
  Decoration.mark({ class: "cm-tipsboard-h6" }),
];

const hideSyntax = Decoration.replace({
  widget: new (class extends WidgetType {
    toDOM(): HTMLElement {
      return document.createElement("span");
    }
  })(),
});

type PendingDecoration = { from: number; to: number; deco: Decoration };

const vaultAttachmentMdRe = /(?<!\\)(?<!\!)\[([^\]\n]*)\]\((assets\/files\/[^)\s]+)\)/g;
const externalWithLabelRe = /(?<!\\)\[([^\[\]\n]+?)\s+(https?:\/\/\S+)\](?!\()/g;
const externalRe = /(?<!\\)\[(https?:\/\/\S+)\](?!\()/g;
const bareHttpUrlRe = bareHttpUrlInTextRe;
const internalLinkRe = /(?<!\\)\[([^\[\]\n]+?)\](?!\()/g;
const markdownImageRe = /!\[([^\]\n]*)\]\(([^)\s]+)\)/g;
const tagRe = /(?:^|\s)(#[^\s#]+)/g;

function resolveMarkdownImageSrc(src: string): string {
  if (src.startsWith("assets/images/")) {
    return window.tipsboardDesktop.resolveAssetUrl(src);
  }
  return src;
}

function isSyntaxActive(view: EditorView, from: number, to: number): boolean {
  for (const range of view.state.selection.ranges) {
    if (range.empty) {
      if (range.from >= from && range.from <= to) {
        return true;
      }
      continue;
    }

    if (range.from <= to && range.to >= from) {
      return true;
    }
  }

  return false;
}

function isRangeActive(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.empty) {
      if (range.from >= from && range.from <= to) {
        return true;
      }
      continue;
    }

    if (range.from <= to && range.to >= from) {
      return true;
    }
  }

  return false;
}

function addDecoration(
  decorations: PendingDecoration[],
  from: number,
  to: number,
  deco: Decoration,
) {
  if (to > from) {
    decorations.push({ from, to, deco });
  }
}

function intersectsRangesExceptExactSelf(
  from: number,
  to: number,
  ranges: readonly TextRange[],
): boolean {
  for (const range of ranges) {
    if (range.from === from && range.to === to) continue;
    if (from < range.to && to > range.from) return true;
  }
  return false;
}

function hideDecorations(
  decorations: PendingDecoration[],
  ranges: Array<{ from: number; to: number }>,
) {
  for (const range of ranges) {
    if (range.to > range.from) {
      decorations.push({ from: range.from, to: range.to, deco: hideSyntax });
    }
  }
}

function rangeTouchesCaretLine(
  view: EditorView,
  caretLines: Set<number>,
  from: number,
  to: number,
): boolean {
  if (to <= from) return false;

  let line = view.state.doc.lineAt(from);
  while (true) {
    if (caretLines.has(line.number)) {
      return true;
    }
    if (line.to >= to || line.number >= view.state.doc.lines) {
      break;
    }
    line = view.state.doc.line(line.number + 1);
  }

  return false;
}

/**
 * Fence ``` / lang delimiters inside a single FencedCode node.
 */
function hideFencedDelimiterSyntax(
  state: EditorState,
  fenceFrom: number,
  fenceTo: number,
  decorations: PendingDecoration[],
) {
  syntaxTree(state).iterate({
    from: fenceFrom,
    to: fenceTo,
    enter(inner) {
      if (inner.from < fenceFrom || inner.to > fenceTo) return;
      if (inner.name === "CodeText" || inner.name === "InlineCode") return false;
      if (inner.name === "CodeMark" || inner.name === "CodeInfo") {
        hideDecorations(decorations, [{ from: inner.from, to: inner.to }]);
      }
    },
  });
}

/** Host layout may not exist yet (e.g. jsdom): empty viewport would skip decorations for most of the doc. */
function effectiveDecorationViewport(view: EditorView): TextRange[] {
  const docLen = view.state.doc.length;
  const usable = view.visibleRanges.filter((r) => r.to > r.from);
  if (usable.length === 0) {
    return [{ from: 0, to: docLen }];
  }
  return usable.map(({ from, to }) => ({ from, to }));
}

/** One continuous box around ``` / indented code blocks (Mermaid uses a replace widget, so no shell). */
function buildCodeBlockShellWrappers(view: EditorView): RangeSet<BlockWrapper> {
  const state = view.state;
  const mermaidFenceStarts = new Set(findMermaidBlocks(state.doc.toString()).map((b) => b.from));
  const ranges: Range<BlockWrapper>[] = [];
  const viewport = effectiveDecorationViewport(view);

  for (const { from: vrFrom, to: vrTo } of viewport) {
    syntaxTree(state).iterate({
      from: vrFrom,
      to: vrTo,
      enter(node) {
        if (node.name === "IndentedCode") {
          ranges.push(codeBlockShellWrapper.range(node.from, node.to));
          return;
        }
        if (node.name !== "FencedCode") return;
        if (mermaidFenceStarts.has(node.from)) return;
        ranges.push(codeBlockShellWrapper.range(node.from, node.to));
      },
    });
  }

  return BlockWrapper.set(ranges, true);
}

const codeBlockShellWrappers = EditorView.blockWrappers.of(buildCodeBlockShellWrappers);

/**
 * Fenced blocks must stay styled even when blockRanges (KaTeX/Mermaid/table widgets)
 * overlap inner ranges — addMarkdownDecorations skips entire FencedCode without descending.
 */
function addFencedCodeDecorations(
  view: EditorView,
  caretLines: Set<number>,
  decorations: PendingDecoration[],
  viewport: readonly TextRange[],
) {
  for (const { from, to } of viewport) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== "FencedCode") return;
        if (!rangeTouchesCaretLine(view, caretLines, node.from, node.to)) {
          hideFencedDelimiterSyntax(view.state, node.from, node.to, decorations);
        }
        addLineDecorations(view, caretLines, decorations, node.from, node.to, codeMark);
      },
    });
  }
}

function addLineDecorations(
  view: EditorView,
  caretLines: Set<number>,
  decorations: PendingDecoration[],
  from: number,
  to: number,
  deco: Decoration,
) {
  if (to <= from) return;

  let pos = from;
  while (pos < to) {
    const line = view.state.doc.lineAt(pos);
    const lineFrom = Math.max(from, line.from);
    const lineTo = Math.min(to, line.to);
    if (!caretLines.has(line.number)) {
      addDecoration(decorations, lineFrom, lineTo, deco);
    }
    if (line.to >= to || line.number >= view.state.doc.lines) {
      break;
    }
    pos = line.to + 1;
  }
}

function addSyntaxHideDecoration(
  view: EditorView,
  caretLines: Set<number>,
  decorations: PendingDecoration[],
  nodeName: string,
  from: number,
  to: number,
): boolean {
  const line = view.state.doc.lineAt(from);
  if (caretLines.has(line.number)) {
    return true;
  }

  if (nodeName === "HeaderMark") {
    const lineText = view.state.doc.sliceString(line.from, line.to);
    const markerEnd = to - line.from;
    const whitespace = lineText.slice(markerEnd).match(/^\s*/)?.[0] ?? "";
    hideDecorations(decorations, [{ from, to: Math.min(line.to, to + whitespace.length) }]);
    return true;
  }

  if (nodeName === "QuoteMark") {
    const nextChar = view.state.doc.sliceString(to, Math.min(line.to, to + 1));
    hideDecorations(decorations, [{ from, to: nextChar === " " ? to + 1 : to }]);
    return true;
  }

  if (nodeName === "EmphasisMark" || nodeName === "CodeMark" || nodeName === "CodeInfo") {
    hideDecorations(decorations, [{ from, to }]);
    return true;
  }

  return false;
}

function headingLevel(nodeName: string): number | null {
  const match = nodeName.match(/^(?:ATXHeading|SetextHeading)([1-6])$/);
  if (!match) return null;
  return Number(match[1]);
}

function addMarkdownDecoration(
  view: EditorView,
  caretLines: Set<number>,
  decorations: PendingDecoration[],
  nodeName: string,
  from: number,
  to: number,
) {
  if (addSyntaxHideDecoration(view, caretLines, decorations, nodeName, from, to)) {
    return;
  }

  const level = headingLevel(nodeName);
  if (level !== null) {
    addLineDecorations(view, caretLines, decorations, from, to, headingMarks[level - 1]!);
    return;
  }

  if (nodeName === "FencedCode") {
    return;
  }

  if (nodeName === "IndentedCode") {
    addLineDecorations(view, caretLines, decorations, from, to, codeMark);
    return;
  }

  if (nodeName === "Blockquote") {
    addLineDecorations(view, caretLines, decorations, from, to, quoteMark);
    return;
  }

  if (rangeTouchesCaretLine(view, caretLines, from, to)) {
    return;
  }

  if (nodeName === "StrongEmphasis") {
    addDecoration(decorations, from, to, boldMark);
    return;
  }

  if (nodeName === "Emphasis") {
    addDecoration(decorations, from, to, italicMark);
    return;
  }

  if (nodeName === "Strikethrough") {
    addDecoration(decorations, from, to, strikeMark);
    return;
  }

  if (nodeName === "InlineCode") {
    addDecoration(decorations, from, to, inlineCodeMark);
    return;
  }

  if (nodeName === "ListMark") {
    const markerText = view.state.doc.sliceString(from, to);
    const line = view.state.doc.lineAt(from);
    if (/^[-+*]/.test(markerText)) {
      const indentLevel = Math.floor((from - line.from) / 2);
      addDecoration(
        decorations,
        from,
        to,
        Decoration.replace({ widget: new BulletWidget(indentLevel) }),
      );
      return;
    }
    if (/^\d+\./.test(markerText)) {
      addDecoration(decorations, from, to, orderedMarkerMark);
    }
  }
}

function addIndentDecorations(
  view: EditorView,
  caretLines: Set<number>,
  decorations: PendingDecoration[],
  skipRanges: readonly TextRange[],
  viewport: readonly TextRange[],
) {
  for (const { from, to } of viewport) {
    for (let pos = from; pos < to; ) {
      const line = view.state.doc.lineAt(pos);
      if (
        !caretLines.has(line.number) &&
        !rangeFullyContainedInAny({ from: line.from, to: line.to }, skipRanges) &&
        /^[ \t]+/.test(line.text)
      ) {
        addDecoration(decorations, line.from, line.to, indentMark);
      }
      if (line.to >= to || line.number >= view.state.doc.lines) {
        break;
      }
      pos = line.to + 1;
    }
  }
}

function addMarkdownDecorations(
  view: EditorView,
  caretLines: Set<number>,
  decorations: PendingDecoration[],
  skipRanges: readonly TextRange[],
  viewport: readonly TextRange[],
) {
  for (const { from, to } of viewport) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === "FencedCode") {
          addMarkdownDecoration(view, caretLines, decorations, node.name, node.from, node.to);
          return false;
        }
        const blockedByWidget = rangeFullyContainedInAny(
          { from: node.from, to: node.to },
          skipRanges,
        );
        if (blockedByWidget) {
          return false;
        }
        addMarkdownDecoration(view, caretLines, decorations, node.name, node.from, node.to);
      },
    });
  }
}

function collectInactiveMermaidBlockRanges(
  view: EditorView,
  viewport: readonly TextRange[],
): TextRange[] {
  return findMermaidBlocks(view.state.doc.toString())
    .filter((block) => {
      if (isSyntaxActive(view, block.from, block.to)) {
        return false;
      }
      return intersectsRanges(block.from, block.to, viewport);
    })
    .map(({ from, to }) => ({ from, to }));
}

function collectInactiveMathBlockRanges(view: EditorView, viewport: readonly TextRange[]): TextRange[] {
  const state = view.state;
  const doc = state.doc.toString();
  const mermaids = findMermaidBlocks(doc);
  const tables = findMarkdownTables(doc);
  const spans = findRenderableMathSpans(doc, state).filter((span) => {
    if (isSyntaxActive(view, span.from, span.to)) return false;
    for (const mb of mermaids) {
      if (span.from >= mb.from && span.to <= mb.to) return false;
    }
    for (const t of tables) {
      if (span.from >= t.from && span.to <= t.to) return false;
    }
    return intersectsRanges(span.from, span.to, viewport);
  });
  return spans.map(({ from, to }) => ({ from, to }));
}

function collectInactiveMarkdownTableRanges(view: EditorView, viewport: readonly TextRange[]): TextRange[] {
  return findMarkdownTables(view.state.doc.toString())
    .filter((table) => {
      if (isSyntaxActive(view, table.from, table.to)) {
        return false;
      }
      return intersectsRanges(table.from, table.to, viewport);
    })
    .map(({ from, to }) => ({ from, to }));
}

function buildTableDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const blockDecorations: PendingDecoration[] = [];
  const existingLinkTitles = state.field(existingLinkTitlesField);
  const mermaidFenceBlocks = findMermaidBlocks(state.doc.toString());
  const tables = findMarkdownTables(state.doc.toString()).filter((table) => {
    if (isRangeActive(state, table.from, table.to)) {
      return false;
    }
    for (const mb of mermaidFenceBlocks) {
      if (table.from >= mb.from && table.to <= mb.to) {
        return false;
      }
    }
    return true;
  });

  for (const table of tables) {
    blockDecorations.push({
      from: table.from,
      to: table.to,
      deco: Decoration.replace({
        widget: new TableWidget(table, existingLinkTitles),
        block: true,
      }),
    });
  }

  const mermaidBlocks = mermaidFenceBlocks.filter((block) => {
    if (isRangeActive(state, block.from, block.to)) {
      return false;
    }
    return true;
  });
  for (const block of mermaidBlocks) {
    blockDecorations.push({
      from: block.from,
      to: block.to,
      deco: Decoration.replace({
        widget: new MermaidWidget(block),
        block: true,
      }),
    });
  }

  const mathBlocks = findRenderableMathSpans(state.doc.toString(), state).filter((span) => {
    if (isRangeActive(state, span.from, span.to)) return false;
    for (const mb of mermaidFenceBlocks) {
      if (span.from >= mb.from && span.to <= mb.to) return false;
    }
    for (const t of tables) {
      if (span.from >= t.from && span.to <= t.to) return false;
    }
    return true;
  });
  for (const span of mathBlocks) {
    blockDecorations.push({
      from: span.from,
      to: span.to,
      deco: Decoration.replace({
        widget: new KaTeXWidget(span.from, span.tex, span.displayMode),
        block: span.displayMode,
      }),
    });
  }

  const blockRanges = [
    ...tables.map(({ from, to }) => ({ from, to })),
    ...mermaidBlocks.map(({ from, to }) => ({ from, to })),
    ...mathBlocks.map(({ from, to }) => ({ from, to })),
  ];
  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.name !== "HorizontalRule" ||
        isRangeActive(state, node.from, node.to) ||
        intersectsRanges(node.from, node.to, blockRanges)
      ) {
        return;
      }
      blockDecorations.push({
        from: node.from,
        to: node.to,
        deco: Decoration.replace({
          widget: new DividerWidget(node.from),
        }),
      });
    },
  });

  blockDecorations.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const d of blockDecorations) {
    builder.add(d.from, d.to, d.deco);
  }

  return builder.finish();
}

function addTipsboardLinkDecorations(
  view: EditorView,
  caretLines: Set<number>,
  decorations: PendingDecoration[],
  skipRanges: readonly TextRange[],
  existingLinkTitles: ReadonlySet<string>,
  viewport: readonly TextRange[],
) {
  for (const { from, to } of viewport) {
    for (let pos = from; pos < to; ) {
      const line = view.state.doc.lineAt(pos);
      const lineText = view.state.doc.sliceString(line.from, line.to);

      if (!caretLines.has(line.number)) {
        markdownImageRe.lastIndex = 0;
        let markdownImageMatch: RegExpExecArray | null;
        while ((markdownImageMatch = markdownImageRe.exec(lineText)) !== null) {
          const alt = markdownImageMatch[1] ?? "";
          const src = markdownImageMatch[2] ?? "";
          if (!isRenderableCardImageSrc(src)) continue;
          const matchFrom = line.from + markdownImageMatch.index;
          const matchTo = matchFrom + markdownImageMatch[0].length;
          decorations.push({
            from: matchFrom,
            to: matchTo,
            deco: Decoration.replace({
              widget: new MarkdownImageWidget(src, alt),
            }),
          });
        }

        vaultAttachmentMdRe.lastIndex = 0;
        let vaultMdMatch: RegExpExecArray | null;
        while ((vaultMdMatch = vaultAttachmentMdRe.exec(lineText)) !== null) {
          const labelText = vaultMdMatch[1] ?? "";
          const matchFrom = line.from + vaultMdMatch.index;
          const matchTo = matchFrom + vaultMdMatch[0].length;
          if (intersectsRangesExceptExactSelf(matchFrom, matchTo, skipRanges)) continue;
          const labelFrom = matchFrom + 1;
          const labelTo = labelFrom + labelText.length;
          if (labelTo <= labelFrom) continue;
          const isActive = isSyntaxActive(view, matchFrom, matchTo);
          addDecoration(decorations, labelFrom, labelTo, vaultAttachmentLinkMark);
          if (!isActive) {
            hideDecorations(decorations, [
              { from: matchFrom, to: matchFrom + 1 },
              { from: labelTo, to: matchTo },
            ]);
          }
        }

        externalWithLabelRe.lastIndex = 0;
        let externalWithLabelMatch: RegExpExecArray | null;
        while ((externalWithLabelMatch = externalWithLabelRe.exec(lineText)) !== null) {
          const matchFrom = line.from + externalWithLabelMatch.index;
          const matchTo = matchFrom + externalWithLabelMatch[0].length;
          if (intersectsRanges(matchFrom, matchTo, skipRanges)) continue;
          const labelStart = matchFrom + 1;
          const label = externalWithLabelMatch[1] ?? "";
          const labelEnd = labelStart + label.length;
          const urlStart = labelEnd + 1;
          const isActive = isSyntaxActive(view, matchFrom, matchTo);

          addDecoration(decorations, labelStart, labelEnd, externalLinkMark);
          if (!isActive) {
            hideDecorations(decorations, [
              { from: matchFrom, to: matchFrom + 1 },
              { from: urlStart, to: matchTo - 1 },
              { from: matchTo - 1, to: matchTo },
            ]);
          }
        }

        externalRe.lastIndex = 0;
        let externalMatch: RegExpExecArray | null;
        while ((externalMatch = externalRe.exec(lineText)) !== null) {
          const matchFrom = line.from + externalMatch.index;
          const matchTo = matchFrom + externalMatch[0].length;
          if (intersectsRanges(matchFrom, matchTo, skipRanges)) continue;
          const isActive = isSyntaxActive(view, matchFrom, matchTo);

          addDecoration(decorations, matchFrom + 1, matchTo - 1, externalLinkMark);
          if (!isActive) {
            hideDecorations(decorations, [
              { from: matchFrom, to: matchFrom + 1 },
              { from: matchTo - 1, to: matchTo },
            ]);
          }
        }

        bareHttpUrlRe.lastIndex = 0;
        let bareMatch: RegExpExecArray | null;
        while ((bareMatch = bareHttpUrlRe.exec(lineText)) !== null) {
          const raw = bareMatch[0];
          const hrefLen = trimAutolinkUrl(raw).length;
          if (hrefLen === 0) continue;
          const matchFrom = line.from + bareMatch.index;
          const matchTo = matchFrom + hrefLen;
          if (intersectsRanges(matchFrom, matchTo, skipRanges)) continue;
          addDecoration(decorations, matchFrom, matchTo, externalLinkMark);
        }

        internalLinkRe.lastIndex = 0;
        let linkMatch: RegExpExecArray | null;
        while ((linkMatch = internalLinkRe.exec(lineText)) !== null) {
          const linkText = linkMatch[1] ?? "";
          const matchFrom = line.from + linkMatch.index;
          const matchTo = matchFrom + linkMatch[0].length;
          if (intersectsRanges(matchFrom, matchTo, skipRanges)) continue;
          if (linkText.startsWith("image:") || /https?:\/\//.test(linkText)) continue;
          const isActive = isSyntaxActive(view, matchFrom, matchTo);

          addDecoration(
            decorations,
            matchFrom + 1,
            matchTo - 1,
            linkMarkForTitle(linkText, existingLinkTitles),
          );
          if (!isActive) {
            hideDecorations(decorations, [
              { from: matchFrom, to: matchFrom + 1 },
              { from: matchTo - 1, to: matchTo },
            ]);
          }
        }

        tagRe.lastIndex = 0;
        let tagMatch: RegExpExecArray | null;
        while ((tagMatch = tagRe.exec(lineText)) !== null) {
          const hashOffset = tagMatch[0].indexOf("#");
          if (hashOffset >= 0) {
            const tagText = tagMatch[1] ?? "";
            const tagFrom = line.from + tagMatch.index + hashOffset;
            const tagTo = tagFrom + tagText.length;
            if (intersectsRanges(tagFrom, tagTo, skipRanges)) continue;
            addDecoration(decorations, tagFrom, tagTo, tagMark);
          }
        }
      }

      if (line.to >= to || line.number >= view.state.doc.lines) {
        break;
      }
      pos = line.to + 1;
    }
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const decorations: PendingDecoration[] = [];
  const caretLines = getCaretLineNumbers(view);
  const viewport = effectiveDecorationViewport(view);
  const skipRanges = viewport.flatMap(({ from, to }) =>
    collectCustomSyntaxSkipRanges(view.state, from, to),
  );
  const tableRanges = collectInactiveMarkdownTableRanges(view, viewport);
  const mermaidRanges = collectInactiveMermaidBlockRanges(view, viewport);
  const mathRanges = collectInactiveMathBlockRanges(view, viewport);
  const firstLine = view.state.doc.line(1);
  const existingLinkTitles = view.state.field(existingLinkTitlesField);
  const blockWidgetRanges = [...tableRanges, ...mermaidRanges, ...mathRanges];
  if (!rangeFullyContainedInAny({ from: firstLine.from, to: firstLine.to }, blockWidgetRanges)) {
    addDecoration(decorations, firstLine.from, firstLine.to, pageTitleLineMark);
  }

  const blockRanges = [...tableRanges, ...mermaidRanges, ...mathRanges];
  const allSkipRanges = [...skipRanges, ...blockRanges];
  addIndentDecorations(view, caretLines, decorations, allSkipRanges, viewport);
  addFencedCodeDecorations(view, caretLines, decorations, viewport);
  addMarkdownDecorations(view, caretLines, decorations, blockRanges, viewport);
  addTipsboardLinkDecorations(
    view,
    caretLines,
    decorations,
    allSkipRanges,
    existingLinkTitles,
    viewport,
  );

  decorations.sort(
    (a, b) =>
      a.from - b.from ||
      a.deco.startSide - b.deco.startSide ||
      a.to - b.to,
  );
  for (const d of decorations) {
    builder.add(d.from, d.to, d.deco);
  }

  return builder.finish();
}

/** @internal Vitest: inline DecorationSet from the live editor pipeline. */
export function buildTipsboardDecorationSetForTesting(view: EditorView): DecorationSet {
  return buildDecorations(view);
}

export const tipsboardTableDecorations = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecorations(state);
  },
  update(value, transaction) {
    if (
      transaction.docChanged ||
      transaction.selection ||
      transaction.effects.some((effect) => effect.is(setExistingLinkTitlesEffect))
    ) {
      return buildTableDecorations(transaction.state);
    }
    return value.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const tipsboardInlineDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        hasExistingLinkTitlesEffect(update)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const tableEditHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || !(event.target instanceof Element)) {
      return false;
    }
    const divider = event.target.closest<HTMLElement>(
      "[data-tipsboard-divider-from]",
    );
    const dividerFrom = Number(divider?.dataset.tipsboardDividerFrom);
    if (Number.isFinite(dividerFrom)) {
      event.preventDefault();
      view.focus();
      view.dispatch({ selection: { anchor: dividerFrom } });
      return true;
    }

    if (event.target.closest("[data-tipsboard-table-link-type]")) {
      return false;
    }

    const table = event.target.closest<HTMLElement>("[data-tipsboard-table-from]");
    const from = Number(table?.dataset.tipsboardTableFrom);
    if (!Number.isFinite(from)) {
      const math = event.target.closest<HTMLElement>("[data-tipsboard-math-from]");
      const mathFrom = Number(math?.dataset.tipsboardMathFrom);
      if (!Number.isFinite(mathFrom)) {
        return false;
      }
      event.preventDefault();
      view.focus();
      view.dispatch({ selection: { anchor: mathFrom } });
      return true;
    }

    event.preventDefault();
    view.focus();
    view.dispatch({ selection: { anchor: from } });
    return true;
  },
});

export function tipsboardDecorations(
  existingNormalizedTitles: Iterable<string> = [],
): Extension[] {
  return [
    existingLinkTitlesField.init(() => new Set(existingNormalizedTitles)),
    tipsboardTableDecorations,
    tipsboardInlineDecorations,
    codeBlockShellWrappers,
    tableEditHandler,
  ];
}

export const tipsboardTheme = EditorView.baseTheme({
  ".cm-page-title-line": {
    fontWeight: "700",
    fontSize: "1.48em",
    lineHeight: "1.35",
    letterSpacing: "-0.02em",
    paddingBottom: "12px",
    borderBottom: `1px solid ${pe.borderStrong}`,
    marginBottom: "10px",
    display: "inline-block",
    width: "100%",
    color: pt.primary,
  },
  ".cm-tipsboard-bold": { fontWeight: "bold" },
  ".cm-tipsboard-italic": { fontStyle: "italic" },
  ".cm-tipsboard-strike": { textDecoration: "line-through", opacity: "0.6" },
  ".cm-tipsboard-h1": { fontWeight: "700", fontSize: "1.5em", lineHeight: "1.4", color: pt.primary },
  ".cm-tipsboard-h2": { fontWeight: "700", fontSize: "1.3em", lineHeight: "1.4", color: pt.primary },
  ".cm-tipsboard-h3": { fontWeight: "700", fontSize: "1.15em", lineHeight: "1.4", color: pt.primary },
  ".cm-tipsboard-h4": { fontWeight: "700", fontSize: "1.08em", color: pt.primary },
  ".cm-tipsboard-h5": { fontWeight: "600", fontSize: "1.0em", color: pt.primary },
  ".cm-tipsboard-h6": { fontWeight: "600", fontSize: "0.95em", color: pt.primary },
  ".cm-tipsboard-bullet-marker": {
    color: pt.primary,
    fontSize: "0.9em",
    marginRight: "1px",
  },
  ".cm-tipsboard-ordered-marker": {
    color: pt.primary,
    fontWeight: "600",
    fontVariantNumeric: "tabular-nums",
  },
  ".cm-tipsboard-indent": {},
  ".cm-tipsboard-inline-code": {
    fontFamily: "monospace",
    backgroundColor: pe.paperInset,
    color: pe.textCode,
    borderRadius: "5px",
    padding: "0 3px",
  },
  ".cm-tipsboard-link": {
    color: pa.link,
    textDecoration: "underline",
    textDecorationThickness: "0.08em",
    textUnderlineOffset: "0.18em",
    cursor: "pointer",
  },
  ".cm-tipsboard-missing-link": {
    color: pa["link-new"],
    backgroundColor: pe.missingLinkBg,
    borderRadius: "5px",
    padding: "0 2px",
    textDecoration: "underline",
    textDecorationStyle: "dotted",
    textDecorationThickness: "0.09em",
    textUnderlineOffset: "0.18em",
    cursor: "pointer",
  },
  ".cm-tipsboard-external-link": {
    color: pa.external,
    textDecoration: "underline",
    textDecorationThickness: "0.08em",
    textUnderlineOffset: "0.18em",
    cursor: "pointer",
  },
  ".cm-tipsboard-vault-attachment-link": {
    color: pa.external,
    textDecoration: "underline",
    textDecorationThickness: "0.08em",
    textUnderlineOffset: "0.18em",
    cursor: "pointer",
    paddingInlineEnd: "2px",
  },
  ".cm-tipsboard-vault-attachment-link::before": {
    display: "inline-block",
    fontFamily: '"Font Awesome 7 Free"',
    fontWeight: "900",
    content: '"\\f0c6"',
    marginInlineEnd: "0.35em",
    opacity: "0.92",
    fontSize: "0.82em",
    lineHeight: "1",
    verticalAlign: "0.05em",
    textDecoration: "none",
    WebkitFontSmoothing: "antialiased",
  },
  ".cm-tipsboard-vault-attachment-link--dom-icon::before": {
    content: '""',
    margin: "0",
    display: "none",
  },
  ".cm-tipsboard-vault-attachment-link--dom-icon > .fa-paperclip": {
    marginInlineEnd: "0.35em",
    opacity: "0.92",
    fontSize: "0.82em",
    verticalAlign: "0.05em",
    textDecoration: "none",
  },
  ".cm-tipsboard-tag": {
    color: pa.tag,
    fontWeight: "600",
    cursor: "pointer",
  },
  ".cm-tipsboard-quote": {
    borderLeft: `3px solid ${pa.quote}`,
    paddingLeft: "10px",
    color: pt.primary,
    fontStyle: "italic",
  },
  ".cm-tipsboard-code-shell": {
    boxSizing: "border-box",
    display: "block",
    border: `1px solid ${pe.border}`,
    borderRadius: "7px",
    backgroundColor: "rgba(28,25,23,0.035)",
    margin: "6px 0",
    padding: "0 8px",
  },
  ".cm-tipsboard-code-shell .cm-line": {
    paddingTop: "0",
    paddingBottom: "0",
  },
  ".cm-tipsboard-code-shell .cm-tipsboard-code": {
    backgroundColor: "transparent",
    borderLeft: "none",
    margin: "0",
    borderRadius: "0",
    boxDecorationBreak: "unset",
    padding: "0 2px",
  },
  ".cm-tipsboard-code": {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: "0.88em",
    lineHeight: "1.7",
    color: pe.textCode,
    backgroundColor: "rgba(28,25,23,0.045)",
    borderLeft: `2px solid ${pe.borderStrong}`,
    boxDecorationBreak: "clone",
    padding: "0 4px",
    margin: "2px 0",
    borderRadius: "5px",
  },
  ".cm-tipsboard-divider": {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    width: "100%",
    margin: "10px 0",
    padding: "6px 0",
    verticalAlign: "middle",
  },
  ".cm-tipsboard-divider-line": {
    flex: "1",
    borderTop: `1px solid ${pe.borderStrong}`,
  },
  ".cm-tipsboard-table-wrapper": {
    boxSizing: "border-box",
    display: "block",
    width: "100%",
    minWidth: "0",
    maxWidth: "min(100%, calc(100vw - 72px))",
    overflowX: "auto",
    margin: "8px 0",
    border: `1px solid ${pe.borderStrong}`,
    borderRadius: "10px",
    backgroundColor: pe.paper,
  },
  ".cm-tipsboard-table": {
    width: "100%",
    tableLayout: "fixed",
    borderCollapse: "collapse",
    fontSize: "0.92em",
    lineHeight: "1.55",
  },
  ".cm-tipsboard-table th": {
    backgroundColor: pe.paperInset,
    color: pt.primary,
    fontWeight: "700",
  },
  ".cm-tipsboard-table-cell": {
    borderBottom: `1px solid ${pe.border}`,
    borderRight: `1px solid ${pe.border}`,
    padding: "6px 10px",
    verticalAlign: "top",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  ".cm-tipsboard-table tr:last-child .cm-tipsboard-table-cell": {
    borderBottom: "none",
  },
  ".cm-tipsboard-table-cell:last-child": {
    borderRight: "none",
  },
  ".cm-tipsboard-mermaid-wrapper": {
    boxSizing: "border-box",
    display: "block",
    width: "100%",
    maxWidth: "100%",
    minWidth: "0",
    contain: "inline-size",
    overflowX: "auto",
    margin: "10px 0",
    padding: "16px",
    border: `1px solid ${pe.diagramFrame}`,
    borderRadius: "10px",
    backgroundColor: pe.paperMuted,
  },
  ".cm-tipsboard-mermaid-wrapper svg": {
    display: "block",
    width: "auto",
    maxWidth: "100%",
    height: "auto",
    margin: "0 auto",
    overflow: "hidden",
  },
  ".cm-tipsboard-mermaid-loading": {
    color: pt.muted,
    fontSize: "0.88em",
  },
  ".cm-tipsboard-mermaid-error": {
    color: pa.error,
    fontSize: "0.88em",
    whiteSpace: "pre-wrap",
  },
  ".cm-image-widget": {
    display: "inline-block",
  },
  ".cm-tipsboard-katex-display": {
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    margin: "0.6rem 0",
    overflowX: "auto",
  },
  ".cm-tipsboard-katex-inline .katex": {
    fontSize: "inherit",
  },
  ".cm-tipsboard-katex-error": {
    color: pa.error,
    fontFamily: "monospace",
    fontSize: "0.9em",
  },
});
