import * as vscode from "vscode";
import type { RpcInbound } from "../bridge/protocol.js";
import { handleRpcInbound } from "../bridge/rpc-handler.js";

function getNonce(): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    out += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return out;
}

export class TipsboardPanel {
  public static current: TipsboardPanel | undefined;
  public static readonly viewType = "tipsboard-vscode.main";

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private watchedVaultFsPath: string | undefined;
  private readonly vaultWatchers: vscode.FileSystemWatcher[] = [];
  private vaultChangeTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.context = context;

    const sub = this.panel.webview.onDidReceiveMessage((msg) => {
      const m = msg as RpcInbound;
      if (m?.source === "tipsboard-vscode" && m.kind === "rpc") {
        void handleRpcInbound(this.panel.webview, m, this);
      }
    });

    this.panel.onDidDispose(() => {
      TipsboardPanel.current = undefined;
      this.disposeVaultWatchers();
      sub.dispose();
    });

    this.setVaultRoots(undefined);
    this.panel.webview.html = this.buildHtml();
  }

  setVaultRoots(vaultFsPath: string | undefined): void {
    const roots = [this.context.extensionUri];
    if (vaultFsPath) {
      roots.push(vscode.Uri.file(vaultFsPath));
    }
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: roots,
    };
    this.configureVaultWatchers(vaultFsPath);
  }

  private configureVaultWatchers(vaultFsPath: string | undefined): void {
    if (this.watchedVaultFsPath === vaultFsPath) return;

    this.disposeVaultWatchers();
    this.watchedVaultFsPath = vaultFsPath;

    if (!vaultFsPath) return;

    const vaultRoot = vscode.Uri.file(vaultFsPath);
    const patterns = ["pages/*.md", ".tipsboard/kanban.json", ".tipsboard/pins.json"];
    for (const pattern of patterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vaultRoot, pattern),
      );
      watcher.onDidCreate(() => this.scheduleVaultFilesChanged());
      watcher.onDidChange(() => this.scheduleVaultFilesChanged());
      watcher.onDidDelete(() => this.scheduleVaultFilesChanged());
      this.vaultWatchers.push(watcher);
    }
  }

  private disposeVaultWatchers(): void {
    if (this.vaultChangeTimer) {
      clearTimeout(this.vaultChangeTimer);
      this.vaultChangeTimer = undefined;
    }
    while (this.vaultWatchers.length > 0) {
      this.vaultWatchers.pop()?.dispose();
    }
  }

  private scheduleVaultFilesChanged(): void {
    if (this.vaultChangeTimer) clearTimeout(this.vaultChangeTimer);
    this.vaultChangeTimer = setTimeout(() => {
      this.vaultChangeTimer = undefined;
      void this.panel.webview.postMessage({
        source: "tipsboard-vscode-host",
        kind: "event",
        event: "vault-files-changed",
      });
    }, 250);
  }

  /**
   * Updates WebView file access roots and asks the UI to reload the vault snapshot.
   * Use when the vault path changed from outside the WebView RPC flow (command palette,
   * settings editor, etc.) while the panel is already open.
   */
  static notifyVaultChanged(vaultFsPath: string | undefined): void {
    const inst = TipsboardPanel.current;
    if (!inst) return;
    inst.setVaultRoots(vaultFsPath);
    void inst.panel.webview.postMessage({
      source: "tipsboard-vscode-host",
      kind: "event",
      event: "vault-root-changed",
    });
  }

  static render(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (TipsboardPanel.current) {
      TipsboardPanel.current.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      TipsboardPanel.viewType,
      "Tipsboard",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );
    TipsboardPanel.current = new TipsboardPanel(panel, context);
  }

  private buildHtml(): string {
    const { webview } = this.panel;
    const ext = this.context.extensionUri;
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(ext, "dist", "media", "webview.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(ext, "dist", "media", "webview.css"));
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}'`,
      `font-src ${webview.cspSource} data:`,
      `img-src ${webview.cspSource} https: http: data:`,
      `worker-src ${webview.cspSource} blob:`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="ja" style="height:100%;width:100%;margin:0;padding:0;box-sizing:border-box">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Tipsboard</title>
<link rel="stylesheet" href="${styleUri}" />
</head>
<body style="height:100%;width:100%;margin:0;padding:0;overflow:hidden;box-sizing:border-box">
<div id="root" style="height:100%;width:100%;margin:0;padding:0;box-sizing:border-box"></div>
<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
