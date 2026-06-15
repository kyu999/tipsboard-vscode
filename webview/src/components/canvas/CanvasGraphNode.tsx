import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CanvasNode } from "@/types";

export function CanvasGraphNode({
  node,
  depth,
  selected,
  hovered = false,
  missingSolution,
  canLinkSolution,
  editing,
  linkSource,
  linkTarget,
  showInlineActions = true,
  left,
  top,
  width,
  height,
  onSelect,
  onStartEdit,
  onTitleChange,
  onEndEdit,
  onStartLinkBecause,
  onStartLinkSolution,
  onAddWhy,
  onAddSolution,
  onDelete,
}: {
  node: CanvasNode;
  depth?: number;
  selected: boolean;
  hovered?: boolean;
  missingSolution: boolean;
  canLinkSolution: boolean;
  editing: boolean;
  linkSource: boolean;
  linkTarget: boolean;
  showInlineActions?: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  onSelect: () => void;
  onStartEdit: () => void;
  onTitleChange: (title: string) => void;
  onEndEdit: () => void;
  onStartLinkBecause: () => void;
  onStartLinkSolution: () => void;
  onAddWhy: () => void;
  onAddSolution: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const endingEditRef = useRef(false);
  const [draft, setDraft] = useState(node.title);
  const isProblem = node.type === "problem";

  useEffect(() => {
    if (!editing) return;
    setDraft(node.title);
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing, node.id]);

  const finishEditing = useCallback(() => {
    if (!editing || endingEditRef.current) return;
    endingEditRef.current = true;
    onTitleChange(draft);
    onEndEdit();
    requestAnimationFrame(() => {
      endingEditRef.current = false;
    });
  }, [draft, editing, onEndEdit, onTitleChange]);

  return (
    <div
      className="absolute"
      style={{ left, top, width, minHeight: height }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {showInlineActions && (
        <div className="absolute left-0 right-0 top-[calc(100%+14px)] z-30 flex items-center justify-center gap-1">
          {isProblem && (
            <>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-accent-link/25 bg-bg-card px-2 text-2xs text-accent-link shadow-sm hover:bg-bg-hover"
                title={t("canvas.graph.addWhy")}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddWhy();
                }}
              >
                <i className="fa-solid fa-plus text-[9px]" aria-hidden />
                {t("canvas.graph.addWhyShort")}
              </button>
              {canLinkSolution && (
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-400/40 bg-amber-50 px-2 text-2xs text-amber-800 shadow-sm hover:bg-amber-100"
                  title={t("canvas.graph.addSolution")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddSolution();
                  }}
                >
                  <i className="fa-solid fa-plus text-[9px]" aria-hidden />
                  {t("canvas.graph.addSolutionShort")}
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-stone-300/80 bg-bg-card text-accent-error shadow-sm hover:bg-bg-hover"
            title={t("canvas.actions.deleteNode")}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <i className="fa-solid fa-trash-can text-[10px]" aria-hidden />
          </button>
        </div>
      )}

      <div
        role="button"
        tabIndex={editing ? -1 : 0}
        title={missingSolution ? t("canvas.graph.missingSolution") : undefined}
        className={`relative z-10 box-border min-h-full w-full rounded-xl border-2 px-3 py-2 text-left shadow-sm transition-shadow ${
          editing ? "z-20" : ""
        } ${
          isProblem
            ? missingSolution
              ? "border-red-400/60 bg-red-50/95 hover:shadow-md"
              : "border-accent-link/30 bg-bg-card hover:shadow-md"
            : "border-amber-400/50 bg-amber-50/90 hover:shadow-md"
        } ${
          selected
            ? missingSolution
              ? "ring-2 ring-red-400/50"
              : "ring-2 ring-accent-link/40"
            : hovered
              ? "shadow-md"
              : linkSource
              ? "ring-2 ring-accent-link"
              : linkTarget
                ? "ring-2 ring-emerald-500"
                : ""
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onStartEdit();
        }}
      >
        <span
          className={`flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide ${
            missingSolution ? "text-red-600" : "text-text-muted"
          }`}
        >
          <span>{isProblem ? t("canvas.nodeType.problem") : t("canvas.nodeType.solution")}</span>
          {depth !== undefined && (
            <span className="rounded bg-stone-100 px-1 py-0.5 text-[9px] font-medium normal-case text-text-muted">
              D{depth}
            </span>
          )}
          {node.type === "problem" && node.status === "root_cause_candidate" && (
            <span className="rounded bg-accent-link/15 px-1 py-0.5 text-[9px] font-medium normal-case text-accent-link">
              RC
            </span>
          )}
        </span>
        {editing ? (
          <textarea
            ref={inputRef}
            value={draft}
            rows={Math.max(2, draft.split("\n").length)}
            onChange={(e) => setDraft(e.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              setDraft(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                if (composingRef.current || e.nativeEvent.isComposing) return;
                e.preventDefault();
                finishEditing();
              }
              e.stopPropagation();
            }}
            onBlur={() => {
              finishEditing();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 w-full resize-none break-words border-0 bg-transparent p-0 text-sm font-medium leading-snug text-text-primary outline-none ring-0"
            placeholder={t("canvas.untitled")}
          />
        ) : (
          <p className="m-0 mt-1 break-words text-sm font-medium leading-snug text-text-primary">
            {node.title || t("canvas.untitled")}
          </p>
        )}
      </div>

      {isProblem && showInlineActions && (
        <>
          <button
            type="button"
            className="absolute -bottom-3 left-1/2 z-30 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-bg-card bg-accent-link text-[10px] font-bold text-white shadow-md hover:scale-110"
            title={t("canvas.actions.drawBecause")}
            onClick={(e) => {
              e.stopPropagation();
              onStartLinkBecause();
            }}
          >
            ?
          </button>
          {canLinkSolution && (
            <button
              type="button"
              className="absolute -right-3 top-1/2 z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 border-bg-card bg-amber-500 text-[9px] text-white shadow-md hover:scale-110"
              title={t("canvas.actions.drawSolution")}
              onClick={(e) => {
                e.stopPropagation();
                onStartLinkSolution();
              }}
            >
              <i className="fa-solid fa-lightbulb" aria-hidden />
            </button>
          )}
        </>
      )}
    </div>
  );
}
