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
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Tipsboard</title>
<link rel="stylesheet" href="${styleUri}" />
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
