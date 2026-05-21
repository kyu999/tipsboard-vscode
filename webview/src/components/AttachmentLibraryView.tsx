import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openVaultAttachmentInHost } from "@/vscode-bridge-client";
import { searchAttachments } from "@/lib/attachmentSearch";
import { joinVaultAbsolutePath } from "@/lib/vaultAbsolutePath";
import type { VaultAttachmentSummary } from "@/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === units[units.length - 1]) {
      return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
    }
    value /= 1024;
  }
  return `${bytes} B`;
}

function attachmentDetailSlug(relativePath: string): string {
  return relativePath.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function AttachmentLibraryView({
  vaultPath,
  attachments,
  onSelectNote,
}: {
  vaultPath: string | null;
  attachments: VaultAttachmentSummary[];
  onSelectNote: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [copiedRelativePath, setCopiedRelativePath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(new Set());
  const filtered = useMemo(() => searchAttachments(attachments, query), [attachments, query]);
  const unreferencedCount = useMemo(
    () => attachments.filter((attachment) => !attachment.referenced).length,
    [attachments],
  );

  function toggleDetail(relativePath: string): void {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }

  return (
    <section className="tb-shell flex min-h-0 flex-1 flex-col overflow-hidden py-2 sm:py-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-1 sm:px-2">
        <div className="mb-3 flex min-w-0 shrink-0 flex-col gap-3">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-tight text-text-primary sm:text-base">
              {t("attachments.title")}
            </h1>
            <p className="text-2xs leading-tight text-text-muted sm:text-xs">
              {t("attachments.summary", {
                count: attachments.length,
                unreferenced: unreferencedCount,
              })}
            </p>
          </div>
          <input
            type="search"
            enterKeyHint="search"
            className="tb-input !h-10 min-h-0 w-full min-w-0 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("attachments.searchPlaceholder")}
            spellCheck={false}
            aria-label={t("attachments.searchPlaceholder")}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="tb-card flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-link/10 text-lg text-accent-link">
              <i className="fa-solid fa-paperclip" aria-hidden />
            </div>
            <p className="text-base font-semibold text-text-primary">
              {attachments.length === 0 ? t("attachments.emptyTitle") : t("attachments.noResultsTitle")}
            </p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-text-muted">
              {attachments.length === 0 ? t("attachments.emptyDescription") : t("attachments.noResultsDescription")}
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-accent-link/8 bg-bg-card">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs leading-snug text-text-primary">
              <thead className="sticky top-0 z-[1] border-b border-accent-link/10 bg-bg-card/90 backdrop-blur-md">
                <tr className="text-2xs font-medium tracking-normal text-text-muted/90 align-middle">
                  <th
                    className="w-9 px-2 py-2 text-center"
                    scope="col"
                    aria-label={t("attachments.colOpen")}
                  >
                    <i className="fa-solid fa-up-right-from-square text-[11px] opacity-60" aria-hidden />
                  </th>
                  <th className="min-w-[8rem] max-w-[18rem] px-2 py-2 font-medium" scope="col">
                    {t("attachments.colFilename")}
                  </th>
                  <th className="w-9 px-2 py-2 text-center" scope="col" aria-label={t("attachments.colCopy")}>
                    <i className="fa-solid fa-copy text-[11px] opacity-60" aria-hidden />
                  </th>
                  <th className="min-w-0 px-2 py-2 font-medium" scope="col">
                    {t("attachments.colNotes")}
                  </th>
                  <th className="w-10 px-1 py-2 text-center" scope="col" aria-label={t("attachments.colDetails")}>
                    <i className="fa-solid fa-chevron-down text-[10px] opacity-50" aria-hidden />
                  </th>
                  <th className="w-7 px-1 py-2 text-center" scope="col" aria-label={t("attachments.colStatus")}>
                    {"\u200b"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((attachment) => {
                  const expanded = expandedPaths.has(attachment.relativePath);
                  const detailId = attachmentDetailSlug(attachment.relativePath);
                  const absolutePath =
                    vaultPath != null && vaultPath !== ""
                      ? joinVaultAbsolutePath(vaultPath, attachment.relativePath)
                      : null;
                  return (
                    <Fragment key={attachment.relativePath}>
                      <tr
                        className={`align-middle border-b border-accent-link/[0.06] bg-bg-card transition-colors duration-100 hover:bg-bg-hover ${
                          expanded ? "shadow-[inset_3px_0_0_0_rgba(8,127,54,0.22)]" : ""
                        }`}
                      >
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated hover:text-accent-link focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
                            title={t("attachments.open")}
                            aria-label={t("attachments.open")}
                            onClick={() => openVaultAttachmentInHost(attachment.relativePath)}
                          >
                            <i className="fa-solid fa-up-right-from-square text-[11px]" aria-hidden />
                          </button>
                        </td>
                        <td className="max-w-[18rem] px-2 py-2">
                          <button
                            type="button"
                            className="block max-w-full break-words text-left font-medium text-text-primary underline-offset-2 transition-colors hover:text-accent-link hover:underline"
                            title={attachment.filename}
                            onClick={() => openVaultAttachmentInHost(attachment.relativePath)}
                          >
                            {attachment.filename}
                          </button>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {vaultPath ? (
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
                              title={t("attachments.copyAbsolutePathTitle")}
                              aria-label={t("attachments.copyAbsolutePathAria")}
                              onClick={() => {
                                const abs = joinVaultAbsolutePath(vaultPath, attachment.relativePath);
                                void navigator.clipboard.writeText(abs).then(
                                  () => {
                                    setCopiedRelativePath(attachment.relativePath);
                                    window.setTimeout(() => {
                                      setCopiedRelativePath((current) =>
                                        current === attachment.relativePath ? null : current,
                                      );
                                    }, 2000);
                                  },
                                  () => undefined,
                                );
                              }}
                            >
                              {copiedRelativePath === attachment.relativePath ? (
                                <i className="fa-solid fa-check text-[11px] text-accent-link" aria-hidden />
                              ) : (
                                <i className="fa-solid fa-copy text-[11px]" aria-hidden />
                              )}
                            </button>
                          ) : (
                            <span className="text-2xs text-text-muted/80">—</span>
                          )}
                        </td>
                        <td className="min-w-0 px-2 py-2">
                          {attachment.references.length === 0 ? (
                            <span className="text-2xs text-text-muted/80">—</span>
                          ) : (
                            <ul className="m-0 max-w-md list-none space-y-1.5 p-0">
                              {attachment.references.map((ref) => (
                                <li key={`${attachment.relativePath}:${ref.notePath}:${ref.label}`}>
                                  <button
                                    type="button"
                                    className="tb-internal-link m-0 block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 focus-visible:ring-offset-0"
                                    title={ref.noteTitle}
                                    onClick={() => onSelectNote(ref.notePath)}
                                  >
                                    {ref.noteTitle}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-1 py-2 text-center">
                          <button
                            type="button"
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25 ${
                              expanded ? "bg-bg-elevated text-text-primary" : ""
                            }`}
                            aria-expanded={expanded}
                            aria-controls={`attachment-detail-${detailId}`}
                            id={`attachment-summary-${detailId}`}
                            aria-label={expanded ? t("attachments.hideDetails") : t("attachments.showDetails")}
                            onClick={() => toggleDetail(attachment.relativePath)}
                          >
                            <i
                              className={`fa-solid fa-chevron-down text-[11px] transition-transform duration-200 ease-out ${
                                expanded ? "rotate-180" : ""
                              }`}
                              aria-hidden
                            />
                          </button>
                        </td>
                        <td className="px-1 py-2 text-center">
                          {!attachment.referenced ? (
                            <span
                              className="inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-accent-error/10 text-[11px] font-semibold text-accent-error"
                              title={t("attachments.unreferenced")}
                              aria-label={t("attachments.unreferenced")}
                            >
                              !
                            </span>
                          ) : null}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="border-b border-accent-link/[0.06] bg-bg-card shadow-[inset_3px_0_0_0_rgba(8,127,54,0.22)] transition-colors duration-100 hover:bg-bg-hover">
                          <td colSpan={6} className="px-3 py-2.5 text-left sm:px-5 sm:py-3">
                            <dl
                              id={`attachment-detail-${detailId}`}
                              role="region"
                              aria-labelledby={`attachment-summary-${detailId}`}
                              className="m-0 grid w-full gap-x-8 gap-y-2.5 text-left text-xs sm:grid-cols-[minmax(4.5rem,auto)_1fr]"
                            >
                                <dt className="text-2xs font-medium uppercase tracking-wide text-text-muted/90">
                                  {t("attachments.detailRelativePath")}
                                </dt>
                                <dd className="min-w-0 break-all font-mono text-[11px] leading-relaxed text-text-primary/95">
                                  {attachment.relativePath}
                                </dd>
                                <dt className="text-2xs font-medium uppercase tracking-wide text-text-muted/90">
                                  {t("attachments.detailSize")}
                                </dt>
                                <dd className="tabular-nums text-text-primary">{formatBytes(attachment.size)}</dd>
                                <dt className="text-2xs font-medium uppercase tracking-wide text-text-muted/90">
                                  {t("attachments.detailModified")}
                                </dt>
                                <dd className="text-text-primary">
                                  {new Date(attachment.updatedAt).toLocaleString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </dd>
                                {absolutePath ? (
                                  <>
                                    <dt className="text-2xs font-medium uppercase tracking-wide text-text-muted/90">
                                      {t("attachments.detailAbsolutePath")}
                                    </dt>
                                    <dd className="min-w-0 break-all font-mono text-[11px] leading-relaxed text-text-primary/95">
                                      {absolutePath}
                                    </dd>
                                  </>
                                ) : null}
                            </dl>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
