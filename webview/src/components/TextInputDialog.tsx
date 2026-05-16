import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface TextInputDialogProps {
  title: string;
  label: string;
  confirmLabel: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
  initialValue?: string;
}

export function TextInputDialog({
  title,
  label,
  confirmLabel,
  onCancel,
  onSubmit,
  initialValue = "",
}: TextInputDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const trimmed = value.trim();

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-accent-link/20 bg-bg-card shadow-soft"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onSubmit(trimmed);
        }}
      >
        <div className="border-b border-accent-link/15 bg-bg-elevated px-5 py-3">
          <p className="text-sm font-semibold text-text-primary">{title}</p>
        </div>
        <div className="space-y-4 px-5 py-5">
          <label className="block text-xs font-semibold text-text-primary">
            {label}
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-2 w-full rounded-xl border border-accent-link/15 bg-bg-elevated px-3 py-2 text-sm font-normal text-text-primary outline-none transition-colors focus:border-accent-link/40"
              autoFocus
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="tb-btn-secondary px-3 py-1.5 text-xs" onClick={onCancel}>
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="tb-btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!trimmed}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
