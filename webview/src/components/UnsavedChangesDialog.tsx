import { useTranslation } from "react-i18next";
import { Icon } from "@/components/Icon";

export type UnsavedChangesChoice = "save" | "discard" | "cancel";

interface UnsavedChangesDialogProps {
  /** A save started before the dialog opened is still running. */
  saveInProgress: boolean;
  /** The dialog's own "save and leave" is running; all actions are locked until it settles. */
  busy: boolean;
  onChoose: (choice: UnsavedChangesChoice) => void;
}

export function UnsavedChangesDialog({ saveInProgress, busy, onChoose }: UnsavedChangesDialogProps) {
  const { t } = useTranslation();
  const message = busy
    ? t("page.editor.unsavedSavingBeforeLeave")
    : saveInProgress
      ? t("page.editor.unsavedSaveInProgress")
      : t("page.editor.unsavedMessage");

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="tb-unsaved-dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onChoose("cancel");
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onChoose("cancel");
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-accent-link/20 bg-bg-card shadow-soft">
        <div className="border-b border-accent-link/15 bg-bg-elevated px-5 py-3">
          <p id="tb-unsaved-dialog-title" className="text-sm font-semibold text-text-primary">
            {t("page.editor.unsavedTitle")}
          </p>
        </div>
        <div className="space-y-5 px-5 py-5">
          <p className="text-sm leading-6 text-text-primary">{message}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="tb-btn-secondary px-3 py-1.5 text-xs"
              onClick={() => onChoose("cancel")}
              disabled={busy}
            >
              {t("common.cancel")}
            </button>
            {!saveInProgress && (
              <button
                type="button"
                className="tb-btn-secondary px-3 py-1.5 text-xs text-accent-error disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => onChoose("discard")}
                disabled={busy}
              >
                {t("page.editor.unsavedDiscardAndLeave")}
              </button>
            )}
            <button
              type="button"
              autoFocus
              className="tb-btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => onChoose("save")}
              disabled={busy}
            >
              {busy && <Icon name="spinner" className="animate-spin" />}
              {saveInProgress ? t("page.editor.unsavedWaitAndLeave") : t("page.editor.unsavedSaveAndLeave")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
