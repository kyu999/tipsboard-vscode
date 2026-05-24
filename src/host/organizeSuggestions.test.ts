import { describe, expect, it } from "vitest";
import type { NoteSummary } from "../types/editor.js";
import { buildOrganizeSuggestions, buildBulkOrganizeSuggestions, hasRelativeMarkdownLinks } from "./organizeSuggestions.js";

function note(path: string, body: string, updatedAt = 1): NoteSummary {
  const title = body.split("\n", 1)[0] ?? "Untitled";
  return {
    path,
    filename: path.split("/").pop() ?? path,
    title,
    normalizedTitle: title.toLocaleLowerCase(),
    body,
    preview: body.split("\n").slice(1).join(" ").trim(),
    updatedAt,
    createdAt: updatedAt,
  };
}

describe("organize suggestions", () => {
  it("strongly suggests folders linked from wiki links", () => {
    const response = buildOrganizeSuggestions({
      notePath: "inbox/token-rotation.md",
      semanticEnabled: false,
      notes: [
        note("inbox/token-rotation.md", "Token Rotation\nUse [OAuth] and [Sessions]."),
        note("docs/auth/oauth.md", "OAuth\n#auth\nToken exchange."),
        note("docs/auth/sessions.md", "Sessions\n#auth\nCookie sessions."),
        note("docs/frontend/react.md", "React\n#frontend\nComponents."),
      ],
    });

    expect(response.suggestions[0]?.folder).toBe("docs/auth");
    expect(response.suggestions[0]?.reasons.some((reason) => reason.signal === "wiki-link")).toBe(true);
  });

  it("dampens duplicate-title wiki links", () => {
    const response = buildOrganizeSuggestions({
      notePath: "inbox/overview-note.md",
      semanticEnabled: false,
      notes: [
        note("inbox/overview-note.md", "Overview Note\nSee [Overview]."),
        note("docs/auth/overview.md", "Overview\nAuthentication."),
        note("docs/frontend/overview.md", "Overview\nFrontend."),
        note("docs/frontend/react.md", "React\n#frontend components."),
      ],
    });

    expect(response.suggestions[0]?.confidence).toBe("low");
  });

  it("uses concentrated tag distribution without semantic search", () => {
    const response = buildOrganizeSuggestions({
      notePath: "inbox/decision.md",
      semanticEnabled: false,
      notes: [
        note("inbox/decision.md", "ADR-003 Token Storage\n#adrs\nDecision about storage."),
        note("adr/0001.md", "ADR-001 Login\n#adrs\nDecision."),
        note("adr/0002.md", "ADR-002 Session\n#adrs\nDecision."),
        note("meeting-notes/weekly.md", "Weekly\n#meeting\nNotes."),
      ],
    });

    expect(response.suggestions[0]?.folder).toBe("adr");
    expect(response.suggestions[0]?.reasons.map((reason) => reason.signal)).toContain("tag-distribution");
    expect(response.suggestions[0]?.reasons.map((reason) => reason.signal)).toContain("title-pattern");
  });

  it("uses semantic neighbors when provided", () => {
    const response = buildOrganizeSuggestions({
      notePath: "inbox/cache.md",
      semanticEnabled: true,
      semanticNeighbors: [
        {
          path: "docs/backend/cache.md",
          title: "Cache",
          heading: "Cache",
          snippet: "stale response prevention",
          score: 0.95,
          startLine: 1,
          endLine: 3,
        },
      ],
      notes: [
        note("inbox/cache.md", "API cache\nPrevent stale responses."),
        note("docs/backend/cache.md", "Cache\nPrevent stale API responses."),
        note("docs/frontend/state.md", "State\nReact state."),
      ],
    });

    expect(response.suggestions[0]?.folder).toBe("docs/backend");
    expect(response.suggestions[0]?.reasons.map((reason) => reason.signal)).toContain("semantic-neighbor");
  });

  it("detects relative markdown links for move warnings", () => {
    expect(hasRelativeMarkdownLinks("Title\n[Spec](../docs/spec.md)\n")).toBe(true);
    expect(hasRelativeMarkdownLinks("Title\n[Site](https://example.com/spec.md)\n")).toBe(false);
  });

  it("builds bulk suggestions for every inbox note", () => {
    const response = buildBulkOrganizeSuggestions({
      semanticEnabled: false,
      notes: [
        note("inbox/alpha.md", "Alpha\n[OAuth]"),
        note("inbox/beta.md", "Beta\n#adrs"),
        note("docs/auth/oauth.md", "OAuth\n#auth"),
        note("adr/0001.md", "ADR-001\n#adrs"),
      ],
    });
    expect(response.items).toHaveLength(2);
    expect(response.items[0]?.notePath).toBe("inbox/alpha.md");
    expect(response.items[1]?.notePath).toBe("inbox/beta.md");
  });
});
