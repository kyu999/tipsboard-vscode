/**
 * Copies production runtime deps from the repo root install into
 * dist/extension/node_modules so packaged VSIX can resolve them at runtime.
 */
const { readFileSync, rmSync, mkdirSync, cpSync, existsSync, readdirSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extDir = path.join(root, "dist", "extension");
const destModules = path.join(extDir, "node_modules");
const rootModules = path.join(root, "node_modules");
const skippedPackages = new Set(["onnxruntime-web"]);

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
    if (skippedPackages.has(name)) continue;
    if (seen.has(name)) continue;
    const pkgDir = packageRoot(name);
    const pkgJsonPath = path.join(pkgDir, "package.json");
    if (!existsSync(pkgJsonPath)) {
      throw new Error(`Missing installed package ${name}; run npm install at repo root`);
    }
    seen.add(name);
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    const deps = [
      ...Object.keys(pkg.dependencies ?? {}).filter((dep) => !skippedPackages.has(dep)),
      ...Object.keys(pkg.optionalDependencies ?? {}).filter(
        (dep) => !skippedPackages.has(dep) && existsSync(packageRoot(dep)),
      ),
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

function removeIfExists(target) {
  rmSync(target, { recursive: true, force: true });
}

function parseTarget() {
  const target = process.env.TIPSBOARD_EXTENSION_TARGET;
  if (!target) {
    return { platform: process.platform, arch: process.arch, label: `${process.platform}-${process.arch}` };
  }
  const [platform, arch] = target.split("-");
  if (!platform || !arch) {
    throw new Error(`Invalid TIPSBOARD_EXTENSION_TARGET: ${target}`);
  }
  return { platform: platform === "alpine" ? "linux" : platform, arch, label: target };
}

function pruneOnnxRuntimeNode(target) {
  const binRoot = path.join(destModules, "onnxruntime-node", "bin", "napi-v6");
  if (!existsSync(binRoot)) return;

  for (const platform of readdirSync(binRoot)) {
    const platformDir = path.join(binRoot, platform);
    if (platform !== target.platform) {
      removeIfExists(platformDir);
    }
  }

  const targetPlatformDir = path.join(binRoot, target.platform);
  if (existsSync(targetPlatformDir)) {
    for (const arch of readdirSync(targetPlatformDir)) {
      const archDir = path.join(targetPlatformDir, arch);
      if (arch !== target.arch) {
        removeIfExists(archDir);
      }
    }
  }

  const bindingPath = path.join(targetPlatformDir, target.arch, "onnxruntime_binding.node");
  if (!existsSync(bindingPath)) {
    throw new Error(`onnxruntime-node does not include a native binding for ${target.label}`);
  }

  removeIfExists(path.join(destModules, "onnxruntime-node", "lib"));
  removeIfExists(path.join(destModules, "onnxruntime-node", "script"));
}

function pruneTransformersPackage() {
  const transformersRoot = path.join(destModules, "@huggingface", "transformers");
  removeIfExists(path.join(transformersRoot, "src"));
  removeIfExists(path.join(transformersRoot, "types"));
}

rmSync(destModules, { recursive: true, force: true });
mkdirSync(destModules, { recursive: true });

const packages = [...collectRuntimePackages(seed)].sort();
for (const name of packages) {
  copyPackage(name);
}

const target = parseTarget();
pruneOnnxRuntimeNode(target);
pruneTransformersPackage();

const transformersEntry = path.join(destModules, "@huggingface", "transformers", "dist", "transformers.node.cjs");
if (!existsSync(transformersEntry)) {
  throw new Error("Copied @huggingface/transformers is incomplete");
}

console.log(`Copied ${packages.length} package(s) into dist/extension/node_modules for ${target.label}`);
