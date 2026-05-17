import type { EditorTab } from "@/lib/editorTabs";
import type { NoteSummary } from "@/types";

export type NoteTabBarProps = {
  tabs: readonly EditorTab[];
  activeTabId: string | null;
  notesByPath: ReadonlyMap<string, NoteSummary>;
  canClose: boolean;
  tabListAriaLabel: string;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  lastTabCloseTitle: string;
};

function tabLabel(tab: EditorTab, notesByPath: ReadonlyMap<string, NoteSummary>): string {
  if (tab.kind === "tag") {
    return `#${tab.tag}`;
  }
  const p = tab.path.replace(/\\/g, "/");
  return notesByPath.get(p)?.title ?? notesByPath.get(tab.path)?.title ?? p.split("/").pop() ?? tab.path;
}

export function NoteTabBar({
  tabs,
  activeTabId,
  notesByPath,
  canClose,
  tabListAriaLabel,
  onActivate,
  onClose,
  lastTabCloseTitle,
}: NoteTabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div
      className="flex min-h-0 shrink-0 gap-1 overflow-x-auto overscroll-x-contain border-b border-accent-link/10 pb-0.5"
      role="tablist"
      aria-label={tabListAriaLabel}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const label = tabLabel(tab, notesByPath);
        return (
          <div
            key={tab.id}
            role="presentation"
            className={`flex min-w-0 max-w-[8.75rem] shrink-0 items-center rounded-md transition-colors ${
              active
                ? "bg-accent-link/12 text-accent-link shadow-[inset_0_0_0_1px_rgba(8,127,54,0.18)]"
                : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={label}
              className="min-w-0 flex-1 truncate px-1.5 py-0.5 text-left text-2xs font-medium leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 focus-visible:ring-offset-0"
              onClick={() => onActivate(tab.id)}
            >
              {label}
            </button>
            <button
              type="button"
              disabled={!canClose}
              title={canClose ? undefined : lastTabCloseTitle}
              className={
                canClose
                  ? active
                    ? "mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-accent-link/75 transition-colors hover:bg-accent-link/10 hover:text-accent-link focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 focus-visible:ring-offset-0"
                    : "mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 focus-visible:ring-offset-0"
                  : "mr-0.5 flex h-5 w-5 shrink-0 cursor-not-allowed items-center justify-center rounded-sm text-text-muted opacity-30"
              }
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                if (canClose) onClose(tab.id);
              }}
            >
              <i className="fa-solid fa-xmark scale-90 text-[9px]" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
