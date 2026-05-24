import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@tipsboard/shared": path.resolve(__dirname, "../src/shared"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(__dirname, "../dist/media"),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "src/main.tsx"),
      name: "tipsboardwebview",
      formats: ["es"],
      fileName: () => "webview.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: "webview[extname]",
        inlineDynamicImports: true,
      },
    },
  },
});
