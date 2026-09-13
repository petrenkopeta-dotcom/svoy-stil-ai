import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "vkStagingClient.browser.spec.js",
  workers: 1,
  reporter: "line",
  outputDir: "../test-results/vk-journey",
  use: {
    baseURL: "http://127.0.0.1:4210",
    channel: process.env.CI ? undefined : "msedge",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4210 --strictPort",
    cwd: "..",
    url: "http://127.0.0.1:4210",
    reuseExistingServer: false,
    env: { VITE_VK_STAGING: "true" },
  },
});
