import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import AdmZip from "adm-zip";
import * as vscode from "vscode";

import {
  normalizeSemanticModelId,
  semanticConfigurationPrefix,
} from "./semanticSettings.js";
import {
  SEMANTIC_OFFLINE_MODEL_CACHE_DIR,
  SEMANTIC_OFFLINE_RUNTIME_DIR,
  findSemanticOfflinePackRoot,
  normalizeBundledModelIds,
  validateSemanticOfflinePackLayout,
  validateSemanticOfflinePackManifest,
  type SemanticOfflinePackManifest,
} from "./semanticOfflinePackCore.js";
import {
  installSemanticRuntimeFromDirectory,
  type SemanticRuntimeOptions,
} from "./semanticRuntime.js";
import { semanticRuntimeTarget } from "./semanticPlatform.js";
import { validateZipEntries } from "./semanticZip.js";

export {
  SEMANTIC_OFFLINE_PACK_KIND,
  SEMANTIC_OFFLINE_MODEL_CACHE_DIR,
  SEMANTIC_OFFLINE_RUNTIME_DIR,
  parseSemanticOfflinePackManifest,
  validateSemanticOfflinePackLayout,
  validateSemanticOfflinePackManifest,
} from "./semanticOfflinePackCore.js";
export type { SemanticOfflinePackManifest } from "./semanticOfflinePackCore.js";

export interface SemanticOfflinePackOptions {
  extensionVersion: string;
  globalStoragePath: string;
  defaultModelCacheDir: string;
}

export interface SemanticOfflinePackInstallResult {
  modelCachePath: string;
  runtimeManifestPath: string;
  bundledModelIds: ReturnType<typeof normalizeBundledModelIds>;
  target: string;
}

export async function installSemanticOfflinePackFromFile(
  options: SemanticOfflinePackOptions,
): Promise<SemanticOfflinePackInstallResult> {
  const files = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { "Tipsboard semantic offline pack": ["zip"] },
    openLabel: "Install Semantic Offline Pack",
  });
  if (!files?.[0]) {
    throw new Error("Semantic offline pack installation was cancelled.");
  }
  return installSemanticOfflinePackZip(files[0].fsPath, options);
}

export async function installSemanticOfflinePackZip(
  zipPath: string,
  options: SemanticOfflinePackOptions,
): Promise<SemanticOfflinePackInstallResult> {
  const target = semanticRuntimeTarget();
  const tmpDir = path.join(
    options.globalStoragePath,
    "semantic-offline-pack",
    `.install-${process.pid}-${Date.now()}`,
  );

  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Installing Tipsboard semantic offline pack",
        cancellable: false,
      },
      async () => {
        const zip = new AdmZip(zipPath);
        validateZipEntries(zip);
        zip.extractAllTo(tmpDir, true);

        const packRoot = await findSemanticOfflinePackRoot(tmpDir);
        if (!packRoot) {
          const nestedZip = await findSingleNestedZip(tmpDir);
          if (nestedZip) {
            const nestedCopy = path.join(os.tmpdir(), `${path.basename(nestedZip)}.${process.pid}-${Date.now()}.tmp`);
            await fs.copyFile(nestedZip, nestedCopy);
            try {
              return await installSemanticOfflinePackZip(nestedCopy, options);
            } finally {
              await fs.rm(nestedCopy, { force: true });
            }
          }
          throw new Error("Selected zip does not contain a Tipsboard semantic offline pack manifest.");
        }

        const manifest = await validateSemanticOfflinePackLayout(packRoot);
        validateSemanticOfflinePackManifest(manifest, target);

        const runtimeOptions: SemanticRuntimeOptions = {
          extensionVersion: options.extensionVersion,
          globalStoragePath: options.globalStoragePath,
          runtimeDownloadBaseUrl: "",
        };
        const runtimeManifestPath = await installSemanticRuntimeFromDirectory(
          path.join(packRoot, SEMANTIC_OFFLINE_RUNTIME_DIR),
          runtimeOptions,
        );

        const modelCachePath = options.defaultModelCacheDir;
        await fs.rm(modelCachePath, { recursive: true, force: true });
        await fs.mkdir(path.dirname(modelCachePath), { recursive: true });
        await copyDirectory(path.join(packRoot, SEMANTIC_OFFLINE_MODEL_CACHE_DIR), modelCachePath);

        const bundledModelIds = normalizeBundledModelIds(manifest.bundledModelIds);
        await applyOfflinePackSettings(modelCachePath, bundledModelIds);

        const digest = await sha256File(zipPath);
        const action = await vscode.window.showInformationMessage(
          `Semantic offline pack installed for ${target} (${digest.slice(0, 12)}...). Reload the window before searching.`,
          "Reload Window",
        );
        if (action === "Reload Window") {
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
        }

        return {
          modelCachePath,
          runtimeManifestPath,
          bundledModelIds,
          target,
        };
      },
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function applyOfflinePackSettings(
  modelCachePath: string,
  bundledModelIds: ReturnType<typeof normalizeBundledModelIds>,
): Promise<void> {
  const config = vscode.workspace.getConfiguration(semanticConfigurationPrefix());
  const currentModelId = normalizeSemanticModelId(config.get<string>("modelId", bundledModelIds[0]));
  const nextModelId = bundledModelIds.includes(currentModelId) ? currentModelId : bundledModelIds[0];

  await config.update("provider", "bundled", vscode.ConfigurationTarget.Global);
  await config.update("allowRemoteModels", false, vscode.ConfigurationTarget.Global);
  await config.update("modelCachePath", modelCachePath, vscode.ConfigurationTarget.Global);
  await config.update("importedPath", "", vscode.ConfigurationTarget.Global);
  await config.update("modelId", nextModelId, vscode.ConfigurationTarget.Global);
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(from, to);
    } else if (entry.isFile()) {
      await fs.copyFile(from, to);
    }
  }
}

async function findSingleNestedZip(root: string): Promise<string | undefined> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const zipFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".zip"))
    .map((entry) => path.join(root, entry.name));
  return zipFiles.length === 1 ? zipFiles[0] : undefined;
}

async function sha256File(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}
