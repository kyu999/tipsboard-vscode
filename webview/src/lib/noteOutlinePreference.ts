const STORAGE_KEY = "tipsboard.noteOutlineOpen";

export function readNoteOutlineOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeNoteOutlineOpen(open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? "true" : "false");
  } catch {
    // ignore quota / private mode
  }
}
