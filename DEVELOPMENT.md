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

```bash
npm run test:webview:e2e
```

Runs Playwright against a Vite-served WebView test page for browser-level editor behavior such as cursor movement through decorated CodeMirror content. If Playwright browsers are not installed yet, run `npx playwright install chromium` once.
