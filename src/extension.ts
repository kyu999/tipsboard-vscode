import * as vscode from "vscode";
import { TipsboardPanel } from "./panel/TipsboardPanel.js";
import { clearSemanticProviderCache } from "./host/semanticProviderFactory.js";
import { downloadAndInstallSemanticRuntime, installSemanticRuntimeFromFile } from "./host/semanticRuntime.js";
import {
  readSemanticSettings,
  resolveSemanticModelCacheDir,
  semanticConfigurationPrefix,
} from "./host/semanticSettings.js";
import { pickVaultFolder, resolveVaultFsPath } from "./host/vaultRoot.js";

export function activate(context: vscode.ExtensionContext): void {
  const semanticRuntimeOptions = () => ({
    extensionVersion: (context.extension.packageJSON as { version?: string }).version ?? "dev",
    globalStoragePath: context.globalStorageUri.fsPath,
    runtimeDownloadBaseUrl: readSemanticSettings().runtimeDownloadBaseUrl,
  });

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
    vscode.commands.registerCommand("tipsboard-vscode.downloadSemanticRuntime", async () => {
      await downloadAndInstallSemanticRuntime(semanticRuntimeOptions());
      clearSemanticProviderCache();
    }),
    vscode.commands.registerCommand("tipsboard-vscode.installSemanticRuntime", async () => {
      await installSemanticRuntimeFromFile(semanticRuntimeOptions());
      clearSemanticProviderCache();
    }),
    vscode.commands.registerCommand("tipsboard-vscode.revealSemanticModelCache", async () => {
      const settings = readSemanticSettings();
      const defaultCacheDir = vscode.Uri.joinPath(context.globalStorageUri, "semantic-models").fsPath;
      const cacheDir = resolveSemanticModelCacheDir(settings, defaultCacheDir);
      const cacheUri = vscode.Uri.file(cacheDir);
      await vscode.workspace.fs.createDirectory(cacheUri);
      await vscode.commands.executeCommand("revealFileInOS", cacheUri);
      void vscode.window.showInformationMessage(
        settings.allowRemoteModels
          ? `Semantic model cache: ${cacheDir}`
          : `Semantic model cache (offline / no Hub): ${cacheDir}`,
      );
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(semanticConfigurationPrefix())) {
        clearSemanticProviderCache();
        return;
      }
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
