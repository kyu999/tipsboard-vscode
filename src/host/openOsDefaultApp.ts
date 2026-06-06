import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import * as vscode from "vscode";

export type OpenOsDefaultAppDeps = {
  platform?: NodeJS.Platform;
  openExternal?: (uri: vscode.Uri) => Thenable<boolean>;
  spawn?: typeof nodeSpawn;
};

/** Open a local file with the OS default application. */
export async function openPathWithOsDefaultApp(
  fsPath: string,
  deps: OpenOsDefaultAppDeps = {},
): Promise<void> {
  const platform = deps.platform ?? process.platform;
  if (platform === "win32") {
    const spawnFn = deps.spawn ?? nodeSpawn;
    await new Promise<void>((resolve, reject) => {
      const child = spawnFn("cmd.exe", ["/d", "/s", "/c", "start", '""', fsPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      } satisfies SpawnOptions);
      child.on("error", reject);
      child.unref();
      resolve();
    });
    return;
  }

  const openExternal = deps.openExternal ?? ((uri: vscode.Uri) => vscode.env.openExternal(uri));
  const opened = await openExternal(vscode.Uri.file(fsPath));
  if (!opened) {
    throw new Error("Failed to open file with OS default application");
  }
}
