import { type Extension } from "@codemirror/state";
import { EditorView, keymap, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { SaveState } from "@/types";

import { NOTE_AUTOSAVE_DELAY_MS } from "@/shared/autosaveDelays";

const DEFAULT_AUTOSAVE_DELAY_MS = NOTE_AUTOSAVE_DELAY_MS;

export interface ManualSaveConfig {
  initialContent: string;
  onSave: (content: string) => Promise<void> | void;
  onStateChange: (state: SaveState) => void;
  debounceMs?: number;
}

export type EditorSaveConfig = Omit<ManualSaveConfig, "initialContent">;

export function createManualSavePlugin(config: ManualSaveConfig): Extension[] {
  const savePlugin = ViewPlugin.fromClass(
    class {
      private lastSavedContent: string;
      private saveTimer: ReturnType<typeof setTimeout> | null = null;
      private saveInFlight = false;
      private saveAfterCurrent = false;
      private destroyed = false;

      constructor(private readonly view: EditorView) {
        this.lastSavedContent = config.initialContent;
      }

      update(update: ViewUpdate) {
        if (!update.docChanged) return;
        config.onStateChange("unsaved");
        this.scheduleSave();
      }

      destroy() {
        this.destroyed = true;
        this.clearSaveTimer();
      }

      saveNow(): boolean {
        void this.save();
        return true;
      }

      private scheduleSave(delay = config.debounceMs ?? DEFAULT_AUTOSAVE_DELAY_MS) {
        this.clearSaveTimer();
        this.saveTimer = setTimeout(() => {
          this.saveTimer = null;
          void this.save();
        }, delay);
      }

      private clearSaveTimer() {
        if (!this.saveTimer) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }

      private async save() {
        this.clearSaveTimer();

        if (this.saveInFlight) {
          this.saveAfterCurrent = true;
          return;
        }

        const content = this.view.state.doc.toString();
        if (content === this.lastSavedContent) {
          config.onStateChange("saved");
          return;
        }

        this.saveInFlight = true;
        config.onStateChange("saving");

        let failed = false;
        try {
          await config.onSave(content);
          this.lastSavedContent = content;
        } catch {
          failed = true;
          if (!this.destroyed) {
            config.onStateChange("error");
          }
        } finally {
          this.saveInFlight = false;
        }

        if (failed || this.destroyed) return;

        const hasPendingSave = this.saveAfterCurrent;
        this.saveAfterCurrent = false;

        if (!hasPendingSave && this.view.state.doc.toString() === this.lastSavedContent) {
          config.onStateChange("saved");
        } else {
          config.onStateChange("unsaved");
          this.scheduleSave(0);
        }
      }
    },
  );

  return [
    savePlugin,
    keymap.of([
      {
        key: "Mod-s",
        run(view) {
          const plugin = view.plugin(savePlugin);
          return plugin?.saveNow() ?? false;
        },
      },
    ]),
  ];
}
