import type { SaveState } from "@/types";

/** Title (Markdown first line) and the rest of the note, edited separately in the UI. */
export interface NoteDraft {
  title: string;
  body: string;
}

/** Splits saved Markdown into the title line and the editor body (everything after the first newline). */
export function splitNoteMarkdown(markdown: string): NoteDraft {
  const newline = markdown.indexOf("\n");
  if (newline < 0) return { title: markdown.trim(), body: "" };
  return { title: markdown.slice(0, newline).trim(), body: markdown.slice(newline + 1) };
}

/** Inverse of `splitNoteMarkdown`; the title always occupies the first line. */
export function composeNoteMarkdown(draft: NoteDraft): string {
  return `${draft.title}\n${draft.body}`;
}

function sameDraft(a: NoteDraft, b: NoteDraft): boolean {
  return a.title === b.title && a.body === b.body;
}

export interface NoteSaveSessionOptions {
  path: string;
  savedMarkdown: string;
  /** Persists Markdown and resolves with the (possibly renamed) note path. Never times out on its own. */
  persist: (path: string, markdown: string) => Promise<string>;
  onChange: () => void;
}

/**
 * Explicit-save state machine for one open note.
 *
 * - Nothing is written until `save()` / `saveBeforeLeave()` is called.
 * - Edits made while a save is in flight stay unsaved; they are not chained into the running save.
 * - A failed save keeps the draft so the same content can be retried.
 */
export class NoteSaveSession {
  private currentPath: string;
  private saved: NoteDraft;
  private current: NoteDraft;
  private inFlight: Promise<boolean> | null = null;
  private lastSaveFailed = false;
  private hasSavedOnce = false;
  private disposed = false;

  constructor(private readonly options: NoteSaveSessionOptions) {
    this.currentPath = options.path;
    this.saved = splitNoteMarkdown(options.savedMarkdown);
    this.current = { ...this.saved };
  }

  get path(): string {
    return this.currentPath;
  }

  get draft(): NoteDraft {
    return this.current;
  }

  get savedDraft(): NoteDraft {
    return this.saved;
  }

  get dirty(): boolean {
    return !sameDraft(this.current, this.saved);
  }

  get saving(): boolean {
    return this.inFlight !== null;
  }

  get state(): SaveState {
    if (this.inFlight) return "saving";
    if (this.dirty) return this.lastSaveFailed ? "error" : "unsaved";
    return this.hasSavedOnce ? "saved" : "idle";
  }

  /** True while leaving would lose edits or interrupt a running save. */
  get needsLeaveConfirmation(): boolean {
    return this.dirty || this.saving;
  }

  setTitle(title: string): void {
    if (title === this.current.title) return;
    this.current = { ...this.current, title };
    this.notify();
  }

  setBody(body: string): void {
    if (body === this.current.body) return;
    this.current = { ...this.current, body };
    this.notify();
  }

  /** Explicit save (button / Mod+S). Ignored while a save is already running. */
  async save(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    if (!this.dirty) {
      this.lastSaveFailed = false;
      this.notify();
      return true;
    }
    return this.startSave();
  }

  /** "Save and leave": waits for a running save, then saves anything typed meanwhile. */
  async saveBeforeLeave(): Promise<boolean> {
    if (this.inFlight && !(await this.inFlight)) return false;
    return this.dirty ? this.startSave() : true;
  }

  /** Drops the draft and returns to the last saved title and body. */
  discard(): NoteDraft {
    this.current = { ...this.saved };
    this.lastSaveFailed = false;
    this.notify();
    return this.current;
  }

  dispose(): void {
    this.disposed = true;
  }

  private startSave(): Promise<boolean> {
    const run = this.persistDraft({ ...this.current }).finally(() => {
      this.inFlight = null;
      this.notify();
    });
    this.inFlight = run;
    this.notify();
    return run;
  }

  private async persistDraft(snapshot: NoteDraft): Promise<boolean> {
    try {
      this.currentPath = await this.options.persist(this.currentPath, composeNoteMarkdown(snapshot));
      this.saved = snapshot;
      this.lastSaveFailed = false;
      this.hasSavedOnce = true;
      return true;
    } catch {
      this.lastSaveFailed = true;
      return false;
    }
  }

  private notify(): void {
    if (!this.disposed) this.options.onChange();
  }
}
