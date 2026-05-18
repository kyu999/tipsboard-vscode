import { describe, expect, it } from "vitest";

import {
  collectVaultMarkdownImagePaths,
  rewriteVaultMarkdownImages,
} from "./exportMarkdownPreprocess";

describe("collectVaultMarkdownImagePaths", () => {
  it("collects assets/images paths and dedupes", () => {
    const md = `![a](assets/images/x.png) ![b](assets/images/y.jpg)\n![a2](assets/images/x.png)\n`;
    expect(collectVaultMarkdownImagePaths(md).sort()).toEqual(
      ["assets/images/x.png", "assets/images/y.jpg"].sort(),
    );
  });

  it("ignores non-vault and http images", () => {
    const md = "![](https://ex/img.png) ![](other/x.png) ![](assets/images/z.webp)";
    expect(collectVaultMarkdownImagePaths(md)).toEqual(["assets/images/z.webp"]);
  });
});

describe("rewriteVaultMarkdownImages", () => {
  it("leaves markdown unchanged when resolver returns empty", () => {
    const raw = "![](assets/images/m.png)";
    expect(rewriteVaultMarkdownImages(raw, () => "")).toBe(raw);
  });

  it("replaces vault path when resolver returns URL", () => {
    const raw = "![x](assets/images/m.png)";
    expect(rewriteVaultMarkdownImages(raw, () => "data:image/png;base64,QQ")).toBe(
      "![x](data:image/png;base64,QQ)",
    );
  });
});
