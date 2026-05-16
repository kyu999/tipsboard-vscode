import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Helvetica Neue",
          "Hiragino Sans",
          "Hiragino Kaku Gothic ProN",
          "Noto Sans JP",
          "sans-serif",
        ],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        header: "0 1px 0 rgba(36,48,38,0.08)",
        dropdown: "0 18px 42px rgba(36,48,38,0.16)",
        card: "0 10px 28px rgba(36,48,38,0.08)",
        soft: "0 18px 48px rgba(36,48,38,0.14)",
      },
      colors: {
        bg: {
          primary: "#f7f5ee",
          secondary: "#e7f3e7",
          elevated: "#fffdf7",
          card: "#fffdf7",
          hover: "rgba(8,127,54,0.08)",
        },
        text: {
          primary: "#243026",
          secondary: "#526257",
          muted: "#748075",
        },
        accent: {
          link: "#087f36",
          "link-hop": "#2563eb",
          "link-new": "#d97706",
          tag: "#5b8f3a",
          save: "#0f8f3d",
          error: "#c8473f",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
