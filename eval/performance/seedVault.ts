import { promises as fs } from "node:fs";
import path from "node:path";

import { readVault, readVaultAttachmentSummaries, saveNote } from "../../src/host/vault.js";
import { perfNoteBody, perfNotePath } from "./fixtures.js";
import { createProgressReporter, logPerfEvalProgress } from "./progress.js";

export interface SeededPerfVault {
  vaultPath: string;
  noteCount: number;
  targetPath: string;
  cleanup(): Promise<void>;
}

export function perfVaultPath(cacheDir: string, noteCount: number): string {
  return path.join(cacheDir, "vaults", `perf-${noteCount}`);
}

export async function seedPerfVault(options: {
  cacheDir: string;
  noteCount: number;
  refresh?: boolean;
}): Promise<SeededPerfVault> {
  const vaultPath = perfVaultPath(options.cacheDir, options.noteCount);
  if (options.refresh) {
    await fs.rm(vaultPath, { recursive: true, force: true });
  }

  const marker = path.join(vaultPath, ".tipsboard", "perf-seed.json");
  const existing = await fs.readFile(marker, "utf8").catch(() => null);
  if (existing) {
    const parsed = JSON.parse(existing) as { noteCount: number; targetPath: string };
    if (parsed.noteCount === options.noteCount) {
      return {
        vaultPath,
        noteCount: options.noteCount,
        targetPath: parsed.targetPath,
        async cleanup() {
          await fs.rm(vaultPath, { recursive: true, force: true });
        },
      };
    }
  }

  await fs.rm(vaultPath, { recursive: true, force: true });
  await fs.mkdir(path.join(vaultPath, "pages"), { recursive: true });

  logPerfEvalProgress(`Seeding perf vault (${options.noteCount} notes): ${vaultPath}`);
  const progress = createProgressReporter({
    label: "seed perf notes",
    total: options.noteCount,
    minIntervalMs: 500,
  });

  for (let i = 0; i < options.noteCount; i += 1) {
    const relativePath = perfNotePath(i);
    const abs = path.join(vaultPath, relativePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const body = perfNoteBody({
      index: i,
      linkTargetIndex: i > 0 ? i - 1 : undefined,
      includeAttachmentLink: i % 50 === 0,
    });
    await fs.writeFile(abs, body, "utf8");
    progress.update(i + 1);
  }
  progress.done("done");

  const targetPath = perfNotePath(0);
  await saveNote(vaultPath, targetPath, perfNoteBody({ index: 0, linkTargetIndex: 1 }));

  await fs.mkdir(path.join(vaultPath, ".tipsboard"), { recursive: true });
  await fs.writeFile(marker, JSON.stringify({ noteCount: options.noteCount, targetPath }, null, 2), "utf8");

  return {
    vaultPath,
    noteCount: options.noteCount,
    targetPath,
    async cleanup() {
      await fs.rm(vaultPath, { recursive: true, force: true });
    },
  };
}

export { readVault, readVaultAttachmentSummaries, saveNote };
