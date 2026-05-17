import { EditorView } from "@codemirror/view";
import { openExternalInHost, openVaultAttachmentInHost } from "@/vscode-bridge-client";
import { trimAutolinkUrl } from "@/domain/autolink";
import { parseIconSyntax } from "@/domain/links/iconSyntax";
import { isCustomSyntaxIgnoredPosition } from "./tipsboard-markdown-ranges";

export type LinkClickHandler = (
  title: string,
  type: "internal" | "external" | "tag",
  options?: { openInNewTab?: boolean },
) => void;

type LinkTarget =
  | { type: "external"; href: string }
  | { type: "internal" | "tag"; title: string }
  | { type: "vaultAttachment"; relativePath: string };

const LINK_PATTERNS = [
  {
    re: /(?<!\\)\[([^\[\]\n]+?)\s+(https?:\/\/\S+)\](?!\()/,
    type: "external" as const,
    bracketWidth: 1,
  },
  {
    re: /(?<!\\)\[(https?:\/\/\S+)\](?!\()/,
    type: "external" as const,
    bracketWidth: 1,
  },
  {
    re: /(?<!\[)(?<![\w/])(https?:\/\/\S+)/,
    type: "external" as const,
    bracketWidth: 0,
    bareUrlTrim: true as const,
  },
  {
    re: /(?<!\\)\[([^\[\]\n]+?)\](?!\()/,
    type: "internal" as const,
    bracketWidth: 1,
  },
  {
    re: /(?<!\S)#(\S+)/,
    type: "tag" as const,
    bracketWidth: 0,
  },
];

function findVaultAttachmentLinkAtPosition(lineText: string, offsetInLine: number): LinkTarget | null {
  const re = /(?<!\\)(?<!\!)\[([^\]\n]*)\]\((assets\/files\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offsetInLine >= start && offsetInLine < end) {
      return { type: "vaultAttachment", relativePath: match[2]!.replace(/\\/g, "/") };
    }
  }
  return null;
}

function findLinkAtPosition(view: EditorView, pos: number): LinkTarget | null {
  const line = view.state.doc.lineAt(pos);
  const lineText = line.text;
  const offsetInLine = pos - line.from;

  const vaultAttach = findVaultAttachmentLinkAtPosition(lineText, offsetInLine);
  if (vaultAttach) return vaultAttach;

  if (isCustomSyntaxIgnoredPosition(view.state, pos)) return null;

  for (const pattern of LINK_PATTERNS) {
    const re = new RegExp(pattern.re.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(lineText)) !== null) {
      let contentEnd = match.index + match[0].length - pattern.bracketWidth;
      if ("bareUrlTrim" in pattern && pattern.bareUrlTrim && pattern.type === "external") {
        const href = trimAutolinkUrl(match[0]);
        contentEnd = match.index + href.length;
      }
      const contentStart = match.index + pattern.bracketWidth;
      if (offsetInLine < contentStart || offsetInLine >= contentEnd) continue;

      if (pattern.type === "external") {
        const href = match[2] ?? match[1];
        const url = "bareUrlTrim" in pattern && pattern.bareUrlTrim ? trimAutolinkUrl(match[0]) : href;
        if (!url) continue;
        return { type: "external", href: url };
      }

      const raw = match[1]?.trim() ?? "";
      if (!raw || raw.startsWith("image:")) continue;
      const parts = raw.split(/\s+/);
      const last = parts[parts.length - 1]!;
      if (last.startsWith("http://") || last.startsWith("https://")) continue;
      const title = parseIconSyntax(raw)?.title ?? raw;
      return { type: pattern.type, title };
    }
  }

  return null;
}

function findTableLinkTarget(eventTarget: EventTarget | null): LinkTarget | null {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const link = eventTarget.closest<HTMLElement>(
    "[data-tipsboard-table-link-type][data-tipsboard-table-link-target]",
  );
  if (!link) {
    return null;
  }

  const type = link.dataset.tipsboardTableLinkType;
  const target = link.dataset.tipsboardTableLinkTarget;
  if (!target) {
    return null;
  }
  if (type === "external") {
    return { type, href: target };
  }
  if (type === "vaultAttachment") {
    return { type: "vaultAttachment", relativePath: target.replace(/\\/g, "/") };
  }
  if (type === "internal" || type === "tag") {
    return { type, title: target };
  }

  return null;
}

function findLinkAtEvent(view: EditorView, event: MouseEvent): LinkTarget | null {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) return null;
  const line = view.state.doc.lineAt(pos);
  if (pos >= line.to) {
    const endCoords = view.coordsAtPos(line.to);
    if (endCoords && event.clientX > endCoords.left) return null;
  }
  return findLinkAtPosition(view, pos);
}

/** Block link navigation so embedded markdown images can receive clicks (lightbox). */
function isMarkdownImageWidgetTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".cm-image-widget"));
}

export function createLinkClickHandler(onLinkClick: LinkClickHandler) {
  let pendingLink: LinkTarget | null = null;
  let pendingPoint: { x: number; y: number } | null = null;

  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) {
        pendingLink = null;
        pendingPoint = null;
        return false;
      }
      if (isMarkdownImageWidgetTarget(event.target)) {
        pendingLink = null;
        pendingPoint = null;
        return false;
      }
      pendingLink = findTableLinkTarget(event.target) ?? findLinkAtEvent(view, event);
      pendingPoint = pendingLink ? { x: event.clientX, y: event.clientY } : null;
      if (!pendingLink) return false;
      event.preventDefault();
      return true;
    },
    click(event, view) {
      if (isMarkdownImageWidgetTarget(event.target)) {
        pendingLink = null;
        pendingPoint = null;
        return false;
      }
      const moved =
        pendingPoint &&
        Math.hypot(event.clientX - pendingPoint.x, event.clientY - pendingPoint.y) > 5;
      const target = moved
        ? null
        : pendingLink ??
          findTableLinkTarget(event.target) ??
          findLinkAtEvent(view, event);
      pendingLink = null;
      pendingPoint = null;
      if (!target) return false;

      event.preventDefault();
      if (target.type === "vaultAttachment") {
        void openVaultAttachmentInHost(target.relativePath);
      } else if (target.type === "external") {
        void openExternalInHost(target.href);
      } else {
        const openInNewTab = event.metaKey || event.ctrlKey;
        onLinkClick(target.title, target.type, openInNewTab ? { openInNewTab: true } : undefined);
      }
      return true;
    },
  });
}
