const { rmSync } = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const outdir = path.join(root, "dist", "extension");

rmSync(outdir, { recursive: true, force: true });

esbuild.buildSync({
  entryPoints: [path.join(root, "src", "extension.ts")],
  outfile: path.join(outdir, "extension.js"),
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode", "@huggingface/transformers"],
  legalComments: "none",
  logLevel: "info",
});

if (process.env.TIPSBOARD_SKIP_SEMANTIC_COPY !== "1") {
  require("./copy-extension-deps.cjs");
}
