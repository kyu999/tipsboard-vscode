/**
 * Creates a local semantic runtime pack that can be selected via
 * `tipsboard-vscode.semanticSearch.importedPath`.
 */
const { rmSync, mkdirSync, cpSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, process.argv[2] ?? "dist/semantic-pack");

const build = spawnSync("node", ["scripts/build-extension.cjs"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    TIPSBOARD_BUNDLE_SEMANTIC: "1",
    TIPSBOARD_SKIP_SEMANTIC_COPY: "",
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
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

console.log(`Semantic runtime pack written to ${outDir}`);
