/**
 * Resolves the npm package closure shipped in the semantic runtime pack.
 * Shared by copy-extension-deps.cjs (copying) and check-licenses.cjs (license gate).
 */
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const rootModules = path.join(root, "node_modules");

// sharp bundles LGPL-licensed libvips binaries; Tipsboard only runs text feature-extraction,
// so the runtime ships a stub instead (see copy-extension-deps.cjs writeSharpStub).
const STUBBED_PACKAGES = new Set(["sharp"]);
const SKIPPED_PACKAGES = new Set(["onnxruntime-web", ...STUBBED_PACKAGES]);

function packageRoot(name) {
  if (name.startsWith("@")) {
    const idx = name.indexOf("/");
    return path.join(rootModules, name.slice(0, idx), name.slice(idx + 1));
  }
  return path.join(rootModules, name);
}

function semanticRuntimeSeed() {
  const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const semanticVersion =
    rootPkg.dependencies?.["@huggingface/transformers"] ??
    rootPkg.optionalDependencies?.["@huggingface/transformers"];
  if (!semanticVersion) {
    throw new Error("@huggingface/transformers is not declared in package.json");
  }
  return ["@huggingface/transformers"];
}

function collectSemanticRuntimePackages(names = semanticRuntimeSeed(), seen = new Set()) {
  for (const name of names) {
    if (SKIPPED_PACKAGES.has(name)) continue;
    if (seen.has(name)) continue;
    const pkgJsonPath = path.join(packageRoot(name), "package.json");
    if (!existsSync(pkgJsonPath)) {
      throw new Error(`Missing installed package ${name}; run npm install at repo root`);
    }
    seen.add(name);
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    const deps = [
      ...Object.keys(pkg.dependencies ?? {}).filter((dep) => !SKIPPED_PACKAGES.has(dep)),
      ...Object.keys(pkg.optionalDependencies ?? {}).filter(
        (dep) => !SKIPPED_PACKAGES.has(dep) && existsSync(packageRoot(dep)),
      ),
    ];
    collectSemanticRuntimePackages(deps, seen);
  }
  return seen;
}

module.exports = {
  STUBBED_PACKAGES,
  SKIPPED_PACKAGES,
  rootModules,
  packageRoot,
  collectSemanticRuntimePackages,
};
