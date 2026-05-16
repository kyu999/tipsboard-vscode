/**
 * VS Code WebView は Node の `global process` を持たない。バンドル済み依存が
 * `process.env` 等を参照すると `ReferenceError: process is not defined` になるため、
 * いちばん最初に最小の互換オブジェクトを載せる。
 */
const g = globalThis as typeof globalThis & {
  process?: { env: Record<string, string | undefined>; [k: string]: unknown };
};

if (typeof g.process === "undefined") {
  g.process = {
    env: { NODE_ENV: "production" },
    version: "",
    versions: {},
    platform: "webview",
    cwd: () => "/",
    browser: true,
    nextTick: (cb: (...args: unknown[]) => void, ...args: unknown[]) => queueMicrotask(() => cb(...args)),
  };
}
