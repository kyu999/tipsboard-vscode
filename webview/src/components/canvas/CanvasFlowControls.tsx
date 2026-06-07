import { Panel, useReactFlow } from "@xyflow/react";
import { useTranslation } from "react-i18next";

function ControlButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-7 w-7 items-center justify-center border-b border-stone-200/80 text-text-muted last:border-b-0 hover:bg-bg-hover hover:text-text-primary"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <i className={`fa-solid ${icon} text-xs`} aria-hidden />
    </button>
  );
}

export function CanvasFlowControls() {
  const { t } = useTranslation();
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel position="bottom-left" className="!m-3 overflow-hidden rounded-lg border border-stone-300/80 bg-bg-card shadow-soft">
      <ControlButton icon="fa-plus" label={t("canvas.controls.zoomIn")} onClick={() => zoomIn()} />
      <ControlButton icon="fa-minus" label={t("canvas.controls.zoomOut")} onClick={() => zoomOut()} />
      <ControlButton
        icon="fa-compress-arrows-alt"
        label={t("canvas.controls.fitView")}
        onClick={() => void fitView({ padding: 0.2 })}
      />
      <ControlButton
        icon="fa-expand"
        label={t("canvas.controls.fullScreen")}
        onClick={() => void window.tipsboardDesktop.toggleFullScreen()}
      />
    </Panel>
  );
}
