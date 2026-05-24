import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const WORKSPACE_PREFS_SEG = `.tipsboard/workspace.json`;

function prefsAbs(vaultPath: string): string {
  return path.join(vaultPath, ...WORKSPACE_PREFS_SEG.split("/"));
}

export interface WorkspacePreferences {
  version: 1;
  /** When true, Tipsboard prompts to file inbox notes into folder hierarchy. */
  preferFolderHierarchy: boolean;
}

export function defaultWorkspacePreferences(): WorkspacePreferences {
  return { version: 1, preferFolderHierarchy: true };
}

export async function loadWorkspacePreferences(vaultPath: string): Promise<WorkspacePreferences> {
  const abs = prefsAbs(vaultPath);
  let raw = "";
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch {
    return defaultWorkspacePreferences();
  }
  try {
    const parsed = JSON.parse(raw) as { version?: number; preferFolderHierarchy?: unknown };
    if (!parsed || parsed.version !== 1) return defaultWorkspacePreferences();
    return {
      version: 1,
      preferFolderHierarchy: parsed.preferFolderHierarchy !== false,
    };
  } catch {
    return defaultWorkspacePreferences();
  }
}

export async function saveWorkspacePreferences(vaultPath: string, prefs: WorkspacePreferences): Promise<void> {
  const dir = path.join(vaultPath, ".tipsboard");
  await fs.mkdir(dir, { recursive: true });
  const target = prefsAbs(vaultPath);
  const tmp = `${target}.${randomUUID()}.tmp`;
  const json = `${JSON.stringify({ version: 1, preferFolderHierarchy: prefs.preferFolderHierarchy }, null, 2)}\n`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, target);
}
