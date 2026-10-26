import { useTranslation } from "react-i18next";
import type { CanvasEdge } from "@/types";
import { Icon } from "@/components/Icon";

export function CanvasEdgeToolbar({
  x,
  y,
  edgeType,
  onReassignTarget,
  onReassignSource,
  onDelete,
}: {
  x: number;
  y: number;
  edgeType: CanvasEdge["type"];
  onReassignTarget: () => void;
  onReassignSource: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="absolute z-40 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-xl border border-stone-300/90 bg-bg-card px-2.5 py-1.5 shadow-lg"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className={`shrink-0 rounded-md px-2 py-0.5 text-2xs font-semibold ${
          edgeType === "because" ? "bg-accent-link/10 text-accent-link" : "bg-amber-100 text-amber-800"
        }`}
      >
        {edgeType === "because" ? t("canvas.graph.addWhyShort") : t("canvas.graph.addSolutionShort")}
      </span>
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs font-medium text-text-primary hover:bg-bg-hover"
        onClick={(e) => {
          e.stopPropagation();
          onReassignSource();
        }}
      >
        <Icon name="arrow-up" className="text-[10px]" />
        {t("canvas.actions.reassignSource")}
      </button>
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs font-medium text-text-primary hover:bg-bg-hover"
        onClick={(e) => {
          e.stopPropagation();
          onReassignTarget();
        }}
      >
        <Icon name="arrow-down" className="text-[10px]" />
        {t("canvas.actions.reassignEdge")}
      </button>
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs font-medium text-accent-error hover:bg-red-50"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Icon name="trash" className="text-[10px]" />
        {t("canvas.actions.deleteEdge")}
      </button>
    </div>
  );
}
