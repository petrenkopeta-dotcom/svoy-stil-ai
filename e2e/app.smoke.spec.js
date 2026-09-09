import { test, expect } from "@playwright/test";

test("SPA boots at a real mobile viewport without pre-consent egress", async ({
  page,
}) => {
  const pageErrors = [];
  const consoleErrors = [];
  const externalRequests = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4173")
      externalRequests.push(url.origin);
  });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page).toHaveTitle("ATELIER AI");
  await expect(page.locator("#root")).not.toBeEmpty();
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.viewport).toBe(390);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
