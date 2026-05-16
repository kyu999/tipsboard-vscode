import { useTranslation } from "react-i18next";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
  busy?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
  destructive = false,
  busy = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-accent-link/20 bg-bg-card shadow-soft">
        <div className="border-b border-accent-link/15 bg-bg-secondary px-5 py-3">
          <p className="text-sm font-semibold text-text-primary">{title}</p>
        </div>
        <div className="space-y-5 px-5 py-5">
          <p className="text-sm leading-6 text-text-primary">{message}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="tb-btn-secondary px-3 py-1.5 text-xs" onClick={onCancel} disabled={busy}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className={`${destructive ? "tb-btn-save" : "tb-btn-primary"} px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={onConfirm}
              disabled={busy}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
