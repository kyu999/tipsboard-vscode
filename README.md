# Tipsboard

A Markdown wiki and personal knowledge management workspace for VS Code.

Create connected notes with wiki-style links, backlinks, tags, and rich Markdown editing directly inside your editor.

Tipsboard helps developers, researchers, and technical writers build a searchable, linkable knowledge base using plain Markdown files.

No sign-in. No proprietary database.

![Tipsboard Overview](https://raw.githubusercontent.com/kyu999/tipsboard-vscode/main/assets/vscode/marketplace/hero-overview.png)

---

## Why Tipsboard?

Tipsboard is designed for people who already live inside VS Code and want a connected Markdown knowledge workspace without switching tools.

Build a searchable personal wiki using plain Markdown files, connect ideas with backlinks and tags, and explore relationships between notes directly inside your editor.

Tipsboard combines:

- wiki-style Markdown notes
- backlinks and two-hop discovery
- rich Markdown editing
- Kanban organization
- image embedding and preview
- English and Japanese UI

Everything stays compatible with your existing Markdown workflow and works naturally with Git and external backups.

---

## Features

### Connected Markdown Notes

Create notes inside `pages/*.md` and connect them with wiki-style links.

```md
[Project Ideas]
[Daily Notes]
#research
```

Tipsboard automatically shows:

- outgoing links
- backlinks
- two-hop related notes
- suggested new links

This makes it easy to navigate and grow a connected knowledge base over time.

---

### Rich Markdown Editing

![Rich Markdown Editing](https://raw.githubusercontent.com/kyu999/tipsboard-vscode/main/assets/vscode/marketplace/editor-rich-markdown.png)

Supported features include:

- GitHub Flavored Markdown
- Mermaid diagrams
- tables
- KaTeX-style math rendering
- internal link autocomplete
- tags
- image embeds

---

### Knowledge Discovery

![Knowledge Discovery](https://raw.githubusercontent.com/kyu999/tipsboard-vscode/main/assets/vscode/marketplace/related-notes.png)

Tipsboard helps you discover relationships between notes as your knowledge base grows.

Explore:

- backlinks
- shared references
- related pages
- two-hop note relationships
- suggested new links

The experience is inspired by connected-note and personal knowledge management workflows.

---

### Local Markdown Files

![Vault Structure](https://raw.githubusercontent.com/kyu999/tipsboard-vscode/main/assets/vscode/marketplace/vault-structure.png)

Tipsboard stores notes as ordinary Markdown files on disk.

```txt
pages/*.md
assets/images/*
.tipsboard/kanban.json
```

Works naturally with:

- Git
- Dropbox
- Syncthing
- external backup systems
- existing Markdown workflows

No lock-in or proprietary storage format.

While the Tipsboard panel is open, changes made **outside** Tipsboard (another editor, Git, or a sync tool) to `pages/*.md`, `.tipsboard/kanban.json`, or `.tipsboard/pins.json` are picked up automatically: the panel refreshes from disk when you have **no unsaved edits** in the Tipsboard editor. If you do have unsaved edits, a notice appears with **Reload**; choosing it asks to discard unsaved changes, then reloads.

---

### Editor Tabs and Navigation

![Editor Nav Memory](https://raw.githubusercontent.com/kyu999/tipsboard-vscode/main/assets/vscode/marketplace/editor-tabs-nav-memory.png)

In **list** view, a tab strip under the header holds open **notes** and **tag searches** (`#tag`). **Cmd/Ctrl-click** links, tags, or list/search hits opens another tab without the unsaved-changes prompt; normal clicks still confirm when needed. Duplicate note paths or tags share one tab; the last tab cannot be closed.

**NavMemory** (Tipsboard-only back/forward—not VS Code editor history) restores tabs, view mode, and search state. See **[Keyboard Shortcuts](#keyboard-shortcuts)** and **Commands** for keys, mouse thumb buttons, and **Tipsboard: Close active tab**.

---

### Kanban Boards

![Kanban Board](https://raw.githubusercontent.com/kyu999/tipsboard-vscode/main/assets/vscode/marketplace/kanban-board.png)

Organize projects and workflows visually using built-in Kanban boards.

Boards are stored in:

```txt
.tipsboard/kanban.json
```

Moving cards updates board metadata without modifying note contents.

Within a column, drag a card and drop it on another card’s **top half** to place it above, or **bottom half** to place it below; drop on the empty area below the card list to move to the **end** of that column (unchanged behavior for trailing space).

---

### Wiki brackets after renaming a note

![Confirm updating wiki link labels after a title changes](https://raw.githubusercontent.com/kyu999/tipsboard-vscode/main/assets/vscode/marketplace/rewrite_internal_link.png)

After you edit the **opening title** and save, Tipsboard **may ask** whether to rewrite other notes’ **`[ … ]`** wiki links for consistency—not **`[Label](path)`** markdown. Confirm to apply in order; cancel to skip.

---

### Built-in User Guide

![Built-in User Guide](https://raw.githubusercontent.com/kyu999/tipsboard-vscode/main/assets/vscode/marketplace/user-guide.png)

Tipsboard includes an in-app user guide covering:

- syntax
- shortcuts (including tabs, NavMemory navigation, closing tabs)
- onboarding
- editor behavior
- vault structure

Use the book icon in the panel to open it anytime.

---

### Image Drag-and-Drop, Preview, and Zoom

![Insert Image with Shift Drag and Drop](https://raw.githubusercontent.com/kyu999/tipsboard-vscode/main/assets/vscode/marketplace/insert_image.png)

Hold `Shift` while dropping an image file into the editor to insert it into the note.
This is easy to miss: a normal drop is ignored so that accidental file drops do not modify your Markdown.

Click embedded images to open a large preview overlay.

Supports:

- mouse wheel zoom
- trackpad pinch
- `+` / `-` zoom
- `0` to reset zoom

---

## Getting Started

1. In VS Code, open **Extensions** (`Cmd+Shift+X` on macOS, `Ctrl+Shift+X` on Windows/Linux), search for **Tipsboard**, then choose **Install**
2. Open a folder in VS Code (this folder is your vault)
3. Open the Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux) and run:

```txt
Tipsboard: Open
```

![Open Tipsboard from the Command Palette](https://raw.githubusercontent.com/kyu999/tipsboard-vscode/main/assets/vscode/marketplace/command-palette-open.png)

The folder you have open in VS Code becomes your Tipsboard vault automatically.

To use a different folder as your vault, run:

```txt
Tipsboard: Select Vault Folder...
```

---

## Vault Structure

```txt
pages/*.md
assets/images/*
.tipsboard/kanban.json
```

| Path | Purpose |
|---|---|
| `pages/*.md` | Markdown notes |
| `assets/images/*` | Embedded images |
| `.tipsboard/kanban.json` | Kanban board state |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+L` | Open note grid |
| `Ctrl+Shift+K` | Open Kanban |
| `Ctrl+N` (**mac:** `Cmd+N`) | Create note (while the Tipsboard panel is focused; otherwise VS Code keeps this for New File). The sidebar **+** button does the same. |
| `Alt+←` / `Ctrl+[` (**mac:** `⌥←` / `⌘[` ) | Navigate **back** in Tipsboard (**NavMemory**; skips native inputs and discard dialogs). |
| `Alt+→` / `Ctrl+]` (**mac:** `⌥→` / `⌘]` ) | Navigate **forward** in Tipsboard when available; **may conflict** with IDE indent elsewhere—override in Keyboard Shortcuts if needed. |
| Mouse button 3 / 4 (typ.) | Thumb **Back** / **Forward** mapped to Tipsboard NavMemory when the panel receives browser events |
| `Ctrl+Alt+Shift+W` (**mac:** `⌘⌥⇧W` ) | **Close active tab** (Tipsboard panel focused; skipped in native `<input>`) |

Commands such as **Tipsboard: New Note** remain available regardless of conflicting global keys.

---

## Commands

| Command | Description |
|---|---|
| `Tipsboard: Open` | Open or focus the Tipsboard panel |
| `Tipsboard: Select Vault Folder...` | Choose a vault directory |
| `Tipsboard: New Note` | Create a note (also bound to Ctrl/Cmd+N while the Tipsboard panel is focused) |
| `Tipsboard: Close active tab` | Close the active Tipsboard tab (also bound to `Ctrl+Alt+Shift+W` / macOS `Cmd+Alt+Shift+W`; blocked when only one tab remains) |

---

## Settings

| Setting | Description |
|---|---|
| `tipsboard-vscode.vaultFolder` | Vault folder for multi-root workspaces |
| `tipsboard-vscode.manualVaultPath` | Explicit vault path override |

---

## Which Folder Is the Vault?

| Situation | Vault Root |
|---|---|
| Single-folder workspace | Workspace folder |
| Multi-root workspace | `tipsboard-vscode.vaultFolder` |
| Manual override | `tipsboard-vscode.manualVaultPath` |

If `manualVaultPath` is set, it overrides the workspace folder until cleared.

---

## Requirements

- Visual Studio Code 1.85.0 or later

---

## Troubleshooting

### Vault Looks Incorrect

Clear or edit:

```txt
tipsboard-vscode.manualVaultPath
```

The panel reloads automatically when the setting changes.

---

### Blank Panel

With the panel focused, run:

```txt
Developer: Open Webview Developer Tools
```

Then inspect the console for errors.

---

## Development

Additional documentation:

- `DEVELOPMENT.md`

---

## Release Notes

See:

```txt
CHANGELOG.md
```

---

## License

Apache License 2.0.

See the `LICENSE` and `NOTICE` files included in this package.