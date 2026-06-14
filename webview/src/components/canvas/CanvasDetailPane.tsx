import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildCanvasGraphIndex,
  getBecauseChildren,
  getBecauseParents,
  getSolutionChildren,
  getSolutionParents,
  problemNeedsSolution,
} from "@/lib/canvas/graphUtils";
import { computeProblemDepths } from "@/lib/canvas/graphLayout";
import type {
  CanvasDocument,
  CanvasNode,
  CanvasProblemStatus,
} from "@/types";

function buildBreadcrumbIds(document: CanvasDocument, nodeId: string): string[] {
  const index = buildCanvasGraphIndex(document);
  const path: string[] = [];
  const seen = new Set<string>();
  let current: string | null = nodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    path.unshift(current);
    const parents = getBecauseParents(index, current);
    current = parents[0]?.id ?? null;
  }
  return path;
}

export function CanvasDetailPane({
  document,
  selectedNodeId,
  onClose,
  onSelectNode,
  onUpdateNode,
  onAddWhy,
  onAddSolution,
  onStartLinkBecause,
  onStartLinkSolution,
}: {
  document: CanvasDocument;
  selectedNodeId: string;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
  onUpdateNode: (
    nodeId: string,
    patch: Partial<
      Pick<CanvasNode, "title" | "description" | "status" | "impact" | "effort" | "confidence">
    >,
  ) => void;
  onAddWhy: (parentId: string) => void;
  onAddSolution: (parentId: string) => void;
  onStartLinkBecause: (nodeId: string) => void;
  onStartLinkSolution: (nodeId: string) => void;
}) {
  const { t } = useTranslation();
  const node = document.nodes.find((n) => n.id === selectedNodeId);
  const index = useMemo(() => buildCanvasGraphIndex(document), [document]);
  const depths = useMemo(() => computeProblemDepths(document), [document]);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");

  useEffect(() => {
    setDescriptionDraft(node?.description ?? "");
    setTitleDraft(node?.title ?? "");
  }, [node?.id, node?.description, node?.title]);

  const commitDescription = useCallback(() => {
    if (!node) return;
    if ((node.description ?? "") === descriptionDraft) return;
    onUpdateNode(node.id, { description: descriptionDraft });
  }, [descriptionDraft, node, onUpdateNode]);

  const commitTitle = useCallback(() => {
    if (!node) return;
    if (node.title === titleDraft) return;
    onUpdateNode(node.id, { title: titleDraft });
  }, [node, onUpdateNode, titleDraft]);

  if (!node) return null;

  const breadcrumb = buildBreadcrumbIds(document, node.id);
  const depth = node.type === "problem" ? (depths.get(node.id) ?? 0) : undefined;
  const missingSolution = node.type === "problem" && problemNeedsSolution(index, node.id);

  const relatedList = (items: CanvasNode[], emptyKey: string) =>
    items.length === 0 ? (
      <p className="text-2xs text-text-muted">{t(emptyKey)}</p>
    ) : (
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-bg-hover ${
                item.id === selectedNodeId ? "bg-bg-hover text-accent-link" : "text-text-primary"
              }`}
              onClick={() => onSelectNode(item.id)}
            >
              {item.title || t("canvas.untitled")}
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-stone-300/70 bg-bg-primary">
      <div className="flex shrink-0 items-center justify-between border-b border-stone-200/80 px-3 py-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
          {t("canvas.detail.title")}
        </span>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary"
          onClick={onClose}
          aria-label={t("canvas.detail.close")}
          title={t("canvas.detail.close")}
        >
          <i className="fa-solid fa-xmark text-xs" aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-stone-100 px-2 py-0.5 text-2xs font-semibold uppercase text-text-muted">
            {node.type === "problem" ? t("canvas.nodeType.problem") : t("canvas.nodeType.solution")}
          </span>
          {depth !== undefined && (
            <span className="rounded-md bg-accent-link/10 px-2 py-0.5 text-2xs font-medium text-accent-link">
              {t("canvas.detail.depth", { depth })}
            </span>
          )}
          {missingSolution && (
            <span className="rounded-md bg-red-100 px-2 py-0.5 text-2xs font-medium text-red-700">
              {t("canvas.graph.missingSolution")}
            </span>
          )}
        </div>

        {breadcrumb.length > 1 && (
          <nav className="mb-3 text-2xs text-text-muted" aria-label={t("canvas.detail.breadcrumb")}>
            {breadcrumb.map((id, i) => {
              const n = document.nodes.find((x) => x.id === id);
              return (
                <span key={id}>
                  {i > 0 && <span className="mx-1">/</span>}
                  <button
                    type="button"
                    className="hover:text-accent-link"
                    onClick={() => onSelectNode(id)}
                  >
                    {n?.title || id}
                  </button>
                </span>
              );
            })}
          </nav>
        )}

        <label className="mb-3 block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-text-muted">
            {t("canvas.prompts.nodeTitle")}
          </span>
          <input
            type="text"
            className="w-full rounded-lg border border-stone-300/80 bg-bg-card px-2.5 py-1.5 text-sm text-text-primary"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-text-muted">
            {t("canvas.detail.description")}
          </span>
          <textarea
            rows={4}
            className="w-full resize-y rounded-lg border border-stone-300/80 bg-bg-card px-2.5 py-1.5 text-sm text-text-primary"
            placeholder={t("canvas.detail.descriptionPlaceholder")}
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
            onBlur={commitDescription}
          />
        </label>

        {node.type === "problem" && (
          <>
            <label className="mb-4 block">
              <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-text-muted">
                {t("canvas.detail.status")}
              </span>
              <select
                className="w-full rounded-lg border border-stone-300/80 bg-bg-card px-2.5 py-1.5 text-sm text-text-primary"
                value={node.status ?? "open"}
                onChange={(e) =>
                  onUpdateNode(node.id, { status: e.target.value as CanvasProblemStatus })
                }
              >
                <option value="open">{t("canvas.detail.statusOpen")}</option>
                <option value="needs_deeper_analysis">{t("canvas.detail.statusNeedsDeeper")}</option>
                <option value="root_cause_candidate">{t("canvas.detail.statusRootCause")}</option>
                <option value="covered">{t("canvas.detail.statusCovered")}</option>
              </select>
            </label>

            <section className="mb-4">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  {t("canvas.detail.parentProblems")}
                </h3>
              </div>
              {relatedList(getBecauseParents(index, node.id), "canvas.detail.none")}
            </section>

            <section className="mb-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  {t("canvas.detail.deeperCauses")}
                </h3>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="rounded-md px-2 py-0.5 text-2xs text-accent-link hover:bg-bg-hover"
                    onClick={() => onAddWhy(node.id)}
                  >
                    + {t("canvas.graph.addWhyShort")}
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-2 py-0.5 text-2xs text-text-muted hover:bg-bg-hover"
                    onClick={() => onStartLinkBecause(node.id)}
                    title={t("canvas.actions.drawBecause")}
                  >
                    <i className="fa-solid fa-link text-[10px]" aria-hidden />
                  </button>
                </div>
              </div>
              {relatedList(getBecauseChildren(index, node.id), "canvas.detail.none")}
            </section>

            <section className="mb-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  {t("canvas.detail.solutions")}
                </h3>
                <button
                  type="button"
                  className="rounded-md px-2 py-0.5 text-2xs text-amber-700 hover:bg-amber-50"
                  onClick={() => onAddSolution(node.id)}
                >
                  + {t("canvas.graph.addSolutionShort")}
                </button>
              </div>
              {relatedList(getSolutionChildren(index, node.id), "canvas.detail.none")}
            </section>
          </>
        )}

        {node.type === "solution" && (
          <section className="mb-4">
            <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-text-muted">
              {t("canvas.detail.targetProblem")}
            </h3>
            {relatedList(getSolutionParents(index, node.id), "canvas.detail.none")}
          </section>
        )}
      </div>
    </aside>
  );
}
