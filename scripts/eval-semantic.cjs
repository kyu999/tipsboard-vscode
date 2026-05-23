#!/usr/bin/env node
/**
 * Semantic eval CLI. Prefer flags over environment variables.
 *
 *   npm run eval:semantic
 *   npm run eval:semantic -- --dataset jmteb-lite-mldr
 *   npm run eval:semantic -- -d mldr --mode hybrid
 *   npm run eval:semantic -- --model Xenova/bge-m3
 */
const { spawnSync } = require("node:child_process");

const DATASET_IDS = ["jmteb-lite-mldr", "beir-scifact"];
const DATASET_ALIASES = {
  mldr: "jmteb-lite-mldr",
  scifact: "beir-scifact",
};

function usage() {
  return `Usage: npm run eval:semantic -- [options]

Options:
  -d, --dataset <id>     Dataset (${DATASET_IDS.join(" | ")})
                         Aliases: mldr, scifact
  --model <id>           Hugging Face model id
  --mode <dense|hybrid>  Search mode (default: dense)
  --dense-weight <n>     Hybrid dense weight (default: 0.75)
  --bm25-weight <n>      Hybrid BM25 weight (default: 0.25)
  --top-k <n>            Metrics @K (default: 10)
  --refresh-dataset      Re-fetch dataset from Hugging Face
  --full-dataset         Fetch full corpus (mldr default caps at 5000 docs)
  --limit-docs <n>       Max corpus documents to fetch
  --limit-queries <n>    Max queries to fetch
  --reranker <id>        Reranker spike label (not wired to search yet)
  --allow-remote-models  Download embedding weights from Hugging Face Hub (dev only)
  --model-cache-dir <p>  Transformers.js model cache directory (default: eval/.cache/models)
  -h, --help             Show this help

Vault output (no flag needed):
  eval/.cache/vaults/<datasetId>/

Examples:
  npm run eval:semantic
  npm run eval:semantic -- --dataset mldr
  npm run eval:semantic -- -d jmteb-lite-mldr --mode hybrid
  npm run eval:semantic -- --model Xenova/bge-m3 --dataset mldr
`;
}

function resolveDataset(raw) {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (DATASET_ALIASES[normalized]) return DATASET_ALIASES[normalized];
  if (DATASET_IDS.includes(raw.trim())) return raw.trim();
  throw new Error(`Unknown dataset "${raw}". Use one of: ${DATASET_IDS.join(", ")} (aliases: ${Object.keys(DATASET_ALIASES).join(", ")})`);
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dataset" || arg === "-d") {
      options.dataset = resolveDataset(argv[++i]);
      continue;
    }
    if (arg.startsWith("--dataset=")) {
      options.dataset = resolveDataset(arg.slice("--dataset=".length));
      continue;
    }
    if (arg === "--model") {
      options.model = argv[++i];
      continue;
    }
    if (arg.startsWith("--model=")) {
      options.model = arg.slice("--model=".length);
      continue;
    }
    if (arg === "--mode") {
      options.mode = argv[++i];
      continue;
    }
    if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
      continue;
    }
    if (arg === "--dense-weight") {
      options.denseWeight = argv[++i];
      continue;
    }
    if (arg.startsWith("--dense-weight=")) {
      options.denseWeight = arg.slice("--dense-weight=".length);
      continue;
    }
    if (arg === "--bm25-weight") {
      options.bm25Weight = argv[++i];
      continue;
    }
    if (arg.startsWith("--bm25-weight=")) {
      options.bm25Weight = arg.slice("--bm25-weight=".length);
      continue;
    }
    if (arg === "--top-k") {
      options.topK = argv[++i];
      continue;
    }
    if (arg.startsWith("--top-k=")) {
      options.topK = arg.slice("--top-k=".length);
      continue;
    }
    if (arg === "--refresh-dataset") {
      options.refreshDataset = true;
      continue;
    }
    if (arg === "--full-dataset") {
      options.fullDataset = true;
      continue;
    }
    if (arg === "--limit-docs") {
      options.limitDocs = argv[++i];
      continue;
    }
    if (arg.startsWith("--limit-docs=")) {
      options.limitDocs = arg.slice("--limit-docs=".length);
      continue;
    }
    if (arg === "--limit-queries") {
      options.limitQueries = argv[++i];
      continue;
    }
    if (arg.startsWith("--limit-queries=")) {
      options.limitQueries = arg.slice("--limit-queries=".length);
      continue;
    }
    if (arg === "--reranker") {
      options.reranker = argv[++i];
      continue;
    }
    if (arg.startsWith("--reranker=")) {
      options.reranker = arg.slice("--reranker=".length);
      continue;
    }
    if (arg === "--allow-remote-models") {
      options.allowRemoteModels = true;
      continue;
    }
    if (arg === "--model-cache-dir") {
      options.modelCacheDir = argv[++i];
      continue;
    }
    if (arg.startsWith("--model-cache-dir=")) {
      options.modelCacheDir = arg.slice("--model-cache-dir=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    }
    if (!options.dataset) {
      options.dataset = resolveDataset(arg);
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}\n\n${usage()}`);
  }
  return options;
}

function buildEnv(options) {
  const env = { ...process.env };
  if (options.dataset) env.TIPSBOARD_SEMANTIC_EVAL_DATASET = options.dataset;
  if (options.model) env.TIPSBOARD_SEMANTIC_EVAL_MODEL_ID = options.model;
  if (options.mode) env.TIPSBOARD_SEMANTIC_EVAL_MODE = options.mode;
  if (options.denseWeight !== undefined) env.TIPSBOARD_SEMANTIC_EVAL_DENSE_WEIGHT = options.denseWeight;
  if (options.bm25Weight !== undefined) env.TIPSBOARD_SEMANTIC_EVAL_BM25_WEIGHT = options.bm25Weight;
  if (options.topK !== undefined) env.TIPSBOARD_SEMANTIC_EVAL_TOP_K = options.topK;
  if (options.refreshDataset) env.TIPSBOARD_SEMANTIC_EVAL_REFRESH_DATASET = "1";
  if (options.fullDataset) env.TIPSBOARD_SEMANTIC_EVAL_FULL_DATASET = "1";
  if (options.limitDocs !== undefined) env.TIPSBOARD_SEMANTIC_EVAL_MAX_DOCS = String(options.limitDocs);
  if (options.limitQueries !== undefined) env.TIPSBOARD_SEMANTIC_EVAL_MAX_QUERIES = String(options.limitQueries);
  if (options.reranker) env.TIPSBOARD_SEMANTIC_EVAL_RERANKER = options.reranker;
  if (options.allowRemoteModels) env.TIPSBOARD_SEMANTIC_EVAL_ALLOW_REMOTE_MODELS = "1";
  if (options.modelCacheDir) env.TIPSBOARD_SEMANTIC_EVAL_MODEL_CACHE_DIR = options.modelCacheDir;
  return env;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.dataset) {
    console.log(`[semantic-eval] dataset=${options.dataset}`);
  }

  const result = spawnSync(
    "npx",
    ["vitest", "run", "--config", "vitest.semantic-eval.config.mts"],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: process.platform === "win32",
      env: buildEnv(options),
    },
  );

  process.exit(result.status ?? 1);
}

main();
