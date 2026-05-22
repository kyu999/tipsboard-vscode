/**
 * Copies production runtime deps from the repo root install into
 * dist/extension/node_modules so packaged VSIX can resolve them at runtime.
 */
const { readFileSync, rmSync, mkdirSync, cpSync, existsSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extDir = path.join(root, "dist", "extension");
const destModules = path.join(extDir, "node_modules");
const rootModules = path.join(root, "node_modules");

const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const semanticVersion =
  rootPkg.dependencies?.["@huggingface/transformers"] ??
  rootPkg.optionalDependencies?.["@huggingface/transformers"];
const seed = semanticVersion
  ? ["@huggingface/transformers"]
  : [];
if (seed.length === 0) {
  throw new Error("Run npm install at repo root before build:extension");
}

function packageRoot(name) {
  if (name.startsWith("@")) {
    const idx = name.indexOf("/");
    return path.join(rootModules, name.slice(0, idx), name.slice(idx + 1));
  }
  return path.join(rootModules, name);
}

function collectRuntimePackages(names, seen = new Set()) {
  for (const name of names) {
    if (seen.has(name)) continue;
    const pkgDir = packageRoot(name);
    const pkgJsonPath = path.join(pkgDir, "package.json");
    if (!existsSync(pkgJsonPath)) {
      throw new Error(`Missing installed package ${name}; run npm install at repo root`);
    }
    seen.add(name);
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    const deps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}).filter((dep) => existsSync(packageRoot(dep))),
    ];
    collectRuntimePackages(deps, seen);
  }
  return seen;
}

function copyPackage(name) {
  const src = packageRoot(name);
  const rel = path.relative(rootModules, src);
  const dest = path.join(destModules, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: true });
}

rmSync(destModules, { recursive: true, force: true });
mkdirSync(destModules, { recursive: true });

const packages = [...collectRuntimePackages(seed)].sort();
for (const name of packages) {
  copyPackage(name);
}

const transformersEntry = path.join(destModules, "@huggingface", "transformers", "dist", "transformers.node.cjs");
if (!existsSync(transformersEntry)) {
  throw new Error("Copied @huggingface/transformers is incomplete");
}

console.log(`Copied ${packages.length} package(s) into dist/extension/node_modules`);
