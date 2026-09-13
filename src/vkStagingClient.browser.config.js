import { defineConfig } from "@playwright/test";
export default defineConfig({
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
  projects: [
    {
      name: "vk-client",
      testDir: ".",
      testMatch: /vkStaging(Client|Design)\.browser\.spec\.js$/,
    },
    {
      name: "vk-security",
      testDir: "../e2e",
      testMatch: /(?:^|[\\/])(security-)?vk-staging(-followup)?\.spec\.js$/,
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4210 --strictPort",
    cwd: "..",
    url: "http://127.0.0.1:4210",
    reuseExistingServer: false,
    env: { VITE_VK_STAGING: "true" },
  },
});
