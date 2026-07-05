import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

import AdmZip from "adm-zip";
import * as vscode from "vscode";

import { validateZipEntries } from "./semanticZip.js";
import { SEMANTIC_RUNTIME_KIND, semanticRuntimeAssetName, semanticRuntimeTarget } from "./semanticPlatform.js";

export { SEMANTIC_RUNTIME_KIND, semanticRuntimeAssetName, semanticRuntimeTarget } from "./semanticPlatform.js";

interface SemanticRuntimeManifest {
  schemaVersion: number;
  kind?: string;
  runtimeVersion?: string;
  target?: string;
  transformersVersion?: string;
  createdAt?: string;
}

export interface SemanticRuntimeOptions {
  extensionVersion: string;
  globalStoragePath: string;
  runtimeDownloadBaseUrl: string;
}

const RUNTIME_DIR_NAME = "semantic-runtime";

export function semanticRuntimeVersion(extensionVersion: string): string {
  return extensionVersion.trim() || "dev";
}

export function semanticRuntimeInstallPath(options: SemanticRuntimeOptions): string {
  return path.join(
    options.globalStoragePath,
    RUNTIME_DIR_NAME,
    semanticRuntimeVersion(options.extensionVersion),
    semanticRuntimeTarget(),
  );
}

export async function ensureSemanticRuntime(options: SemanticRuntimeOptions): Promise<string> {
  const installedPath = semanticRuntimeInstallPath(options);
  if (await isSemanticRuntimeValid(installedPath, semanticRuntimeTarget())) {
    return path.join(installedPath, "manifest.json");
  }

  const choice = await vscode.window.showWarningMessage(
    "Semantic search requires a local runtime. Download it automatically or install a downloaded runtime pack.",
    "Download automatically",
    "Install from file",
    "Disable semantic search",
  );

  if (choice === "Download automatically") {
    return downloadAndInstallSemanticRuntime(options);
  }
  if (choice === "Install from file") {
    return installSemanticRuntimeFromFile(options);
  }
  if (choice === "Disable semantic search") {
    await vscode.workspace
      .getConfiguration("tipsboard-vscode.semanticSearch")
      .update("provider", "off", vscode.ConfigurationTarget.Global);
  }
  throw new Error("Semantic search runtime is not installed.");
}

export async function downloadAndInstallSemanticRuntime(options: SemanticRuntimeOptions): Promise<string> {
  const target = semanticRuntimeTarget();
  const assetName = semanticRuntimeAssetName(target);
  const baseUrl = options.runtimeDownloadBaseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/${assetName}`;
  const tmpZip = path.join(os.tmpdir(), `${assetName}.${Date.now()}.tmp`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Downloading Tipsboard semantic runtime",
        cancellable: false,
      },
      async () => {
        await downloadFile(url, tmpZip);
      },
    );
  } catch (error) {
    const action = await vscode.window.showErrorMessage(
      `Could not download the semantic runtime pack from ${url}. ${messageForError(error)} You can install a downloaded runtime zip instead.`,
      "Install from file",
    );
    if (action === "Install from file") {
      return installSemanticRuntimeFromFile(options);
    }
    throw error;
  }

  try {
    return await installSemanticRuntimeZip(tmpZip, options);
  } finally {
    await fs.rm(tmpZip, { force: true });
  }
}

export async function installSemanticRuntimeFromFile(options: SemanticRuntimeOptions): Promise<string> {
  const files = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { "Tipsboard semantic runtime": ["zip"] },
    openLabel: "Install Semantic Runtime",
  });
  if (!files?.[0]) {
    throw new Error("Semantic runtime installation was cancelled.");
  }
  return installSemanticRuntimeZip(files[0].fsPath, options);
}

async function installSemanticRuntimeZip(zipPath: string, options: SemanticRuntimeOptions): Promise<string> {
  const target = semanticRuntimeTarget();
  const tmpDir = path.join(options.globalStoragePath, RUNTIME_DIR_NAME, `.install-${process.pid}-${Date.now()}`);

  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  let manifestPath: string;
  try {
    const zip = new AdmZip(zipPath);
    validateZipEntries(zip);
    zip.extractAllTo(tmpDir, true);

    const runtimeRoot = await findSemanticRuntimeRoot(tmpDir);
    if (!runtimeRoot) {
      const nestedZip = await findSingleNestedZip(tmpDir);
      if (nestedZip) {
        const nestedCopy = path.join(os.tmpdir(), `${path.basename(nestedZip)}.${process.pid}-${Date.now()}.tmp`);
        await fs.copyFile(nestedZip, nestedCopy);
        await fs.rm(tmpDir, { recursive: true, force: true });
        try {
          return await installSemanticRuntimeZip(nestedCopy, options);
        } finally {
          await fs.rm(nestedCopy, { force: true });
        }
      }
      throw new Error("Selected zip does not contain a Tipsboard semantic runtime manifest.");
    }
    manifestPath = await installSemanticRuntimeFromDirectory(runtimeRoot, options);
    if (runtimeRoot !== tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw error;
  }

  const digest = await sha256File(zipPath);
  const action = await vscode.window.showInformationMessage(
    `Semantic runtime installed for ${target} (${digest.slice(0, 12)}...). Reload the window before searching.`,
    "Reload Window",
  );
  if (action === "Reload Window") {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
  return manifestPath;
}

async function isSemanticRuntimeValid(runtimePath: string, target: string): Promise<boolean> {
  try {
    await validateSemanticRuntime(runtimePath, target);
    return true;
  } catch {
    return false;
  }
}

async function validateSemanticRuntime(runtimePath: string, target: string): Promise<void> {
  const manifest = await readManifest(path.join(runtimePath, "manifest.json"));
  if (manifest.schemaVersion !== 1) {
    throw new Error("Semantic runtime manifest has an unsupported schema version.");
  }
  if (manifest.kind && manifest.kind !== SEMANTIC_RUNTIME_KIND) {
    throw new Error("Selected file is not a Tipsboard semantic runtime pack.");
  }
  if (manifest.target && manifest.target !== target) {
    throw new Error(`Semantic runtime target mismatch: expected ${target}, got ${manifest.target}.`);
  }

  await fs.access(path.join(runtimePath, "node_modules", "@huggingface", "transformers", "package.json"));
  await fs.access(path.join(runtimePath, "node_modules", "onnxruntime-node", "package.json"));
}

async function readManifest(manifestPath: string): Promise<SemanticRuntimeManifest> {
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw) as SemanticRuntimeManifest;
}

async function findSemanticRuntimeRoot(root: string, depth: number = 3): Promise<string | undefined> {
  if (await fileExists(path.join(root, "manifest.json"))) {
    return root;
  }
  if (depth <= 0) return undefined;

  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === "__MACOSX") continue;
    const found = await findSemanticRuntimeRoot(path.join(root, entry.name), depth - 1);
    if (found) return found;
  }
  return undefined;
}

async function findSingleNestedZip(root: string): Promise<string | undefined> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const zipFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".zip"))
    .map((entry) => path.join(root, entry.name));
  return zipFiles.length === 1 ? zipFiles[0] : undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export { validateZipEntries } from "./semanticZip.js";

export async function installSemanticRuntimeFromDirectory(
  runtimeRoot: string,
  options: SemanticRuntimeOptions,
): Promise<string> {
  const target = semanticRuntimeTarget();
  const destination = semanticRuntimeInstallPath(options);
  await validateSemanticRuntime(runtimeRoot, target);

  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await copyDirectory(runtimeRoot, destination);

  return path.join(destination, "manifest.json");
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

async function downloadFile(url: string, destination: string, redirects = 0): Promise<void> {
  if (redirects > 5) {
    throw new Error("Too many redirects while downloading semantic runtime.");
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });

  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        const nextUrl = new URL(location, url).toString();
        void downloadFile(nextUrl, destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`Failed to download semantic runtime: HTTP ${status}`));
        return;
      }

      const output = createWriteStream(destination);
      output.on("error", reject);
      output.on("finish", () => resolve());
      response.pipe(output);
    });
    request.on("error", reject);
  });
}

async function sha256File(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
