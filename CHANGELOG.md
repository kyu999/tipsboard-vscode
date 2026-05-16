# Changelog

All notable changes to the **Tipsboard** VS Code extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.9] - 2026-05-16

### Fixed

- **Editor**: Display math `$$…$$` detection pairs opening and closing delimiters in order and ignores delimiters inside fenced code, so a code sample and a rendered block are no longer merged into one span (fixes Arrow Up jumping to the wrong block) (`tipsboard-katex-math.ts`).
- **Editor**: Arrow Up from the line below display math advances through an intervening blank line instead of skipping it (`tipsboard-keymap.ts`).
- **Editor**: Arrow Up / Arrow Down through fenced Markdown code blocks moves one document line per key press, avoiding jumps across tall rendered regions into another fence (`tipsboard-keymap.ts`).

### Added

- **Tests**: Additional Playwright cursor scenarios for multi-block rendered math, tall display math with a blank spacer, and fenced code below rendered math (`webview/e2e/cursor-movement.spec.ts`).

## [0.1.8] - 2026-05-16

### Fixed

- **Editor**: Around **display-mode math** (`$$…$$`, `\[…\]`) rendered as KaTeX widgets, **Arrow Up / Arrow Down** now advances **one logical markdown line** at a time instead of jumping past the whole block. Horizontal movement remains **one character** at a time (`tipsboard-keymap.ts`).

### Added

- **Tests**: Vitest fixtures for the editor cursor harness (`webview/src/editor/tipsboard-cursor-movement.test.ts`).
- **Tests**: Playwright E2E for the WebView editor only (`npm run test:webview:e2e`): `webview/cursor-test.html`, `webview/src/editor/cursor-test-main.ts`, `webview/e2e/cursor-movement.spec.ts` (decorated markdown, tables, fenced blocks, wrapping, display math).

## [0.1.7] - 2026-05-16

### Added

- **Tipsboard: New Note** command and **Ctrl/Cmd+N** keybinding while the Tipsboard webview is active (`activeWebviewPanelId`), replacing the in-webview `document` handler so VS Code no longer opens a blank file instead.
- **+** button in the left sidebar below KANBAN to create a note.
- Unit tests for i18n **language resolution** (`webview/src/shared/i18n/languageResolution.test.ts`).

### Changed

- Note **actions** as subtle **icon-only controls** floating on the editor card (pin / export HTML / delete), without narrowing the `max-w-5xl` content column.
- **Default i18n fallback** is **English** when neither `localStorage` nor the browser requests `ja` or `en` as the primary language (unchanged: saved preference and `ja`/`en` browser locales still win).
- When **opening another note** from the in-page editor (e.g. **related link cards** at the bottom), the note scroll area **scrolls to the top** so the new page is visible from the start.

## [0.1.6] - 2026-05-16

### Added

- After saving when the **title changes**, optional confirmation before rewriting matching inbound wiki **`[Title]`** text (excluding **`[Label](path)`**). Same note included when its body still has old brackets.

### Fixed

- **`getSnapshot()`** before prompting so stale in-panel note bodies miss fewer matches.
- **`diskCommittedTitle`** paths normalized to **`/`**.

## [0.1.5] - 2026-05-16

### Changed

- WebView: refreshed theme and link colors; adjusted layout spacing and shell padding.
- Kanban: clearer column surface vs. cards.
- Webview fills the panel edge-to-edge (no default margin on `html` / `body` / `#root`).

## [0.1.4] - 2026-05-16

### Added

- Detect external changes to core vault files (`pages/*.md`, `.tipsboard/kanban.json`, `.tipsboard/pins.json`) while the Tipsboard panel is open, via Extension Host file watchers (`TipsboardPanel`), debounced `vault-files-changed` events to the WebView, and snapshot refresh from `App.tsx`.
- When the in-panel editor has **unsaved** changes, defer auto-refresh and show a banner with **Reload**; reloading runs the existing discard confirmation, then replaces the snapshot and remounts the editor if the open note body changed on disk.

## [0.1.3] - 2026-05-16

### Documentation

- README **Getting Started** now leads with installing from VS Code **Extensions** (search “Tipsboard”) before opening the vault and running **Tipsboard: Open**.

## [0.1.2] - 2026-05-16

### Added

- Kanban: **reorder cards within a column** by dragging a card and dropping it on another card (top half inserts before; bottom half after) or on empty column space (append).
- Automated tests for `moveKanbanNote` host behavior (`kanban.host.test.ts`) and drop index calculation (`kanbanDropPosition.test.ts`).

## [0.1.1] - 2026-05-16

### Changed

- README screenshot links now target this repository’s `assets/vscode/marketplace/` on GitHub.
- `package.json` `homepage` and `repository` URLs point to `kyu999/tipsboard-vscode`.

### Documentation

- README documents **Shift** + drop for image insertion and uses `insert_image.png`.
- Broaden `.gitignore` (for example `.vscode/`, `out/`, `media/`, `.env*`) for open-source hygiene.
- Remove the obsolete `docs/marketplace/` screenshot checklist and duplicate hero asset.

## [0.1.0] - 2026-05-16

### Added

- Initial Marketplace-oriented README and **CHANGELOG**.
- **Tipsboard: Open** — WebView panel with note grid, editor, Kanban, settings, and built-in user guide.
- **Tipsboard: Select Vault Folder...** — persist vault path (`tipsboard-vscode.manualVaultPath`).
- Vault layout: `pages/*.md`, `assets/images/`, `.tipsboard/kanban.json`; bridge RPC for file I/O from the WebView.
- Markdown editor (CodeMirror): internal links, tags, tables, Mermaid, KaTeX math, image widgets, lightbox preview with wheel / keyboard zoom.
- Search, pins, backlinks / two-hop **Links** panel, HTML export, JSON import/export, EN/JA UI.

### Fixed

- Resolve **`manualVaultPath`** before single-folder workspace so changing the vault from the picker works.
- Notify the WebView to **reload the snapshot** when the vault is changed from the command palette or settings (`vault-root-changed` event).
- Clear resolved **asset URL cache** when the vault path changes.
- Avoid treating **embedded image** clicks as link navigation (`.cm-image-widget`).
- Restore missing **`openImageLightbox`** import in `tipsboard-decorations.ts`.