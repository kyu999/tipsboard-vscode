import { describe, expect, it } from "vitest";
import {
  emptyCanvasMermaidTemplate,
  isCanvasMermaidFile,
  parseCanvasMermaid,
  serializeCanvasMermaid,
} from "./canvasMermaid.js";
import { CANVAS_MERMAID_HEADER } from "./canvasTypes.js";

const SAMPLE = `${CANVAS_MERMAID_HEADER}
flowchart TD

%% node:p_sales problem
%% description:四半期目標未達
p_sales["売上が低い"]

%% node:p_customers problem
p_customers["新規顧客が少ない"]

%% node:p_seo problem
p_seo["SEOが弱い"]

%% node:s_articles solution
s_articles["記事を増やす"]

p_sales -->|because| p_customers
p_customers -->|because| p_seo
p_seo -->|solved_by| s_articles
`;

describe("parseCanvasMermaid", () => {
  it("parses nodes, descriptions, and edges", () => {
    const result = parseCanvasMermaid(SAMPLE);
    expect(result.errors).toEqual([]);
    expect(result.document.nodes).toHaveLength(4);
    expect(result.document.nodes.find((n) => n.id === "p_sales")?.description).toBe("四半期目標未達");
    expect(result.document.edges).toHaveLength(3);
    expect(result.document.edges.find((e) => e.from === "p_customers" && e.to === "p_seo")).toMatchObject({
      type: "because",
    });
  });

  it("rejects legacy JSON", () => {
    const result = parseCanvasMermaid('{"version":1,"nodes":[],"edges":[]}');
    expect(result.errors[0]?.message).toContain("v0.3.12");
    expect(result.document.nodes).toEqual([]);
  });

  it("reports missing header", () => {
    const result = parseCanvasMermaid("flowchart TD\np1[\"test\"]");
    expect(result.errors.some((e) => e.message.includes("Missing header"))).toBe(true);
  });
});

describe("serializeCanvasMermaid", () => {
  it("round-trips sample document", () => {
    const parsed = parseCanvasMermaid(SAMPLE);
    const serialized = serializeCanvasMermaid(parsed.document);
    const again = parseCanvasMermaid(serialized);
    expect(again.errors).toEqual([]);
    expect(again.document).toEqual(parsed.document);
  });

  it("round-trips status and decision metadata", () => {
    const doc = {
      version: 1 as const,
      nodes: [
        { id: "p1", type: "problem" as const, title: "Root", status: "root_cause_candidate" as const },
        {
          id: "s1",
          type: "solution" as const,
          title: "Fix",
          decision: "accepted" as const,
          impact: "high" as const,
        },
      ],
      edges: [{ id: "e1", from: "p1", to: "s1", type: "solved_by" as const }],
    };
    const serialized = serializeCanvasMermaid(doc);
    expect(serialized).toContain("%% status:root_cause_candidate");
    expect(serialized).not.toContain("%% decision:");
    expect(serialized).toContain("%% impact:high");
    const parsed = parseCanvasMermaid(serialized);
    expect(parsed.errors).toEqual([]);
    expect(parsed.document.nodes.find((n) => n.id === "p1")?.status).toBe("root_cause_candidate");
    expect(parsed.document.nodes.find((n) => n.id === "s1")?.decision).toBe("accepted");
  });

  it("normalizes legacy undecided decision metadata to accepted", () => {
    const text = `${CANVAS_MERMAID_HEADER}
flowchart TD
%% node:s1 solution
%% decision:undecided
s1["Fix"]
`;
    const parsed = parseCanvasMermaid(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.document.nodes[0]?.decision).toBe("accepted");
  });

  it("escapes quotes in titles", () => {
    const doc = {
      version: 1 as const,
      nodes: [{ id: "n1", type: "problem" as const, title: 'Say "hello"' }],
      edges: [],
    };
    const text = serializeCanvasMermaid(doc);
    expect(text).toContain('Say \\"hello\\"');
    const parsed = parseCanvasMermaid(text);
    expect(parsed.document.nodes[0]?.title).toBe('Say "hello"');
  });
});

describe("isCanvasMermaidFile", () => {
  it("detects mermaid canvas files", () => {
    expect(isCanvasMermaidFile(SAMPLE)).toBe(true);
    expect(isCanvasMermaidFile('{"version":1}')).toBe(false);
  });

  it("empty template is valid mermaid canvas", () => {
    const tpl = emptyCanvasMermaidTemplate();
    expect(isCanvasMermaidFile(tpl)).toBe(true);
    const parsed = parseCanvasMermaid(tpl);
    expect(parsed.errors).toEqual([]);
    expect(parsed.document.nodes).toEqual([]);
  });
});
