# Changelog

All notable changes to the **Tipsboard** VS Code extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.9] - 2026-05-21

### Added

- **Attachments library** (WebView): left sidebar **paperclip** control switches `viewMode` to **`attachments`**. Table of vault files under `assets/files/` with search, per-row **open in OS default app**, **copy absolute path**, **expandable details** (relative path, size, modified time, absolute path when the vault root is known), **wiki-style links** to referencing notes, and an **unreferenced** indicator. Japanese and English strings in i18n.

### Changed

- **Non-image attachment filenames**: files under `assets/files/` are saved as **`{sanitizedOriginalStem}_{8hex}{ext}`** (no note title in the name). Existing **`file_<uuid>`** names remain valid on disk and in links.
- **`importAttachmentBuffers` RPC** returns **`{ imported, attachments }`** so the attachment list updates immediately after Shift+drop; **`getAttachmentSummaries`** refreshes the index after saves that touch vault file links.

## [0.2.8] - 2026-05-18

### Added

- **HTML export (Vault images)**: Extension Host RPC **`readAssetDataUrls`** reads `assets/images/...` from the vault and returns **`data:image/...;base64,...`** entries so exported HTML stays self-contained when opened in a normal browser.
- **HTML export (save flow)**: RPC **`exportHtml`** (`{ html, suggestedFileName }`) uses **`vscode.window.showSaveDialog`** and **`vscode.workspace.fs.writeFile`** so the destination is chosen in the native save UI and bytes are written on the host.

## [0.2.7] - 2026-05-18

### Changed

- **`createNote` / `saveNote` RPC**: host returns **`{ notePath, note }`** only; the WebView merges with **`mergeCreatedNoteIntoSnapshot`** / **`upsertSavedNote`** instead of replacing state from a full **`VaultSnapshot`**. **Rationale** — new notes and saves only need the affected row; skipping an extra **`readVault`** (every `pages/*.md` read + reorder) and shrinking **`postMessage`** reduces Extension Host I/O and bridge traffic, which helps when the vault is large or the machine is under load. Operations that truly need a whole-vault view (Kanban, **`deleteNote`**, **`importJson`**, etc.) still use full snapshots.

## [0.2.6] - 2026-05-17

### Added

- **File attachments**: Shift+drag non-image files into the editor copies them to `assets/files/` and inserts `[label](assets/files/file_<uuid><ext>)`. Executable/installer-like extensions are skipped. Maximum attachment size is **`tipsboard-vscode.maxAttachmentBytes`** (default 10 MiB; applies to images as well). Clicking an attachment link opens the file with the **OS default application** (`openVaultAsset` RPC).
- **Vault file attachment links**: `[label](assets/files/...)` now toggles between decorated preview and raw Markdown on the **caret line**, matching external links and other Tipsboard syntax (`isSyntaxActive` when the selection is inside the link).

## [0.2.5] - 2026-05-17

### Changed

- **Bundled User Guide** (JA/EN): Restructured flow (intro → UI → writing → linking → Links panel → images → title rename → shortcuts). Removed in-guide screenshots and obsolete **page icon** copy (`[Title.icon]`, card preview icons, **`Ctrl+I`** shortcut row). The images section documents **Shift+drag** import only.
- **README.md**: Fixed **Close active tab** to **`Ctrl+Alt+Shift+W` / `Cmd+Alt+Shift+W`** (was incorrectly tied to New Note). Documents sidebar **+** for new notes and clarifies macOS shortcut labels in the shortcuts table.
- **SPEC.md** (§9.2, §9.7, §9.8): Search **Enter** applies `listSearchFilter` on the card grid (does not open the first dropdown hit); sidebar **+** invokes `handleCreateNote`; image drop requires **Shift** (MIME/size limits noted).

## [0.2.4] - 2026-05-17

### Added

- **NavMemory forward stack** (`navForwardRef`) symmetric to back: **`Alt+→`**, **`Ctrl/Cmd+]`**, mouse **button 4** (typically “forward”), and **`BrowserForward` / `XF86Forward`** where the WebView delivers them.

### Changed

- **NavMemory back**: before restoring a popped state, the **current UI snapshot is pushed onto the forward stack**. **`pushNavHistory`** clears forward (branch-cut) alongside pushing back.
- **Navigation input guard**: **`INPUT` / `TEXTAREA` / `SELECT`** and **confirmation dialog open** suppress history back / forward (keyboard + mouse helpers only; card/list shortcuts unchanged).
- **Note editor startup**: CodeMirror is mounted in `useLayoutEffect` so the editor is ready before the note view paints, reducing the brief post-open input freeze.
- **WebView scrollbar**: Transparent track with a softer neutral thumb (WebKit `background-clip` gutter + Firefox `scrollbar-color`).
- **Editor tab strip**: Constrained with **`max-w-5xl`** so the row aligns with the note reading column.
- **Note editor frame**: **`tb-editor-surface`** replaces stacked `tb-card` + **`tb-reading-panel`** + **`ring`** so the body pane shows a single 1px border (closer to a VS Code editor outline). **`rounded-2xl`** matches other chrome (only the stacked borders were intentionally removed—not a move to sharper corners).
- **User Guide layout**: Matches the note reading column (**`max-w-5xl`**, **`tb-editor-surface`**) instead of **`max-w-3xl`** + **`tb-card`**. Inner inset and **`line-height`** follow CodeMirror `.cm-content` so text measure matches note pages.
- Documentation: **`README.md`** expands tabs/NavMemory, keyboard shortcuts table, screenshot checklist for marketplace assets; **bundled user guide** (`webview/src/user-guide/bundledGuide.ts`) adds a Tabs / NavMemory section and shortcut table rows for closing tabs.

### Notes

- **Mouse button 3** maps to NavMemory **back**. macOS swipe-back may **not reach** the WebView in some setups; **`mod+[` / `]`** remain the reliable pair. **`Ctrl/Cmd+]`** may **conflict with VS Code** indent globally; remap in Keyboard Shortcuts if needed.

## [0.2.3] - 2026-05-17

### Added

- **WebView tabs**: Open **notes** and **tag search** (`#tag`) in a compact tab strip under the header (list view). **Ctrl+click** (Windows/Linux) or **Cmd+click** (macOS) on internal links, tags, related-link cards, New Links, list cards, or search dropdown results opens **another tab** without a discard prompt; normal clicks keep the prior behavior (with unsaved confirmation when switching away). Duplicate paths or tags collapse to a single tab.
- **Tipsboard: Close active tab** command (`tipsboard-vscode.closeEditorTab`), **`Ctrl+Alt+Shift+W` / `Cmd+Alt+Shift+W`** when the Tipsboard panel is focused (`package.json`), and host `close-editor-tab` postMessage (same policy as new-note: ignored while focus is in a native input).
- **`webview/src/lib/editorTabs.ts`** helpers and **`webview/src/lib/editorTabs.test.ts`** (Vitest).

### Changed

- **NavMemory** (back stack) now stores **`openTabs`**, **`activeTabId`**, **`query`**, and **`showSearchResults`** so **Back** restores the tab strip and search bar state.
- **`handleSaveNote`**: renames update tab paths via `renameNotePathInTabs`; snapshot refresh and note delete prune or refocus tabs safely.
- **Tab bar UI**: Compact layout; colors aligned with existing **accent-link** / **`bg-bg-hover`** patterns (`NoteTabBar.tsx`).

### Notes

- The **last tab** cannot be closed (close control disabled; shortcut no-op). Folder change and JSON import clear tabs.

## [0.2.2] - 2026-05-17

### Added

- **Kanban**: Reorder columns by dragging a column (whole lane and header chrome; excludes card stacks and toolbar buttons). Drops use the pointer’s horizontal position versus the column to insert **before** or **after**.
- Host RPC **`reorderKanbanColumns`** (`{ boardId, columnIds }`) and `.tipsboard/kanban.json` updates with contiguous `position` values (see SPEC).

### Changed

- **Kanban**: Board columns render in **`position`** order (`KanbanBoardView.tsx`).

### Tests

- **Vitest**: `webview/src/lib/kanbanColumnReorder.ts` (+ `kanbanColumnReorder.test.ts`), extended `kanban.host.test.ts` for `reorderKanbanColumns` success, errors, card preservation, and three-column reorder.

## [0.2.1] - 2026-05-17

### Fixed

- **Sync**: Vault file watcher events now carry **changed relative paths**, **mask Tipsboard’s own RPC writes** briefly, and show the reload banner only when the **selected note’s file** changed while the editor is **unsaved or save-error**—reducing false “external change” alerts from kanban/pins or autosave races (`TipsboardPanel.ts`, `vaultFileWatchHelpers.ts`, `rpc-handler.ts`, `App.tsx`).

### Changed

- **UI**: Sync banner copy now describes **per-note** conflicts instead of the whole vault (`ja.ts`, `en.ts`).

### Added

- **Tests**: Vitest for vault watcher helpers (`vaultFileWatchHelpers.test.ts`) and WebView `vault-files-changed` handling (`vaultFilesChangedHandling.test.ts`).

## [0.2.0] - 2026-05-17

### Fixed

- **Editor**: When replacement decorations are present (tables, KaTeX display math, fenced blocks, etc.), **Arrow Up / Arrow Down** between adjacent short lines (both ≤120 characters) moves **one logical document line** at a time so list tails and prose no longer jump into distant math regions (`tipsboard-keymap.ts`).

### Added

- **Tests**: Playwright regression for the full “Math Expressions” sample ending in bullet lists (`webview/e2e/cursor-movement.spec.ts`).

## [0.1.9] - 2026-05-16

### Fixed

- **Editor**: Display math `$$…$$` detection pairs opening and closing delimiters in order and ignores delimiters inside fenced code, so a code sample and a rendered block are no longer merged into one span (fixes Arrow Up jumping to the wrong block) (`tipsboard-katex-math.ts`).
- **Editor**: Arrow Up from the line below display math advances through an intervening blank line instead of skipping it (`tipsboard-keymap.ts`).
- **Editor**: Arrow Up / Arrow Down through fenced Markdown code blocks moves one document line per key press, avoiding jumps across tall rendered regions into another fence (`tipsboard-keymap.ts`).
- **Editor**: Arrow Up from prose below fenced math examples now steps through the intervening prose/blank/heading lines instead of jumping into an earlier fenced block (`tipsboard-keymap.ts`).

### Added

- **Tests**: Additional Playwright cursor scenarios for multi-block rendered math, tall display math with a blank spacer, fenced code below rendered math, and prose below fenced math examples (`webview/e2e/cursor-movement.spec.ts`).

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