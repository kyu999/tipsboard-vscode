export function extractTitle(body: string): string {
  if (!body || !body.trim()) return "Untitled";
  const firstLine = body.split("\n", 1)[0]!.trim();
  return firstLine || "Untitled";
}

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFC")
    .trim()
    .replace(/[\s\u3000]+/g, " ")
    .replace(/[A-Z]/g, (char) => char.toLowerCase());
}
