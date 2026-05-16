import { useTranslation } from "react-i18next";
import type { SaveState } from "@/types";

interface SaveStatusProps {
  state: SaveState;
}

const classes: Record<SaveState, string> = {
  idle: "text-text-muted",
  unsaved: "text-text-muted",
  saving: "text-text-secondary animate-pulse",
  saved: "text-accent-save",
  error: "text-accent-error",
};

export function SaveStatus({ state }: SaveStatusProps) {
  const { t } = useTranslation();
  if (state === "idle") return null;
  const label = t(`saveStatus.${state}`);
  return <span className={`text-xs ${classes[state]}`}>{label}</span>;
}
