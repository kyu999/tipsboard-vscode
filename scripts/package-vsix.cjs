/**
 * Builds the extension, then packages with a trimmed manifest so the VSIX
 * does not ship dev-only fields (scripts, devDependencies, private).
 *
 * vsce skips npm run vscode:prepublish when the manifest has no such script,
 * so we run the full prepublish on the original package.json first.
 *
 * Usage: npm run package -- [extra vsce args]
 */
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");
const original = readFileSync(packageJsonPath, "utf8");

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const vsceExtra = process.argv.slice(2);

try {
  run("npm", ["run", "vscode:prepublish"]);
  const pkg = JSON.parse(original);
  delete pkg.scripts;
  delete pkg.devDependencies;
  delete pkg.private;
  writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  run("npx", ["vsce", "package", "--no-dependencies", ...vsceExtra]);
} finally {
  writeFileSync(packageJsonPath, original);
}
