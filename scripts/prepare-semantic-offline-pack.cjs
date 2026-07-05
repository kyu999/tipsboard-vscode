/**
 * Creates a Tipsboard semantic offline pack zip containing:
 * - runtime/ (Transformers.js + onnxruntime-node for one target)
 * - semantic-model-cache/ (pre-warmed embedding models)
 * - manifest.json (kind: tipsboard-semantic-offline-pack)
 */
const { readFileSync, rmSync, mkdirSync, cpSync, writeFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const AdmZip = require("adm-zip");

const root = path.resolve(__dirname, "..");

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0) return process.argv[idx + 1];
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function positionalArg() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      if (!arg.includes("=")) i++;
      continue;
    }
    return arg;
  }
  return undefined;
}

function runNode(script, args, env = process.env) {
  const result = spawnSync("node", [script, ...args], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const target = readArg("--target") ?? `${process.platform}-${process.arch}`;
const defaultOut = `dist/tipsboard-semantic-offline-${target}.zip`;
const outPath = path.resolve(root, readArg("--out") ?? positionalArg() ?? defaultOut);
const workDir = path.join(root, "dist", `.semantic-offline-work-${target}`);
const stagingDir = path.join(workDir, "pack");
const runtimeDir = path.resolve(root, readArg("--runtime-dir") ?? path.join(workDir, "runtime"));
const modelCacheDir = path.resolve(
  root,
  readArg("--model-cache-dir") ?? path.join(root, "dist", "semantic-model-cache"),
);
const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const transformersVersion =
  rootPkg.dependencies?.["@huggingface/transformers"] ??
  rootPkg.optionalDependencies?.["@huggingface/transformers"];

if (!hasFlag("--skip-runtime")) {
  console.log(`[prepare-offline-pack] Building runtime for ${target}...`);
  runNode("scripts/prepare-semantic-pack.cjs", ["--target", target, "--out", runtimeDir]);
}

if (!hasFlag("--skip-models")) {
  if (!existsSync(path.join(modelCacheDir, "Xenova"))) {
    console.log("[prepare-offline-pack] Building semantic model cache...");
    runNode("scripts/prepare-semantic-model-cache.cjs");
  } else {
    console.log(`[prepare-offline-pack] Reusing model cache at ${modelCacheDir}`);
  }
}

if (!existsSync(path.join(runtimeDir, "manifest.json"))) {
  console.error(`[prepare-offline-pack] Missing runtime at ${runtimeDir}`);
  process.exit(1);
}
if (!existsSync(path.join(modelCacheDir, "Xenova"))) {
  console.error(`[prepare-offline-pack] Missing model cache at ${modelCacheDir}`);
  process.exit(1);
}

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
cpSync(runtimeDir, path.join(stagingDir, "runtime"), { recursive: true, dereference: true });
cpSync(modelCacheDir, path.join(stagingDir, "semantic-model-cache"), { recursive: true, dereference: true });

const bundledModelIds = (readArg("--model-ids") ?? "Xenova/multilingual-e5-base,Xenova/bge-m3")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

writeFileSync(
  path.join(stagingDir, "manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "tipsboard-semantic-offline-pack",
      packVersion: rootPkg.version,
      target,
      runtimeVersion: rootPkg.version,
      bundledModelIds,
      transformersVersion,
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

if (outPath.endsWith(".zip")) {
  rmSync(outPath, { force: true });
  const zip = new AdmZip();
  zip.addLocalFolder(stagingDir);
  zip.writeZip(outPath);
  console.log(`Semantic offline pack written to ${outPath}`);
} else {
  rmSync(outPath, { recursive: true, force: true });
  cpSync(stagingDir, outPath, { recursive: true, dereference: true });
  console.log(`Semantic offline pack written to ${outPath}`);
}
