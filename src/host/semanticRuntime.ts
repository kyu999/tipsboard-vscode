import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

import AdmZip from "adm-zip";
import * as vscode from "vscode";

export const SEMANTIC_RUNTIME_KIND = "tipsboard-semantic-runtime-pack";

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

export function semanticRuntimeTarget(): string {
  return `${process.platform}-${process.arch}`;
}

export function semanticRuntimeAssetName(target: string = semanticRuntimeTarget()): string {
  return `tipsboard-semantic-runtime-${target}.zip`;
}

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
  const destination = semanticRuntimeInstallPath(options);
  const tmpDir = path.join(options.globalStoragePath, RUNTIME_DIR_NAME, `.install-${process.pid}-${Date.now()}`);

  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const zip = new AdmZip(zipPath);
    validateZipEntries(zip);
    zip.extractAllTo(tmpDir, true);
    await validateSemanticRuntime(tmpDir, target);

    await fs.rm(destination, { recursive: true, force: true });
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(tmpDir, destination);
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw error;
  }

  const manifestPath = path.join(destination, "manifest.json");
  const digest = await sha256File(zipPath);
  await vscode.window.showInformationMessage(`Semantic runtime installed for ${target} (${digest.slice(0, 12)}...).`);
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

function validateZipEntries(zip: AdmZip): void {
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/\\/g, "/");
    if (path.isAbsolute(name) || name.split("/").includes("..")) {
      throw new Error(`Unsafe semantic runtime zip entry: ${entry.entryName}`);
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
