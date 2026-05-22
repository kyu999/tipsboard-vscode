/**
 * Creates a local semantic runtime pack that can be selected via
 * `tipsboard-vscode.semanticSearch.importedPath`.
 */
const { readFileSync, rmSync, mkdirSync, cpSync, writeFileSync } = require("node:fs");
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

const target = readArg("--target") ?? `${process.platform}-${process.arch}`;
const defaultOut = `dist/tipsboard-semantic-runtime-${target}.zip`;
const outPath = path.resolve(root, readArg("--out") ?? positionalArg() ?? defaultOut);
const outDir = outPath.endsWith(".zip")
  ? path.join(root, "dist", `semantic-pack-${target}`)
  : outPath;
const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

const build = spawnSync("node", ["scripts/build-extension.cjs"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    TIPSBOARD_BUNDLE_SEMANTIC: "1",
    TIPSBOARD_SKIP_SEMANTIC_COPY: "",
    TIPSBOARD_EXTENSION_TARGET: target,
    ONNXRUNTIME_NODE_INSTALL: process.env.ONNXRUNTIME_NODE_INSTALL ?? "skip",
  },
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(path.join(root, "dist", "extension", "node_modules"), path.join(outDir, "node_modules"), {
  recursive: true,
  dereference: true,
});
writeFileSync(
  path.join(outDir, "manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "tipsboard-semantic-runtime-pack",
      runtimeVersion: rootPkg.version,
      target,
      transformersVersion:
        rootPkg.dependencies?.["@huggingface/transformers"] ??
        rootPkg.optionalDependencies?.["@huggingface/transformers"],
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

if (outPath.endsWith(".zip")) {
  rmSync(outPath, { force: true });
  const zip = new AdmZip();
  zip.addLocalFolder(outDir);
  zip.writeZip(outPath);
  console.log(`Semantic runtime pack written to ${outPath}`);
} else {
  console.log(`Semantic runtime pack written to ${outDir}`);
}
