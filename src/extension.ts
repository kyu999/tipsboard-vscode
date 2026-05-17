import * as vscode from "vscode";
import { TipsboardPanel } from "./panel/TipsboardPanel.js";
import { pickVaultFolder, resolveVaultFsPath } from "./host/vaultRoot.js";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("tipsboard-vscode.open", () => {
      TipsboardPanel.render(context);
    }),
    vscode.commands.registerCommand("tipsboard-vscode.selectVaultFolder", async () => {
      const p = await pickVaultFolder();
      if (!p) return;
      TipsboardPanel.notifyVaultChanged(resolveVaultFsPath() ?? p);
      TipsboardPanel.render(context);
    }),
    vscode.commands.registerCommand("tipsboard-vscode.newNote", () => {
      TipsboardPanel.notifyCreateNote();
    }),
    vscode.commands.registerCommand("tipsboard-vscode.closeEditorTab", () => {
      TipsboardPanel.notifyCloseEditorTab();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        !e.affectsConfiguration("tipsboard-vscode.manualVaultPath") &&
        !e.affectsConfiguration("tipsboard-vscode.vaultFolder") &&
        !e.affectsConfiguration("tipsboard-vscode.maxAttachmentBytes")
      ) {
        return;
      }
      TipsboardPanel.notifyVaultChanged(resolveVaultFsPath());
    }),
  );
}

export function deactivate(): void {}
