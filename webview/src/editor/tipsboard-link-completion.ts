import type { Completion, CompletionContext } from "@codemirror/autocomplete";
import type { LinkSuggestion } from "@/types";

export function createLocalLinkCompletionSource(
  getSuggestions: () => LinkSuggestion[],
) {
  return (context: CompletionContext) => {
    const before = context.matchBefore(/\[[^\]\n]*/);
    if (!before || (before.from === before.to && !context.explicit)) return null;

    const query = before.text.slice(1).trim().toLowerCase();
    const options: Completion[] = getSuggestions()
      .filter((suggestion) => {
        if (!query) return true;
        return (
          suggestion.title.toLowerCase().includes(query) ||
          suggestion.filename.toLowerCase().includes(query)
        );
      })
      .slice(0, 80)
      .map((suggestion) => ({
        label: suggestion.title,
        detail: suggestion.filename,
        type: "text",
        apply: `${suggestion.title}]`,
      }));

    return {
      from: before.from + 1,
      options,
      validFor: /^[^\]\n]*$/,
    };
  };
}
