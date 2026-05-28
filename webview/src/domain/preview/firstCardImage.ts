import { MARKDOWN_IMAGE_RE } from "@/domain/markdown/imageSyntax";

/** Editor / CodeMirror の Markdown 画像表示と同じ許可セット。 */
export function isRenderableCardImageSrc(src: string): boolean {
  return (
    src.startsWith("assets/images/") ||
    src.startsWith("file://") ||
    src.startsWith("http://") ||
    src.startsWith("https://")
  );
}

/** フェンス外の本文を上から見て、カードプレビューに使える最初の Markdown 画像の src を返す。 */
export function extractFirstCardRenderableImageSrc(body: string): string | null {
  let inFence = false;
  for (const line of body.split("\n")) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    MARKDOWN_IMAGE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MARKDOWN_IMAGE_RE.exec(line)) !== null) {
      const src = match[2];
      if (!src || !isRenderableCardImageSrc(src)) continue;
      return src;
    }
  }
  return null;
}
