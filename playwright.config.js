import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4199",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium-mobile-smoke",
      testIgnore: /vk-staging|demo-release/,
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.CI ? undefined : "msedge",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
    {
      name: "vk-staging",
      testMatch: /vk-staging/,
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.CI ? undefined : "msedge",
        viewport: { width: 390, height: 844 },
        baseURL: "http://127.0.0.1:4200",
      },
    },
    {
      name: "demo-release",
      testMatch: /demo-release/,
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.CI ? undefined : "msedge",
        viewport: { width: 390, height: 844 },
        baseURL: "http://127.0.0.1:4201",
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4199 --strictPort",
      url: "http://127.0.0.1:4199",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        "npm run build:demo && npm run preview:demo -- --host 127.0.0.1 --port 4201 --strictPort",
      url: "http://127.0.0.1:4201",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4200 --strictPort",
      url: "http://127.0.0.1:4200",
      reuseExistingServer: false,
      timeout: 30_000,
      env: { VITE_VK_STAGING: "true" },
    },
  ],
});
