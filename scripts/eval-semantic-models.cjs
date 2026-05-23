const { spawnSync } = require("node:child_process");

const defaultModels = [
  "Xenova/multilingual-e5-base",
  "Xenova/bge-m3",
  "onnx-community/gte-multilingual-base",
];

const models = (process.env.TIPSBOARD_SEMANTIC_EVAL_MODEL_IDS ?? defaultModels.join(","))
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

const forwardArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--models="));

for (const model of models) {
  console.log(`\n[semantic-eval] Running model comparison: ${model}`);
  const result = spawnSync(
    "node",
    ["scripts/eval-semantic.cjs", ...forwardArgs, "--model", model],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        TIPSBOARD_SEMANTIC_EVAL_REPORT_PATH: "",
      },
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
