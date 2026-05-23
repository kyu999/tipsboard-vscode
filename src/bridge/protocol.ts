/** RPC payloads between Tipsboard WebView and VS Code Extension Host */

export interface RpcInbound {
  source: "tipsboard-vscode";
  kind: "rpc";
  id: string;
  method: string;
  payload?: unknown;
}

export interface RpcOutbound {
  source: "tipsboard-vscode-host";
  kind: "rpc-result";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface RpcProgressOutbound {
  source: "tipsboard-vscode-host";
  kind: "rpc-progress";
  id: string;
  method: string;
  progress: unknown;
}
