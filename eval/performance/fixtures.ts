export interface PerfNoteFixtureOptions {
  index: number;
  linkTargetIndex?: number;
  includeAttachmentLink?: boolean;
}

export function perfNoteTitle(index: number): string {
  return `Perf Note ${String(index).padStart(5, "0")}`;
}

export function perfNotePath(index: number): string {
  return `pages/perf-${String(index).padStart(5, "0")}.md`;
}

export function perfNoteBody(options: PerfNoteFixtureOptions): string {
  const title = perfNoteTitle(options.index);
  const lines = [title, "", `Body paragraph for note ${options.index}.`];
  if (options.linkTargetIndex !== undefined) {
    lines.push("", `[${perfNoteTitle(options.linkTargetIndex)}]`);
  }
  if (options.includeAttachmentLink) {
    lines.push("", "[file](assets/files/sample.pdf)");
  }
  return `${lines.join("\n")}\n`;
}
