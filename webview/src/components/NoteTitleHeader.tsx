import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/Icon";

interface NoteTitleHeaderProps {
  title: string;
  /** Commits the edited title to the draft. Saving stays explicit. */
  onCommit: (title: string) => void;
  /** Called after Enter so typing can continue in the body editor. */
  onSubmit?: () => void;
}

/** Page title shown apart from the body; becomes an input only after an explicit click. */
export function NoteTitleHeader({ title, onCommit, onSubmit }: NoteTitleHeaderProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Blur can fire while the input unmounts after Enter/Escape; only the first finish counts. */
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!editing) setValue(title);
  }, [editing, title]);

  useEffect(() => {
    if (!editing) return;
    finishedRef.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const next = value.trim();
    if (next && next !== title) onCommit(next);
    setEditing(false);
  };

  const cancel = () => {
    finishedRef.current = true;
    setValue(title);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        aria-label={t("page.editor.titleInputLabel")}
        className="mb-3 w-full rounded-lg border border-accent-link/30 bg-bg-elevated px-2 py-1 text-2xl font-semibold leading-tight text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            onSubmit?.();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            commit();
          }
        }}
      />
    );
  }

  return (
    <h1 className="mb-3 min-w-0">
      <button
        type="button"
        title={t("page.editor.titleEditHint")}
        className="group inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-2xl font-semibold leading-tight text-text-primary transition-colors hover:bg-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-link/25"
        onClick={() => setEditing(true)}
      >
        <span className="min-w-0 break-words">{title || t("common.untitled")}</span>
        <Icon
          name="edit"
          className="text-sm text-text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </button>
    </h1>
  );
}
