import type { Config } from "tailwindcss";

import { palette } from "./src/theme/palette";

const { shadow } = palette;

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
        header: `0 1px 0 rgba(${shadow.ink}, 0.07)`,
        dropdown: `0 18px 42px rgba(${shadow.ink}, 0.14)`,
        card: `0 10px 28px rgba(${shadow.ink}, 0.07)`,
        soft: `0 18px 48px rgba(${shadow.ink}, 0.11)`,
      },
      colors: {
        bg: palette.bg,
        text: palette.text,
        accent: palette.accent,
      },
    },
  },
  plugins: [],
} satisfies Config;
