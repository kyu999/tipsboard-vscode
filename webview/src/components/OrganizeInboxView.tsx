import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { isInboxNotePath } from "@tipsboard/shared/inboxPath";
import type {
  BulkOrganizeSuggestionsResponse,
  BulkMoveNotesResponse,
  NoteSummary,
  OrganizeSuggestion,
  OrganizeSuggestionsResponse,
  VaultSnapshot,
} from "@/types";

export type OrganizeDestinationChoice = 0 | 1 | 2 | "skip";

export interface OrganizeRowPlan {
  notePath: string;
  title: string;
  included: boolean;
  choice: OrganizeDestinationChoice;
  suggestions: OrganizeSuggestion[];
  hasRelativeMarkdownLinks: boolean;
}

interface BulkOrganizeProgress {
  completed: number;
  total: number;
  notePath?: string | null;
}

function buildRowPlans(
  inboxNotes: NoteSummary[],
  response: BulkOrganizeSuggestionsResponse | null,
): OrganizeRowPlan[] {
  const byPath = new Map(
    (response?.items ?? []).map((item) => [item.notePath.replace(/\\/g, "/"), item]),
  );
  return inboxNotes.map((note) => {
    const normalizedPath = note.path.replace(/\\/g, "/");
    const item = byPath.get(normalizedPath);
    const suggestions = item?.suggestions ?? [];
    return {
      notePath: normalizedPath,
      title: note.title || note.filename,
      included: suggestions.length > 0,
      choice: suggestions.length > 0 ? 0 : "skip",
      suggestions,
      hasRelativeMarkdownLinks: item?.hasRelativeMarkdownLinks ?? false,
    };
  });
}

function choiceFolder(row: OrganizeRowPlan): string | null {
  if (!row.included || row.choice === "skip") return null;
  return row.suggestions[row.choice]?.folder ?? null;
}

function confidenceLabelKey(confidence: OrganizeSuggestion["confidence"]): string {
  return `organize.confidence.${confidence}`;
}

interface OrganizeInboxViewProps {
  notes: NoteSummary[];
  preferFolderHierarchy: boolean;
  onPreferFolderHierarchyChange: (value: boolean) => void;
  onSnapshotChange: (snapshot: VaultSnapshot) => void;
  onBulkMoved: (result: BulkMoveNotesResponse) => void;
  onSelectNote: (path: string) => void;
  onError: (message: string) => void;
}

export function OrganizeInboxView({
  notes,
  preferFolderHierarchy,
  onPreferFolderHierarchyChange,
  onSnapshotChange,
  onBulkMoved,
  onSelectNote,
  onError,
}: OrganizeInboxViewProps) {
  const { t } = useTranslation();
  const inboxNotes = useMemo(
    () => notes.filter((note) => isInboxNotePath(note.path)),
    [notes],
  );
  const [bulkResponse, setBulkResponse] = useState<BulkOrganizeSuggestionsResponse | null>(null);
  const [rows, setRows] = useState<OrganizeRowPlan[]>(() => buildRowPlans(inboxNotes, null));
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BulkOrganizeProgress | null>(null);

  useEffect(() => {
    setRows(buildRowPlans(inboxNotes, bulkResponse));
  }, [bulkResponse, inboxNotes]);

  const selectedMoveCount = useMemo(
    () => rows.filter((row) => row.included && choiceFolder(row)).length,
    [rows],
  );
  const allIncluded = rows.length > 0 && rows.every((row) => row.included);
  const someIncluded = rows.some((row) => row.included);

  const handleAnalyze = useCallback(async () => {
    if (inboxNotes.length === 0) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const response = await window.tipsboardDesktop.getBulkOrganizeSuggestions((value) => {
        if (value && typeof value === "object" && "completed" in value && "total" in value) {
          setProgress(value as BulkOrganizeProgress);
        }
      });
      setBulkResponse(response);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      onError(message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [inboxNotes.length, onError]);

  const handleExecute = useCallback(async () => {
    const moves = rows
      .map((row) => {
        const folder = choiceFolder(row);
        return folder ? { notePath: row.notePath, targetFolder: folder } : null;
      })
      .filter((move): move is { notePath: string; targetFolder: string } => move !== null);
    if (moves.length === 0) return;

    setMoving(true);
    setError(null);
    try {
      const result = await window.tipsboardDesktop.moveNotesToFolders(moves);
      onBulkMoved(result);
      onSnapshotChange(result.snapshot);
      setBulkResponse(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      onError(message);
    } finally {
      setMoving(false);
    }
  }, [onBulkMoved, onSnapshotChange, onError, rows]);

  const updateRow = useCallback((notePath: string, patch: Partial<OrganizeRowPlan>) => {
    setRows((current) =>
      current.map((row) => (row.notePath === notePath ? { ...row, ...patch } : row)),
    );
  }, []);

  const toggleAllIncluded = useCallback((included: boolean) => {
    setRows((current) => current.map((row) => ({ ...row, included })));
  }, []);

  if (!preferFolderHierarchy) {
    return (
      <div className="tb-shell flex min-h-0 flex-1 flex-col overflow-hidden py-4 sm:py-6">
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4 px-1">
          <header>
            <h1 className="text-lg font-semibold text-text-primary">{t("organize.panelTitle")}</h1>
            <p className="mt-1 text-sm leading-6 text-text-muted">{t("organize.panelDisabledHint")}</p>
          </header>
          <label className="flex items-start gap-3 rounded-xl border border-accent-link/15 bg-bg-card px-4 py-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={preferFolderHierarchy}
              onChange={(event) => onPreferFolderHierarchyChange(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-text-primary">{t("organize.hierarchyToggle")}</span>
              <span className="mt-0.5 block text-xs leading-5 text-text-muted">{t("organize.hierarchyToggleHint")}</span>
            </span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="tb-shell flex min-h-0 flex-1 flex-col overflow-hidden py-4 sm:py-6">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl min-h-0 flex-1 flex-col gap-4 px-1">
        <header className="shrink-0 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">{t("organize.panelTitle")}</h1>
              <p className="mt-1 text-sm leading-6 text-text-muted">{t("organize.panelDescription")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="tb-btn-secondary text-xs"
                disabled={busy || moving || inboxNotes.length === 0}
                onClick={() => void handleAnalyze()}
              >
                <i className="fa-solid fa-wand-magic-sparkles text-[11px]" aria-hidden />
                {busy ? t("organize.analyzing") : t("organize.analyzeAll")}
              </button>
              <button
                type="button"
                className="tb-btn-primary text-xs"
                disabled={moving || selectedMoveCount === 0}
                onClick={() => void handleExecute()}
              >
                <i className="fa-solid fa-folder-tree text-[11px]" aria-hidden />
                {moving
                  ? t("organize.moving")
                  : t("organize.moveSelected", { count: selectedMoveCount })}
              </button>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-accent-link/10 bg-bg-elevated px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={preferFolderHierarchy}
              onChange={(event) => onPreferFolderHierarchyChange(event.target.checked)}
            />
            <span>
              <span className="block text-xs font-medium text-text-primary">{t("organize.hierarchyToggle")}</span>
              <span className="mt-0.5 block text-2xs leading-4 text-text-muted">{t("organize.hierarchyToggleHint")}</span>
            </span>
          </label>

          {bulkResponse && !bulkResponse.semanticEnabled && (
            <p className="text-xs text-text-muted">{t("organize.semanticRecommended")}</p>
          )}
          {error && (
            <p className="rounded-lg border border-accent-error/25 bg-accent-error/10 px-3 py-2 text-xs text-accent-error">
              {error}
            </p>
          )}
          {busy && progress && (
            <p className="text-xs text-text-muted">
              {t("organize.bulkProgress", {
                completed: progress.completed,
                total: progress.total,
              })}
            </p>
          )}
        </header>

        {inboxNotes.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-accent-link/10 bg-bg-card px-6 py-16 text-center">
            <div>
              <p className="text-sm font-medium text-text-primary">{t("organize.emptyInboxTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">{t("organize.emptyInboxDescription")}</p>
            </div>
          </div>
        ) : !bulkResponse && !busy ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-accent-link/20 bg-bg-card/60 px-6 py-16 text-center">
            <div>
              <p className="text-sm font-medium text-text-primary">{t("organize.readyTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {t("organize.readyDescription", { count: inboxNotes.length })}
              </p>
              <button type="button" className="tb-btn-primary mt-4 text-xs" onClick={() => void handleAnalyze()}>
                {t("organize.analyzeAll")}
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-accent-link/8 bg-bg-card">
            <table className="w-full min-w-[52rem] border-collapse text-left text-xs leading-snug text-text-primary">
              <thead className="sticky top-0 z-[1] border-b border-accent-link/10 bg-bg-card/90 backdrop-blur-md">
                <tr className="text-2xs font-medium tracking-normal text-text-muted/90 align-middle">
                  <th className="w-9 px-2 py-2 text-center" scope="col">
                    <input
                      type="checkbox"
                      aria-label={t("organize.selectAll")}
                      checked={allIncluded}
                      ref={(input) => {
                        if (input) input.indeterminate = someIncluded && !allIncluded;
                      }}
                      onChange={(event) => toggleAllIncluded(event.target.checked)}
                    />
                  </th>
                  <th className="min-w-[10rem] px-2 py-2 font-medium" scope="col">
                    {t("organize.columnNote")}
                  </th>
                  {[0, 1, 2].map((index) => (
                    <th key={index} className="min-w-[9rem] px-2 py-2 font-medium" scope="col">
                      {t("organize.columnCandidate", { rank: index + 1 })}
                    </th>
                  ))}
                  <th className="min-w-[5.5rem] px-2 py-2 font-medium" scope="col">
                    {t("organize.columnSkip")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <OrganizeRow
                    key={row.notePath}
                    row={row}
                    busy={busy || moving}
                    onUpdate={(patch) => updateRow(row.notePath, patch)}
                    onOpen={() => onSelectNote(row.notePath)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function organizeOptionClass(active: boolean, disabled: boolean): string {
  const base =
    "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-[background-color,box-shadow,opacity] duration-100";
  if (disabled) return `${base} cursor-not-allowed opacity-50`;
  if (active) return `${base} bg-accent-link/[0.07] shadow-[inset_0_0_0_1px_rgba(8,127,54,0.14)]`;
  return `${base} opacity-95`;
}

function OrganizeRow({
  row,
  busy,
  onUpdate,
  onOpen,
}: {
  row: OrganizeRowPlan;
  busy: boolean;
  onUpdate: (patch: Partial<OrganizeRowPlan>) => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const groupName = `organize-${row.notePath}`;
  const willMove = row.included && row.choice !== "skip" && choiceFolder(row) !== null;

  return (
    <tr
      className={`align-middle border-b border-accent-link/[0.06] bg-bg-card transition-colors duration-100 last:border-b-0 hover:bg-bg-hover ${
        willMove ? "shadow-[inset_3px_0_0_0_rgba(8,127,54,0.2)]" : ""
      } ${!row.included ? "opacity-80" : ""}`}
    >
      <td className="px-2 py-2 text-center align-middle">
        <input
          type="checkbox"
          checked={row.included}
          disabled={busy}
          onChange={(event) => onUpdate({ included: event.target.checked })}
        />
      </td>
      <td className="max-w-[14rem] px-2 py-2 align-top">
        <button
          type="button"
          className="block max-w-full truncate text-left font-medium text-text-primary underline-offset-2 transition-colors hover:text-accent-link hover:underline"
          title={row.notePath}
          onClick={onOpen}
        >
          {row.title}
        </button>
        <p className="mt-0.5 truncate font-mono text-[11px] leading-relaxed text-text-muted/90">{row.notePath}</p>
        {row.hasRelativeMarkdownLinks && (
          <p className="mt-1 text-2xs text-text-muted">
            <span className="text-amber-600/75 dark:text-amber-400/75">{t("organize.relativeLinksShort")}</span>
          </p>
        )}
      </td>
      {[0, 1, 2].map((index) => {
        const suggestion = row.suggestions[index];
        const choice = index as OrganizeDestinationChoice;
        const active = row.included && row.choice === choice;
        return (
          <td key={index} className="px-2 py-2 align-top">
            {suggestion ? (
              <label
                className={organizeOptionClass(active, busy || !row.included)}
              >
                <input
                  type="radio"
                  name={groupName}
                  className="mt-0.5 shrink-0"
                  disabled={busy || !row.included}
                  checked={active}
                  onChange={() => onUpdate({ included: true, choice })}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-text-primary">{suggestion.folder}/</span>
                  <span className="mt-0.5 block text-2xs text-text-muted/90">
                    {Math.round(suggestion.score * 100)}% · {t(confidenceLabelKey(suggestion.confidence))}
                  </span>
                </span>
              </label>
            ) : (
              <span className="px-2 text-2xs text-text-muted/70">—</span>
            )}
          </td>
        );
      })}
      <td className="px-2 py-2 align-top">
        <label
          className={organizeOptionClass(!row.included || row.choice === "skip", busy)}
        >
          <input
            type="radio"
            name={groupName}
            className="mt-0.5 shrink-0"
            disabled={busy}
            checked={!row.included || row.choice === "skip"}
            onChange={() => onUpdate({ choice: "skip" })}
          />
          <span className="text-2xs text-text-muted">{t("organize.skipMove")}</span>
        </label>
      </td>
    </tr>
  );
}

export function itemFromSingleResponse(
  note: NoteSummary,
  response: OrganizeSuggestionsResponse,
): OrganizeRowPlan {
  return {
    notePath: note.path.replace(/\\/g, "/"),
    title: note.title || note.filename,
    included: response.suggestions.length > 0,
    choice: response.suggestions.length > 0 ? 0 : "skip",
    suggestions: response.suggestions,
    hasRelativeMarkdownLinks: response.hasRelativeMarkdownLinks,
  };
}
