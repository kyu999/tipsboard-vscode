import { describe, expect, it } from "vitest";

import { extractFirstCardRenderableImageSrc, isRenderableCardImageSrc } from "./firstCardImage";

describe("firstCardImage", () => {
  describe("isRenderableCardImageSrc", () => {
    it("allows vault images and common URL schemes", () => {
      expect(isRenderableCardImageSrc("assets/images/x.png")).toBe(true);
      expect(isRenderableCardImageSrc("https://x/y.png")).toBe(true);
      expect(isRenderableCardImageSrc("file:///tmp/x.png")).toBe(true);
    });

    it("rejects arbitrary relative paths", () => {
      expect(isRenderableCardImageSrc("other/x.png")).toBe(false);
    });
  });

  describe("extractFirstCardRenderableImageSrc", () => {
    it("returns first markdown image src outside fences", () => {
      const body = "Title\n\n![a](assets/images/x.png)\n";
      expect(extractFirstCardRenderableImageSrc(body)).toBe("assets/images/x.png");
    });

    it("returns the image src when the alt carries compact layout options", () => {
      const body = "Title\n\n![a|5c](assets/images/x.png)\n";
      expect(extractFirstCardRenderableImageSrc(body)).toBe("assets/images/x.png");
    });

    it("ignores images inside fenced blocks", () => {
      const body = "```\n![x](assets/images/in.png)\n```\n\n![y](assets/images/out.png)\n";
      expect(extractFirstCardRenderableImageSrc(body)).toBe("assets/images/out.png");
    });

    it("returns null when no renderable image", () => {
      expect(extractFirstCardRenderableImageSrc("no images")).toBeNull();
    });
  });
});
