const VAULT_FILE_ATTACHMENT_LINK_RE = /!?\[([^\]\n]*)\]\(\s*(assets[/\\]files[/\\][^) \t\n\r]+)\s*(?:\"[^\"]*\")?\)/g;

export interface ExtractedVaultAttachmentLink {
  relativePath: string;
  label: string;
}

function normalizeVaultFileAttachmentPath(raw: string): string | null {
  const normalized = raw.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/")) return null;
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) return null;
  return normalized.startsWith("assets/files/") ? normalized : null;
}

export function extractVaultFileAttachmentLinks(body: string): ExtractedVaultAttachmentLink[] {
  const out: ExtractedVaultAttachmentLink[] = [];
  let inCodeBlock = false;

  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    VAULT_FILE_ATTACHMENT_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = VAULT_FILE_ATTACHMENT_LINK_RE.exec(line)) !== null) {
      const relativePath = normalizeVaultFileAttachmentPath(match[2] ?? "");
      if (!relativePath) continue;
      out.push({
        relativePath,
        label: (match[1] ?? "").trim(),
      });
    }
  }

  return out;
}

export function noteBodyReferencesVaultFiles(body: string): boolean {
  return body.includes("assets/files/");
}
