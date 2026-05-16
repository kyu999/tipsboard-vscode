export interface IconSyntax {
  title: string;
  count: number;
}

export function parseIconSyntax(raw: string): IconSyntax | null {
  const match = raw.trim().match(/^(.+?)\.icon(?:\*(\d+))?$/);
  if (!match) return null;
  const title = match[1]?.trim() ?? "";
  if (!title) return null;
  const count = Math.max(1, Number(match[2] ?? "1"));
  return { title, count: Number.isFinite(count) ? count : 1 };
}

export function formatIconSyntax(title: string, count = 1): string {
  const suffix = count > 1 ? `*${count}` : "";
  return `[${title}.icon${suffix}]`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
