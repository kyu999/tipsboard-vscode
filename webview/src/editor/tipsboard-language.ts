import { commonmarkLanguage, markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";

import { Highlight } from "./tipsboard-highlight";

export const tipsboardLanguage = markdown({
  base: commonmarkLanguage,
  extensions: [GFM, Highlight],
  addKeymap: false,
  completeHTMLTags: false,
  pasteURLAsLink: false,
});
