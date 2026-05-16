# Tipsboard (VS Code extension) — developer notes

End-user documentation is in [README.md](README.md).

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

`npm run package` runs `vscode:prepublish`, then writes a trimmed `package.json` (no `scripts` / `devDependencies` / `private`) only for `vsce package`, so the `.vsix` does not advertise the toolchain. The working copy is restored afterward.

`.vscodeignore` excludes `webview/`, `src/`, `out/`, `media/`, `docs/`, `docs_wiki/`, dev markdown, lockfiles, and test maps from the packaged VSIX.

## Spec

- [`docs_wiki/SPEC.md`](docs_wiki/SPEC.md)

## WebView blank screen (debugging)

1. Focus the Tipsboard panel and open **Developer: Open Webview Developer Tools**.
2. Confirm CSP allows scripts: [`src/panel/TipsboardPanel.ts`](src/panel/TipsboardPanel.ts) should include `webview.cspSource` in `script-src`.
3. If you see `process is not defined`, verify [`webview/src/process-shim.ts`](webview/src/process-shim.ts) loads before the app entry and Vite `define` sets `process.env.NODE_ENV`.
4. Remote fonts and CSS are often blocked in WebViews; the UI falls back to system fonts.

## Tests

```bash
npm test
```

Runs Vitest for extension-host vault I/O and related code.
