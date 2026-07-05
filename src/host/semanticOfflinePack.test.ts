import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import AdmZip from "adm-zip";
import { afterEach, describe, expect, it } from "vitest";

import {
  SEMANTIC_OFFLINE_MODEL_CACHE_DIR,
  SEMANTIC_OFFLINE_PACK_KIND,
  SEMANTIC_OFFLINE_RUNTIME_DIR,
  parseSemanticOfflinePackManifest,
  validateSemanticOfflinePackLayout,
  validateSemanticOfflinePackManifest,
} from "./semanticOfflinePackCore.js";
import { SEMANTIC_RUNTIME_KIND, semanticRuntimeTarget } from "./semanticPlatform.js";
import { validateZipEntries } from "./semanticZip.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeMinimalRuntime(root: string, target: string): Promise<void> {
  await fs.mkdir(path.join(root, "node_modules", "@huggingface", "transformers"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules", "onnxruntime-node"), { recursive: true });
  await fs.writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: SEMANTIC_RUNTIME_KIND,
      target,
    }),
  );
  await fs.writeFile(path.join(root, "node_modules", "@huggingface", "transformers", "package.json"), "{}");
  await fs.writeFile(path.join(root, "node_modules", "onnxruntime-node", "package.json"), "{}");
}

async function writeMinimalModelCache(root: string): Promise<void> {
  const modelDir = path.join(root, "Xenova", "multilingual-e5-base");
  await fs.mkdir(path.join(modelDir, "onnx"), { recursive: true });
  await fs.writeFile(path.join(modelDir, "config.json"), "{}");
  await fs.writeFile(path.join(modelDir, "onnx", "model_quantized.onnx"), "onnx");
}

async function writeOfflinePackRoot(root: string, target: string): Promise<void> {
  await writeMinimalRuntime(path.join(root, SEMANTIC_OFFLINE_RUNTIME_DIR), target);
  await writeMinimalModelCache(path.join(root, SEMANTIC_OFFLINE_MODEL_CACHE_DIR));
  await fs.writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: SEMANTIC_OFFLINE_PACK_KIND,
      target,
      bundledModelIds: ["Xenova/multilingual-e5-base"],
    }),
  );
}

describe("semantic offline pack validation", () => {
  it("accepts a valid offline pack layout", async () => {
    const root = await makeTempDir("tb-offline-pack-");
    await writeOfflinePackRoot(root, semanticRuntimeTarget());
    const manifest = await validateSemanticOfflinePackLayout(root);
    expect(manifest.kind).toBe(SEMANTIC_OFFLINE_PACK_KIND);
    expect(manifest.bundledModelIds).toEqual(["Xenova/multilingual-e5-base"]);
  });

  it("rejects target mismatch", () => {
    const manifest = parseSemanticOfflinePackManifest(
      JSON.stringify({
        schemaVersion: 1,
        kind: SEMANTIC_OFFLINE_PACK_KIND,
        target: "linux-x64",
      }),
    );
    expect(() => validateSemanticOfflinePackManifest(manifest, "darwin-arm64")).toThrow(/target mismatch/i);
  });

  it("rejects unsafe zip entries", () => {
    const zip = {
      getEntries: () => [{ entryName: "runtime/../../escape.txt" }],
    } as unknown as AdmZip;
    expect(() => validateZipEntries(zip)).toThrow(/unsafe/i);
  });

  it("validates extracted offline pack from zip", async () => {
    const packDir = await makeTempDir("tb-offline-pack-");
    const target = process.platform === "win32" ? "win32-x64" : `${process.platform}-${process.arch}`;
    await writeOfflinePackRoot(packDir, target);

    const zipPath = path.join(await makeTempDir("tb-offline-zip-"), "offline.zip");
    const zip = new AdmZip();
    zip.addLocalFolder(packDir);
    zip.writeZip(zipPath);

    const extractDir = await makeTempDir("tb-offline-extract-");
    const extracted = new AdmZip(zipPath);
    validateZipEntries(extracted);
    extracted.extractAllTo(extractDir, true);

    const manifest = await validateSemanticOfflinePackLayout(extractDir);
    expect(manifest.kind).toBe(SEMANTIC_OFFLINE_PACK_KIND);
  });
});
