export const MARKDOWN_IMAGE_RE = /!\[([^\]\n]*)\]\(([^)\s]+)\)/g;

export type MarkdownImageAlign = "left" | "center" | "right";

export interface MarkdownImageOptions {
  widthUnits?: number;
  align?: MarkdownImageAlign;
}

export interface ParsedMarkdownImageAlt {
  alt: string;
  options: MarkdownImageOptions;
}

const IMAGE_OPTION_RE = /^(?:(10|[1-9])([lcr])?|([lcr]))$/;

const ALIGN_BY_TOKEN: Record<string, MarkdownImageAlign> = {
  l: "left",
  c: "center",
  r: "right",
};

export function parseMarkdownImageAlt(rawAlt: string): ParsedMarkdownImageAlt {
  const separatorIndex = rawAlt.lastIndexOf("|");
  if (separatorIndex < 0) {
    return { alt: rawAlt, options: {} };
  }

  const optionToken = rawAlt.slice(separatorIndex + 1);
  const match = IMAGE_OPTION_RE.exec(optionToken);
  if (!match) {
    return { alt: rawAlt, options: {} };
  }

  const widthToken = match[1];
  const alignToken = match[2] ?? match[3];
  return {
    alt: rawAlt.slice(0, separatorIndex),
    options: {
      widthUnits: widthToken ? Number(widthToken) : undefined,
      align: alignToken ? ALIGN_BY_TOKEN[alignToken] : undefined,
    },
  };
}

export function imageWidthPercent(widthUnits: number): string {
  return `${widthUnits * 10}%`;
}

/** 幅比率指定時のインライン style。max-height 上限と併用すると縦横比が崩れるため、高さは auto のみにする。 */
export function imageLayoutInlineStyle(options: MarkdownImageOptions): string | undefined {
  if (options.widthUnits === undefined) {
    return undefined;
  }
  return `width: ${imageWidthPercent(options.widthUnits)}; height: auto; max-height: none;`;
}
