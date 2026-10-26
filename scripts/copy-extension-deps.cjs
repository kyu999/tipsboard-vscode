/**
 * Copies production runtime deps from the repo root install into
 * dist/extension/node_modules so packaged VSIX can resolve them at runtime.
 */
const { rmSync, mkdirSync, cpSync, existsSync, readdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { collectSemanticRuntimePackages, packageRoot, rootModules } = require("./semantic-runtime-packages.cjs");

const root = path.resolve(__dirname, "..");
const extDir = path.join(root, "dist", "extension");
const destModules = path.join(extDir, "node_modules");

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

  removeIfExists(path.join(targetPlatformDir, target.arch, "libonnxruntime_providers_cuda.so"));
  removeIfExists(path.join(targetPlatformDir, target.arch, "libonnxruntime_providers_shared.so"));
  removeIfExists(path.join(targetPlatformDir, target.arch, "libonnxruntime_providers_tensorrt.so"));
  removeIfExists(path.join(destModules, "onnxruntime-node", "lib"));
  removeIfExists(path.join(destModules, "onnxruntime-node", "script"));
}

function pruneTransformersPackage() {
  const transformersRoot = path.join(destModules, "@huggingface", "transformers");
  removeIfExists(path.join(transformersRoot, "src"));
  removeIfExists(path.join(transformersRoot, "types"));
}

/**
 * transformers.js requires a truthy "sharp" export at load time but only calls it for image inputs.
 */
function writeSharpStub() {
  const stubDir = path.join(destModules, "sharp");
  mkdirSync(stubDir, { recursive: true });
  writeFileSync(
    path.join(stubDir, "package.json"),
    `${JSON.stringify(
      {
        name: "sharp",
        version: "0.0.0-tipsboard-stub",
        description: "Tipsboard stub: image processing is not used by semantic search",
        license: "Apache-2.0",
        main: "index.js",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(stubDir, "index.js"),
    [
      "function sharp() {",
      '  throw new Error("Image processing is not available in the Tipsboard semantic runtime.");',
      "}",
      "module.exports = sharp;",
      "module.exports.default = sharp;",
      "",
    ].join("\n"),
  );
}

rmSync(destModules, { recursive: true, force: true });
mkdirSync(destModules, { recursive: true });

const packages = [...collectSemanticRuntimePackages()].sort();
for (const name of packages) {
  copyPackage(name);
}

const target = parseTarget();
pruneOnnxRuntimeNode(target);
pruneTransformersPackage();
writeSharpStub();

const transformersEntry = path.join(destModules, "@huggingface", "transformers", "dist", "transformers.node.cjs");
if (!existsSync(transformersEntry)) {
  throw new Error("Copied @huggingface/transformers is incomplete");
}

console.log(`Copied ${packages.length} package(s) into dist/extension/node_modules for ${target.label}`);
