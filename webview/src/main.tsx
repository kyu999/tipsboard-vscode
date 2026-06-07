import "./process-shim";
import "@/vscode-bridge-client";
import React from "react";
import ReactDOM from "react-dom/client";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "katex/dist/katex.min.css";
import "@xyflow/react/dist/style.css";
import "@/shared/i18n/config";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
