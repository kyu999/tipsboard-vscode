import { useTranslation } from "react-i18next";
import type { AtxHeading } from "@/domain/markdown/atxHeadings";

const LEVEL_PADDING: Record<number, string> = {
  1: "pl-0",
  2: "pl-3",
  3: "pl-5",
  4: "pl-7",
  5: "pl-9",
  6: "pl-11",
};

export function NoteOutlineNav({
  headings,
  open,
  onToggleOpen,
  onSelectHeading,
  activeLineNumber,
  className = "",
}: {
  headings: AtxHeading[];
  open: boolean;
  onToggleOpen: () => void;
  onSelectHeading: (lineNumber: number) => void;
  activeLineNumber?: number | null;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!open) {
    return (
      <div className={`w-8 shrink-0 ${className}`.trim()}>
        <button
          type="button"
          onClick={onToggleOpen}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-accent-link/[0.08] bg-bg-elevated/95 text-text-muted shadow-sm transition-colors hover:bg-bg-hover hover:text-accent-link focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
          aria-label={t("page.editor.outlineToggle")}
          title={t("page.editor.outlineToggle")}
        >
          <i className="fa-solid fa-list-ul text-[11px]" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <aside
      className={`flex w-56 shrink-0 flex-col sm:w-64 ${className}`.trim()}
      aria-label={t("page.editor.outlineNav")}
    >
      <div className="flex max-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-lg border border-accent-link/[0.08] bg-bg-elevated/95 shadow-sm backdrop-blur-[6px]">
        <div className="flex justify-end border-b border-accent-link/[0.06] px-1.5 py-1">
          <button
            type="button"
            onClick={onToggleOpen}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
            aria-label={t("page.editor.outlineToggleClose")}
            title={t("page.editor.outlineToggleClose")}
          >
            <i className="fa-solid fa-chevron-left text-[10px]" aria-hidden />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-1 py-1.5">
          {headings.length === 0 ? (
            <p className="px-2 py-3 text-2xs leading-relaxed text-text-muted">{t("page.editor.outlineEmpty")}</p>
          ) : (
            <ul className="m-0 list-none space-y-0.5 p-0">
              {headings.map((heading) => {
                const active = activeLineNumber === heading.lineNumber;
                return (
                  <li key={`${heading.lineNumber}-${heading.level}-${heading.text}`}>
                    <button
                      type="button"
                      onClick={() => onSelectHeading(heading.lineNumber)}
                      className={`block w-full break-words rounded-md px-2 py-1 text-left text-xs leading-snug transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 ${
                        LEVEL_PADDING[heading.level] ?? "pl-0"
                      } ${
                        active
                          ? "bg-accent-link/[0.1] font-medium text-accent-link"
                          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      }`}
                      title={heading.text}
                    >
                      {heading.text}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </div>
    </aside>
  );
}
