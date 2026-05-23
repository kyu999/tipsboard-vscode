import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_TOO_LARGE_ERROR,
  createNote,
  deleteNote,
  extractTitle,
  importAttachmentBuffers,
  importImageBuffers,
  readVault,
  readVaultAttachmentSummaries,
  saveNote,
  setNotePinned,
} from "./vault.js";

const TEN_MB = 10 * 1024 * 1024;

async function withVault(run: (vaultPath: string) => Promise<void>): Promise<void> {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "tipsboard-vs-vault-"));
  try {
    await run(vaultPath);
  } finally {
    await fs.rm(vaultPath, { recursive: true, force: true });
  }
}

describe("vault (VS Code host)", () => {
  it("creates and reads notes from the Unsorted directory", async () => {
    await withVault(async (vaultPath) => {
      const note = await createNote(vaultPath, "Alpha");
      const snapshot = await readVault(vaultPath);

      expect(note.path).toBe("Unsorted/Alpha.md");
      await expect(fs.readFile(path.join(vaultPath, "Unsorted", "Alpha.md"), "utf8")).resolves.toBe("Alpha\n");
      expect(snapshot.notes.map((note) => note.path)).toEqual(["Unsorted/Alpha.md"]);
      expect(snapshot.notes[0]?.filename).toBe("Alpha.md");
    });
  });

  it("renames saved notes within their current directory", async () => {
    await withVault(async (vaultPath) => {
      const note = await createNote(vaultPath, "Alpha");

      const saved = await saveNote(vaultPath, note.path, "Beta\nBody");

      expect(saved.path).toBe("Unsorted/Beta.md");
      expect(saved.filename).toBe("Beta.md");
      await expect(fs.readFile(path.join(vaultPath, "Unsorted", "Beta.md"), "utf8")).resolves.toBe("Beta\nBody");
      await expect(fs.access(path.join(vaultPath, "Unsorted", "Alpha.md"))).rejects.toThrow();
    });
  });

  it("recursively reads workspace markdown while excluding ignored directories", async () => {
    await withVault(async (vaultPath) => {
      await fs.mkdir(path.join(vaultPath, "docs", "auth"), { recursive: true });
      await fs.mkdir(path.join(vaultPath, ".tipsboard"), { recursive: true });
      await fs.writeFile(path.join(vaultPath, "docs", "auth", "oauth.md"), "OAuth\nBody", "utf8");
      await fs.writeFile(path.join(vaultPath, ".tipsboard", "hidden.md"), "Hidden\n", "utf8");

      const snapshot = await readVault(vaultPath);

      expect(snapshot.notes.map((note) => note.path)).toEqual(["docs/auth/oauth.md"]);
      expect(snapshot.notes[0]?.title).toBe("OAuth");
    });
  });

  it("imports image buffers with uuid filenames", async () => {
    await withVault(async (vaultPath) => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const [a] = await importImageBuffers(vaultPath, [{ name: "animal_chara.png", data: pngBytes }], TEN_MB);
      const uuidFileRe =
        /^assets\/images\/img_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/;

      expect(a?.relativePath).toMatch(uuidFileRe);
      expect(a?.markdown).toBe(`![animal chara](${a.relativePath})`);
      await expect(fs.readFile(path.join(vaultPath, a!.relativePath))).resolves.toEqual(Buffer.from(pngBytes));
    });
  });

  it("imports non-image buffers to assets/files with markdown links", async () => {
    await withVault(async (vaultPath) => {
      const pdfBytes = new TextEncoder().encode("%PDF-1.4 example");
      const [row] = await importAttachmentBuffers(vaultPath, [{ name: "PDF_example.pdf", data: pdfBytes }], TEN_MB);
      const readableFileRe = /^assets\/files\/PDF_example_[0-9a-f]{8}\.pdf$/;
      expect(row?.relativePath).toMatch(readableFileRe);
      expect(row?.markdown).toBe(`[PDF example](${row?.relativePath})`);
      await expect(fs.readFile(path.join(vaultPath, row!.relativePath))).resolves.toEqual(Buffer.from(pdfBytes));
    });
  });

  it("reuses an existing assets/files entry for duplicate non-image content", async () => {
    await withVault(async (vaultPath) => {
      const pdfBytes = new TextEncoder().encode("%PDF-1.4 example");
      const [first] = await importAttachmentBuffers(vaultPath, [{ name: "PDF_example.pdf", data: pdfBytes }], TEN_MB);
      const [second] = await importAttachmentBuffers(vaultPath, [{ name: "PDF_example.pdf", data: pdfBytes }], TEN_MB);
      const files = await fs.readdir(path.join(vaultPath, "assets", "files"));

      expect(second?.relativePath).toBe(first?.relativePath);
      expect(second?.markdown).toBe(`[PDF example](${first?.relativePath})`);
      expect(files).toHaveLength(1);
    });
  });

  it("indexes file attachments with linked notes and unreferenced files", async () => {
    await withVault(async (vaultPath) => {
      await createNote(vaultPath, "Doc");
      const [linked] = await importAttachmentBuffers(
        vaultPath,
        [{ name: "Spec.pdf", data: new TextEncoder().encode("linked") }],
        TEN_MB,
      );
      const [orphan] = await importAttachmentBuffers(
        vaultPath,
        [{ name: "Loose.txt", data: new TextEncoder().encode("orphan") }],
        TEN_MB,
      );

      await saveNote(vaultPath, "Unsorted/Doc.md", `Doc\n[Specification](${linked!.relativePath})\n`);

      const snapshot = await readVault(vaultPath);
      const linkedSummary = snapshot.attachments.find((attachment) => attachment.relativePath === linked!.relativePath);
      const orphanSummary = snapshot.attachments.find((attachment) => attachment.relativePath === orphan!.relativePath);

      expect(snapshot.attachments).toHaveLength(2);
      expect(linkedSummary?.referenced).toBe(true);
      expect(linkedSummary?.references).toEqual([
        {
          notePath: "Unsorted/Doc.md",
          noteTitle: "Doc",
          noteFilename: "Doc.md",
          label: "Specification",
        },
      ]);
      expect(orphanSummary?.referenced).toBe(false);
      expect(orphanSummary?.references).toEqual([]);
    });
  });

  it("skips blocked attachment extensions", async () => {
    await withVault(async (vaultPath) => {
      const out = await importAttachmentBuffers(vaultPath, [{ name: "x.exe", data: new Uint8Array([7]) }], TEN_MB);
      expect(out).toEqual([]);
    });
  });

  it("rejects attachments larger than maxBytes", async () => {
    await withVault(async (vaultPath) => {
      await expect(
        importAttachmentBuffers(vaultPath, [{ name: "big.bin", data: new Uint8Array(10) }], 9),
      ).rejects.toThrow(ATTACHMENT_TOO_LARGE_ERROR);
    });
  });

  it("requires safe markdown paths for deleteNote", async () => {
    await withVault(async (vaultPath) => {
      const note = await createNote(vaultPath, "Alpha");
      await expect(deleteNote(vaultPath, "Alpha.txt")).rejects.toThrow("Markdown files");
      await deleteNote(vaultPath, note.path);
      await expect(fs.access(path.join(vaultPath, "Unsorted", "Alpha.md"))).rejects.toThrow();
    });
  });

  it("assigns numbered filenames when titles collide", async () => {
    await withVault(async (vaultPath) => {
      const first = await createNote(vaultPath, "Dup");
      const second = await createNote(vaultPath, "Dup");
      expect(first.path).toBe("Unsorted/Dup.md");
      expect(second.path).toBe("Unsorted/Dup (2).md");
    });
  });

  it("orders pinned notes ahead of newer notes on readVault", async () => {
    await withVault(async (vaultPath) => {
      await createNote(vaultPath, "Older");
      await createNote(vaultPath, "Newer");
      const before = await readVault(vaultPath);
      expect(before.notes[0]?.title).toBe("Newer");

      await setNotePinned(vaultPath, "Unsorted/Older.md", true);
      const after = await readVault(vaultPath);
      expect(after.notes[0]?.title).toBe("Older");
      expect(after.pins).toEqual(["Unsorted/Older.md"]);

      await setNotePinned(vaultPath, "Unsorted/Older.md", false);
      const cleared = await readVault(vaultPath);
      expect(cleared.notes[0]?.title).toBe("Newer");
      expect(cleared.pins).toEqual([]);
    });
  });

  it("readVaultAttachmentSummaries matches readVault.attachments", async () => {
    await withVault(async (vaultPath) => {
      await createNote(vaultPath, "Doc");
      const pdf = new TextEncoder().encode("%PDF-1.4 x");
      await importAttachmentBuffers(vaultPath, [{ name: "a.pdf", data: pdf }], TEN_MB);
      const full = await readVault(vaultPath);
      const onlyAttach = await readVaultAttachmentSummaries(vaultPath);
      expect(onlyAttach).toEqual(full.attachments);
    });
  });
});

describe("vault title helpers", () => {
  it("extractTitle matches first line", () => {
    expect(extractTitle("Hello\n")).toBe("Hello");
  });
});
