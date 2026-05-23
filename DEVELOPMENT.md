# Tipsboard (VS Code extension) — developer notes

End-user documentation is in [README.md](README.md).

## GitHub Pages (project site)

The marketing landing page lives in [`docs/`](docs/) (`index.html`, `styles.css`, `icon.png`) and is excluded from the packaged VSIX via `.vscodeignore`.

To publish it: **GitHub repo → Settings → Pages → Build and deployment → Deploy from a branch**, choose **`main`** and folder **`/docs`**. The site is served at `https://kyu999.github.io/tipsboard-vscode/` (replace the owner segment if the repo moves). A `docs/.nojekyll` file disables Jekyll so static files are served as-is.

`docs/icon.png` is a 128px export of the repo root `icon.png` (favicon and header/footer logo). If you change the marketplace icon, re-export with e.g. `sips -Z 128 icon.png --out docs/icon.png`.

## Prerequisites

- **Node.js 22+** recommended

```bash
cd tipsboard-vscode
npm install
npm run compile
npm install --prefix webview && npm run build --prefix webview
```

If `~/.npm` permission errors appear, set e.g. `NPM_CONFIG_CACHE=/tmp/npm-cache`.

Open this folder in VS Code and use **Run Tipsboard Extension** (F5), or run **Tipsboard: Open** after a build.

## Build outputs

| Path | Contents |
| --- | --- |
| `dist/extension/` | Extension host (compiled TypeScript) |
| `dist/media/` | WebView bundle (`webview.js`, `webview.css` from Vite) |

## Package a `.vsix`

```bash
npm run package
```

`npm run package` runs `vscode:prepublish` without bundling the semantic runtime, then writes a trimmed `package.json` (no `scripts` / `devDependencies` / `private`) only for `vsce package`, so the `.vsix` does not advertise the toolchain. The working copy is restored afterward.

Semantic search uses separate runtime packs. CI uploads a small common VSIX plus platform-specific runtime zip artifacts:

```bash
npm run package -- --out tipsboard-vscode-<version>.vsix
npm run prepare:semantic-pack -- --target win32-x64 --out tipsboard-semantic-runtime-win32-x64.zip
npm run prepare:semantic-pack -- --target darwin-arm64 --out tipsboard-semantic-runtime-darwin-arm64.zip
npm run prepare:semantic-pack -- --target linux-x64 --out tipsboard-semantic-runtime-linux-x64.zip
```

When semantic search is first used, Tipsboard can download the matching runtime pack from GitHub Releases or install a browser-downloaded zip via **Tipsboard: Install Semantic Runtime from File...**. Runtime packs are published for Windows x64, Linux x64, and Apple Silicon macOS. Set `ONNXRUNTIME_NODE_INSTALL=skip` in CI so Linux runtime packs do not include CUDA provider binaries.

The regular CI workflow uploads runtime packs as GitHub Actions artifacts for testing. The automatic in-extension download uses GitHub Release assets, so publish a release or run **Release Assets** for an existing tag before expecting `releases/latest/download/tipsboard-semantic-runtime-<target>.zip` to work.

`.vscodeignore` excludes `webview/`, `src/`, `out/`, `media/`, `docs/`, `docs_wiki/`, dev markdown, lockfiles, and test maps from the packaged VSIX.

## Spec

- [`docs_wiki/SPEC.md`](docs_wiki/SPEC.md)

Marketplace-facing screenshots (README links use `raw.githubusercontent.com/.../assets/vscode/marketplace/`) stay in [`assets/vscode/marketplace/`](assets/vscode/marketplace/) in this repo. The bundled user guide pulls the same files over **https** inside the WebView.

## WebView blank screen (debugging)

1. Focus the Tipsboard panel and open **Developer: Open Webview Developer Tools**.
2. Confirm CSP allows scripts: [`src/panel/TipsboardPanel.ts`](src/panel/TipsboardPanel.ts) should include `webview.cspSource` in `script-src`.
3. If you see `process is not defined`, verify [`webview/src/process-shim.ts`](webview/src/process-shim.ts) loads before the app entry and Vite `define` sets `process.env.NODE_ENV`.
4. Remote fonts and CSS are often blocked in WebViews; the UI falls back to system fonts.

## Tests

```bash
npm test
```

Runs Vitest for extension-host vault I/O, WebView domain logic, and lightweight editor fixtures.

### Semantic search evaluation

仕様と評価方式の詳細は [`docs_wiki/SEMANTIC_SEARCH.md`](docs_wiki/SEMANTIC_SEARCH.md) を参照。

```bash
npm run eval:semantic
npm run eval:semantic -- --dataset mldr
npm run eval:semantic -- --help
```

Runs a local-only semantic search evaluation against a seeded Tipsboard vault converted from a public retrieval dataset. This is intentionally not part of CI because it uses the real Transformers.js embedding runtime, may download model files on first run, and depends on local CPU/network performance.

The semantic-eval Vitest config sets `testTimeout: 0` (no limit). MLDR with the default 5,000-document cap and full query set often takes well over 10 minutes on CPU; let the run finish. For a quicker smoke run, pass `--limit-queries 50` and/or `--limit-docs 500`. If you previously cached a larger MLDR slice (e.g. 5,000 docs), limits are applied when reading that cache; check the log for `Loaded dataset cache with fetch limits` and expect far fewer index chunks than a full run.

Pass options after `--` (CLI flags are preferred over environment variables):

```bash
npm run eval:semantic -- -d jmteb-lite-mldr
npm run eval:semantic -- --dataset mldr --mode hybrid
npm run eval:semantic -- --model Xenova/bge-m3 --dataset mldr
npm run eval:semantic:mldr
```

Dataset aliases: `mldr`, `scifact`.

By default the evaluation uses JMTEB-lite MLDR-Retrieval, converts its corpus to wiki-like `pages/*.md`, and scores search results against the dataset qrels with `nDCG@10`, `Recall@10`, and `MRR@10`. The fetched dataset rows and model files are cached under `eval/.cache/`.

The converted Tipsboard vault for manual UI inspection is always written under:

```text
eval/.cache/vaults/<datasetId>/
```

Examples:

- default / Japanese long body text: `eval/.cache/vaults/jmteb-lite-mldr/`
- English scientific claims: `eval/.cache/vaults/beir-scifact/`

After `npm run eval:semantic`, open that folder in Tipsboard with **Select Vault Folder**. The run also rebuilds `.tipsboard/semantic/` there so semantic search works immediately.

For a Japanese long-document dataset closer to wiki body search, use `npm run eval:semantic -- --dataset mldr` or `npm run eval:semantic:mldr`. The first fetch caps MLDR at 5,000 corpus documents (about half of the full set) with retries and pacing to reduce Hugging Face `datasets-server` 502 errors. Use `--full-dataset` for all 10,000 docs once you have a stable network; the JSON cache is reused on later runs unless you pass `--refresh-dataset`.

When the run finishes, a JSON report is written under `eval/.cache/reports/`:

- `semantic-eval-<dataset>-<timestamp>.json` — full run (summary, per-query metrics, ranked and relevant document ids)
- `latest.json` — overwritten each run for quick inspection

Override the report path with `TIPSBOARD_SEMANTIC_EVAL_REPORT_PATH` if needed.

More CLI examples:

```bash
npm run eval:semantic -- --dataset scifact
npm run eval:semantic -- --refresh-dataset --dataset mldr
npm run eval:semantic:models -- --dataset mldr
```

Environment variables still work for automation (`TIPSBOARD_SEMANTIC_EVAL_*`) but are optional when using the CLI wrapper.

Semantic search defaults to **Hub download** when the model cache is missing (`allowRemoteModels` default `true`). For closed networks: run `npm run prepare:semantic-model-cache` on a build machine, deploy the resulting `dist/semantic-model-cache/` folder, set `allowRemoteModels` to `false`, and set `modelCachePath` to that folder (not an individual model subfolder). Install runtime via `importedPath` or zip (not GitHub auto-download). Eval offline check: `TIPSBOARD_SEMANTIC_EVAL_ALLOW_REMOTE_MODELS=0` or `--model-cache-dir dist/semantic-model-cache`. See [`docs_wiki/SEMANTIC_SEARCH.md`](docs_wiki/SEMANTIC_SEARCH.md).

The vault path is printed at the end of the run and stored in `eval/.cache/reports/latest.json` as `vaultPath`.

```bash
npm run test:webview:e2e
```

Runs Playwright against a Vite-served WebView test page for browser-level editor behavior such as cursor movement through decorated CodeMirror content. If Playwright browsers are not installed yet, run `npx playwright install chromium` once.
