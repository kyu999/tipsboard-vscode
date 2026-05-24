export const INBOX_PREFIX = "inbox";
export const TIPSBOARD_INBOX_PREFIX = "Tipsboard inbox";

const TIPSBOARD_INBOX_RE = /^Tipsboard inbox(?: \d+)?$/;

export function normalizeNotePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function inboxTopLevelFolderName(relativePath: string): string {
  return normalizeNotePath(relativePath).split("/")[0] ?? "";
}

export function isInboxTopLevelFolder(name: string): boolean {
  return name === INBOX_PREFIX || TIPSBOARD_INBOX_RE.test(name);
}

export function isInboxNotePath(relativePath: string): boolean {
  return isInboxTopLevelFolder(inboxTopLevelFolderName(relativePath));
}

export function listInboxDirCandidates(): string[] {
  const candidates = [INBOX_PREFIX, TIPSBOARD_INBOX_PREFIX];
  for (let i = 2; i < 9999; i += 1) {
    candidates.push(`${TIPSBOARD_INBOX_PREFIX} ${i}`);
  }
  return candidates;
}
