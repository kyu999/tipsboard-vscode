import { describe, expect, it } from "vitest";
import {
  INBOX_PREFIX,
  isInboxNotePath,
  isInboxTopLevelFolder,
  listInboxDirCandidates,
} from "./inboxPath.js";

describe("inboxPath", () => {
  it("recognizes inbox paths", () => {
    expect(isInboxNotePath("inbox/new-idea.md")).toBe(true);
    expect(isInboxNotePath("Tipsboard inbox/note.md")).toBe(true);
    expect(isInboxNotePath("Tipsboard inbox 3/note.md")).toBe(true);
    expect(isInboxNotePath("docs/auth/oauth.md")).toBe(false);
  });

  it("lists inbox directory candidates with inbox first", () => {
    const candidates = listInboxDirCandidates();
    expect(candidates[0]).toBe(INBOX_PREFIX);
    expect(candidates).toContain("Tipsboard inbox");
    expect(candidates).toContain("Tipsboard inbox 2");
  });

  it("matches top-level inbox folder names only", () => {
    expect(isInboxTopLevelFolder("inbox")).toBe(true);
    expect(isInboxTopLevelFolder("docs")).toBe(false);
  });
});
