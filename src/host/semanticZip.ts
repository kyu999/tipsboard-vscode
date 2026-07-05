import path from "node:path";

import type AdmZip from "adm-zip";

export function validateZipEntries(zip: AdmZip): void {
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/\\/g, "/");
    if (path.isAbsolute(name) || name.split("/").includes("..")) {
      throw new Error(`Unsafe semantic runtime zip entry: ${entry.entryName}`);
    }
  }
}
