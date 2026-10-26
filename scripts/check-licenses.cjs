/**
 * License gate for every npm package Tipsboard installs or ships.
 *
 * Scopes:
 * - shipped:host     root production dependencies bundled into dist/extension/extension.js
 * - shipped:webview  webview production dependencies bundled into dist/media/webview.*
 * - shipped:semantic packages copied into semantic runtime / offline packs
 * - dev              everything else (build, test, packaging, local evaluation)
 *
 * Shipped scopes accept only license-policy.json `shippedAllowedLicenses`.
 * Dev scope additionally accepts `devOnlyAllowedLicenses` (each with a written reason).
 * Unknown or missing licenses fail unless listed in `packageLicenseOverrides`.
 *
 * Usage: node scripts/check-licenses.cjs [--write-notices <file>]
 * `--write-notices` also writes the license texts of shipped packages (attribution for the VSIX).
 */
const { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");
const { collectSemanticRuntimePackages, packageRoot } = require("./semantic-runtime-packages.cjs");

const root = path.resolve(__dirname, "..");
const policy = JSON.parse(readFileSync(path.join(root, "license-policy.json"), "utf8"));
const shippedAllowed = new Set(policy.shippedAllowedLicenses);
const devAllowed = new Set([...shippedAllowed, ...Object.keys(policy.devOnlyAllowedLicenses)]);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function packageNameFromLockPath(lockPath) {
  const marker = "node_modules/";
  return lockPath.slice(lockPath.lastIndexOf(marker) + marker.length);
}

function findOverride(name) {
  for (const [pattern, override] of Object.entries(policy.packageLicenseOverrides)) {
    if (pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern) {
      return override;
    }
  }
  return null;
}

function resolveLicense(name, declared, installedDir) {
  const override = findOverride(name);
  if (override) return override.license;
  if (declared) return declared;
  const pkgJson = installedDir ? path.join(installedDir, "package.json") : null;
  if (pkgJson && existsSync(pkgJson)) {
    const pkg = readJson(pkgJson);
    if (typeof pkg.license === "string") return pkg.license;
    if (Array.isArray(pkg.licenses)) {
      return pkg.licenses.map((entry) => entry.type ?? entry).join(" OR ");
    }
  }
  return null;
}

function tokenize(expression) {
  return expression.replace(/\(/g, " ( ").replace(/\)/g, " ) ").trim().split(/\s+/);
}

/** Evaluates an SPDX expression: OR needs one allowed operand, AND needs all of them. */
function isExpressionAllowed(expression, allowed) {
  const tokens = tokenize(expression);
  let index = 0;

  function parseOr() {
    let result = parseAnd();
    while (tokens[index] === "OR") {
      index += 1;
      const right = parseAnd();
      result = result || right;
    }
    return result;
  }

  function parseAnd() {
    let result = parsePrimary();
    while (tokens[index] === "AND") {
      index += 1;
      const right = parsePrimary();
      result = result && right;
    }
    return result;
  }

  function parsePrimary() {
    const token = tokens[index];
    index += 1;
    if (token === "(") {
      const result = parseOr();
      if (tokens[index] !== ")") throw new Error(`Unbalanced license expression: ${expression}`);
      index += 1;
      return result;
    }
    if (tokens[index] === "WITH") {
      const exception = tokens[index + 1];
      index += 2;
      return allowed.has(`${token} WITH ${exception}`);
    }
    return allowed.has(token);
  }

  const result = parseOr();
  if (index !== tokens.length) throw new Error(`Unexpected token in license expression: ${expression}`);
  return result;
}

function lockEntries(lockFile) {
  const lock = readJson(lockFile);
  return Object.entries(lock.packages)
    .filter(([lockPath]) => lockPath.startsWith("node_modules/") || lockPath.includes("/node_modules/"))
    .map(([lockPath, meta]) => ({ lockPath, name: packageNameFromLockPath(lockPath), meta }));
}

function isProductionEntry(meta) {
  return !meta.dev && !meta.devOptional && !meta.optional;
}

const failures = [];
const counts = {};
/** name@version -> { name, version, license, installedDir } for shipped scopes. */
const shippedPackages = new Map();

function recordShipped(name, license, installedDir) {
  const pkgJson = path.join(installedDir, "package.json");
  if (!existsSync(pkgJson)) return;
  const version = readJson(pkgJson).version ?? "unknown";
  shippedPackages.set(`${name}@${version}`, { name, version, license, installedDir });
}

function check(scope, name, license, allowed, source, installedDir) {
  counts[scope] = (counts[scope] ?? 0) + 1;
  if (scope.startsWith("shipped:") && installedDir) recordShipped(name, license, installedDir);
  if (!license) {
    failures.push(`[${scope}] ${name}: missing license (${source})`);
    return;
  }
  let ok;
  try {
    ok = isExpressionAllowed(license, allowed);
  } catch (error) {
    failures.push(`[${scope}] ${name}: ${error.message}`);
    return;
  }
  if (!ok) failures.push(`[${scope}] ${name}: ${license} is not allowed (${source})`);
}

const semanticPackages = collectSemanticRuntimePackages();
const rootLock = path.join(root, "package-lock.json");
for (const { lockPath, name, meta } of lockEntries(rootLock)) {
  const installedDir = path.join(root, lockPath);
  const license = resolveLicense(name, meta.license, installedDir);
  if (isProductionEntry(meta)) {
    check("shipped:host", name, license, shippedAllowed, "package-lock.json", installedDir);
  } else {
    check("dev", name, license, devAllowed, "package-lock.json");
  }
}

for (const name of semanticPackages) {
  const installedDir = packageRoot(name);
  const declared = existsSync(path.join(installedDir, "package.json"))
    ? readJson(path.join(installedDir, "package.json")).license
    : undefined;
  const license = resolveLicense(name, declared, installedDir);
  check("shipped:semantic", name, license, shippedAllowed, "semantic runtime", installedDir);
}

const webviewRoot = path.join(root, "webview");
for (const { lockPath, name, meta } of lockEntries(path.join(webviewRoot, "package-lock.json"))) {
  const installedDir = path.join(webviewRoot, lockPath);
  const license = resolveLicense(name, meta.license, installedDir);
  if (meta.dev || meta.devOptional) {
    check("dev", name, license, devAllowed, "webview/package-lock.json");
  } else {
    check("shipped:webview", name, license, shippedAllowed, "webview/package-lock.json", installedDir);
  }
}

const LICENSE_FILE_PATTERN = /^(licen[cs]e|copying|notice)([-._].*)?$/i;

function licenseTexts(installedDir) {
  return readdirSync(installedDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENSE_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((file) => readFileSync(path.join(installedDir, file), "utf8").trim());
}

function writeNotices(outputFile) {
  const sections = [...shippedPackages.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
    .map(({ name, version, license, installedDir }) => {
      const texts = licenseTexts(installedDir);
      const body = texts.length > 0 ? texts.join("\n\n") : `(No license file is included in the package. License: ${license})`;
      return `${"-".repeat(78)}\n${name}@${version} (${license})\n${"-".repeat(78)}\n\n${body}\n`;
    });
  const header =
    "Tipsboard bundles the following third-party packages.\n" +
    "Each package is distributed under the license reproduced below.\n\n";
  mkdirSync(path.dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, header + sections.join("\n"));
  console.log(`Wrote ${sections.length} third-party notices to ${path.relative(root, outputFile)}.`);
}

const summary = Object.entries(counts)
  .map(([scope, count]) => `${scope}=${count}`)
  .join(", ");

if (failures.length > 0) {
  console.error(`License check failed (${summary}):`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("Update dependencies or license-policy.json (with a reason) after review.");
  process.exit(1);
}

console.log(`License check passed (${summary}).`);

const noticesFlagIndex = process.argv.indexOf("--write-notices");
if (noticesFlagIndex >= 0) {
  const target = process.argv[noticesFlagIndex + 1];
  if (!target) {
    console.error("--write-notices requires an output file path.");
    process.exit(1);
  }
  writeNotices(path.resolve(root, target));
}
