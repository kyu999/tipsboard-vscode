import { describe, expect, it, vi } from "vitest";
import { composeNoteMarkdown, NoteSaveSession, splitNoteMarkdown } from "./noteSaveSession";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Persist = (path: string, markdown: string) => Promise<string>;

function createSession(savedMarkdown = "Title\nbody\n", persist = vi.fn<Persist>(async (path) => path)) {
  const onChange = vi.fn();
  const session = new NoteSaveSession({ path: "inbox/Title.md", savedMarkdown, persist, onChange });
  return { session, persist, onChange };
}

describe("splitNoteMarkdown / composeNoteMarkdown", () => {
  it("separates the first line as the title", () => {
    expect(splitNoteMarkdown("Title\nline 1\nline 2")).toEqual({ title: "Title", body: "line 1\nline 2" });
  });

  it("handles a title-only note with and without a trailing newline", () => {
    expect(splitNoteMarkdown("Title\n")).toEqual({ title: "Title", body: "" });
    expect(splitNoteMarkdown("Title")).toEqual({ title: "Title", body: "" });
  });

  it("round-trips the title line and body", () => {
    const markdown = "Title\n\n## Heading\ntext\n";
    expect(composeNoteMarkdown(splitNoteMarkdown(markdown))).toBe(markdown);
  });
});

describe("NoteSaveSession", () => {
  it("never persists on edits alone", () => {
    const { session, persist } = createSession();
    session.setBody("changed\n");
    session.setTitle("New title");
    expect(persist).not.toHaveBeenCalled();
    expect(session.state).toBe("unsaved");
    expect(session.dirty).toBe(true);
  });

  it("writes the title back to the first Markdown line on save", async () => {
    const { session, persist } = createSession();
    session.setTitle("Renamed");
    await expect(session.save()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledWith("inbox/Title.md", "Renamed\nbody\n");
    expect(session.state).toBe("saved");
    expect(session.dirty).toBe(false);
  });

  it("follows the renamed path returned by the host", async () => {
    const persist = vi.fn(async () => "inbox/Renamed.md");
    const { session } = createSession("Title\nbody\n", persist);
    session.setTitle("Renamed");
    await session.save();
    session.setBody("more\n");
    await session.save();
    expect(persist).toHaveBeenLastCalledWith("inbox/Renamed.md", "Renamed\nmore\n");
    expect(session.path).toBe("inbox/Renamed.md");
  });

  it("is clean again when edits are reverted by hand", () => {
    const { session } = createSession();
    session.setBody("changed\n");
    session.setBody("body\n");
    expect(session.dirty).toBe(false);
    expect(session.state).toBe("idle");
  });

  it("keeps edits typed during a slow save as unsaved", async () => {
    const pending = deferred<string>();
    const { session, persist } = createSession("Title\nbody\n", vi.fn(() => pending.promise));
    session.setBody("first\n");
    const saving = session.save();
    expect(session.state).toBe("saving");

    session.setBody("second\n");
    pending.resolve("inbox/Title.md");
    await saving;

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith("inbox/Title.md", "Title\nfirst\n");
    expect(session.state).toBe("unsaved");
  });

  it("ignores another explicit save while one is running", async () => {
    const pending = deferred<string>();
    const { session, persist } = createSession("Title\nbody\n", vi.fn(() => pending.promise));
    session.setBody("first\n");
    const first = session.save();
    session.setBody("second\n");
    const second = session.save();
    pending.resolve("inbox/Title.md");
    await Promise.all([first, second]);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft after a failure and retries the same content", async () => {
    const persist = vi
      .fn<Persist>()
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockResolvedValueOnce("inbox/Title.md");
    const { session } = createSession("Title\nbody\n", persist);
    session.setBody("draft\n");

    await expect(session.save()).resolves.toBe(false);
    expect(session.state).toBe("error");
    expect(session.draft).toEqual({ title: "Title", body: "draft\n" });

    await expect(session.save()).resolves.toBe(true);
    expect(persist).toHaveBeenNthCalledWith(2, "inbox/Title.md", "Title\ndraft\n");
    expect(session.state).toBe("saved");
  });

  it("saveBeforeLeave waits for the running save and then saves later edits", async () => {
    const pending = deferred<string>();
    const persist = vi
      .fn<Persist>()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce("inbox/Title.md");
    const { session } = createSession("Title\nbody\n", persist);
    session.setBody("first\n");
    void session.save();
    session.setBody("second\n");

    const leaving = session.saveBeforeLeave();
    pending.resolve("inbox/Title.md");

    await expect(leaving).resolves.toBe(true);
    expect(persist).toHaveBeenLastCalledWith("inbox/Title.md", "Title\nsecond\n");
    expect(session.needsLeaveConfirmation).toBe(false);
  });

  it("saveBeforeLeave reports failure so navigation can be cancelled", async () => {
    const persist = vi.fn(async () => {
      throw new Error("offline");
    });
    const { session } = createSession("Title\nbody\n", persist);
    session.setBody("draft\n");
    await expect(session.saveBeforeLeave()).resolves.toBe(false);
    expect(session.needsLeaveConfirmation).toBe(true);
  });

  it("discard restores the last saved title and body", async () => {
    const { session } = createSession();
    session.setTitle("Saved title");
    await session.save();
    session.setTitle("Draft title");
    session.setBody("draft\n");

    expect(session.discard()).toEqual({ title: "Saved title", body: "body\n" });
    expect(session.dirty).toBe(false);
  });

  it("stops notifying after dispose", async () => {
    const { session, onChange } = createSession();
    session.dispose();
    session.setBody("changed\n");
    expect(onChange).not.toHaveBeenCalled();
  });
});
