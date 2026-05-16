# Changelog

All notable changes to the **Tipsboard** VS Code extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.3] - 2026-05-17

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
