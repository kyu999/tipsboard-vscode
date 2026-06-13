#!/usr/bin/env node
/**
 * Performance eval CLI (local only).
 *
 *   npm run eval:perf
 *   npm run eval:perf:smoke
 *   npm run eval:perf -- --sizes 100,1000
 */
const { spawnSync } = require("node:child_process");

function usage() {
  return `Usage: npm run eval:perf -- [options]

Options:
  --sizes <n,n,...>   Note counts to benchmark (default: 100,1000,5000,10000)
  --refresh           Rebuild seeded vault directories
  -h, --help          Show this help

Examples:
  npm run eval:perf
  npm run eval:perf:smoke
  npm run eval:perf -- --sizes 100,1000,5000
`;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--sizes") {
      options.sizes = argv[++i];
      continue;
    }
    if (arg.startsWith("--sizes=")) {
      options.sizes = arg.slice("--sizes=".length);
      continue;
    }
    if (arg === "--refresh") {
      options.refresh = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    }
    throw new Error(`Unexpected argument: ${arg}\n\n${usage()}`);
  }
  return options;
}

function buildEnv(options) {
  const env = { ...process.env };
  if (options.sizes) env.TIPSBOARD_PERF_EVAL_SIZES = options.sizes;
  if (options.refresh) env.TIPSBOARD_PERF_EVAL_REFRESH = "1";
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

  if (options.sizes) {
    console.log(`[perf-eval] sizes=${options.sizes}`);
  }

  const result = spawnSync("npx", ["vitest", "run", "--config", "vitest.perf.config.mts"], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
    env: buildEnv(options),
  });

  process.exit(result.status ?? 1);
}

main();
