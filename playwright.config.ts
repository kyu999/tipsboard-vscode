import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./webview/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm exec vite -- --host 127.0.0.1 --port 4174",
    cwd: "./webview",
    reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:4174/cursor-test.html",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
