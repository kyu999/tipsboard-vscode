/**
 * Webview の配色の単一ソース（Tailwind theme と CodeMirror 装飾の両方から参照）。
 * リンク色はデスクトップ版 Tipsboard の UI と整合させている。
 */
export const palette = {
  bg: {
    /** メインキャンバス */
    primary: "#f5f5f4",
    /**
     * 旧アクティビティバー等で使っていた帯色。現在は primary と同一にし、
     * 「濃いグレー帯」が UI に残らないようにする（新規は primary / card / code を使う）。
     */
    secondary: "#f5f5f4",
    /** ドロップダウン・入力上乗せなど */
    elevated: "#ffffff",
    /** カード面 */
    card: "#ffffff",
    /** pre・表・ガイドのコード背景（クールなスレート） */
    code: "#f1f5f9",
    hover: "rgba(8, 127, 54, 0.07)",
  },
  text: {
    primary: "#1c1917",
    secondary: "#57534e",
    muted: "#78716c",
  },
  accent: {
    /** Wiki 内部リンク・主要 CTA（#087f36） */
    link: "#087f36",
    /** 外部 http(s)（#0f8f3d） */
    external: "#0f8f3d",
    /** Two-hop ナビ（#2563eb） */
    "link-hop": "#2563eb",
    /** 未作成 Wiki・New Links（#d97706） */
    "link-new": "#d97706",
    tag: "#5b8f3a",
    quote: "#5b8f3a",
    save: "#0f8f3d",
    error: "#dc2626",
  },
  editor: {
    paper: "#ffffff",
    paperMuted: "#f8fafc",
    paperInset: "#f1f5f9",
    textCode: "#1e293b",
    border: "rgba(28, 25, 23, 0.08)",
    borderStrong: "rgba(8, 127, 54, 0.22)",
    activeLine: "rgba(8, 127, 54, 0.045)",
    selection: "rgba(8, 127, 54, 0.11)",
    accentSoft: "rgba(8, 127, 54, 0.09)",
    hover: "rgba(8, 127, 54, 0.055)",
    missingLinkBg: "rgba(217, 119, 6, 0.08)",
    diagramFrame: "rgba(8, 127, 54, 0.22)",
  },
  /** boxShadow 等の中立いろ影（stone-900 の RGB） */
  shadow: {
    ink: "28, 25, 23",
  },
} as const;
