declare module "markdown-it-texmath" {
  import type MarkdownIt from "markdown-it";

  interface TexmathOptions {
    engine?: typeof import("katex");
    delimiters?: string | string[];
    outerSpace?: boolean;
    katexOptions?: Record<string, unknown>;
    macros?: Record<string, string>;
  }

  function texmath(md: MarkdownIt, options?: TexmathOptions): void;

  export default texmath;
}

declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";

  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }

  const plugin: (md: MarkdownIt, options?: TaskListsOptions) => void;
  export = plugin;
}
