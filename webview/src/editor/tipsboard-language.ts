import { commonmarkLanguage, markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";

export const tipsboardLanguage = markdown({
  base: commonmarkLanguage,
  extensions: GFM,
  addKeymap: false,
  completeHTMLTags: false,
  pasteURLAsLink: false,
});
