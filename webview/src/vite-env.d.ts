/// <reference types="vite/client" />

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};
