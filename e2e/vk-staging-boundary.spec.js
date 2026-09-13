import { test, expect } from "@playwright/test";

test("VK startup never imports or reads the local prototype context", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) =>
    requests.push(new URL(request.url()).pathname),
  );
  await page.addInitScript(() => {
    window.prototypeStorageReads = [];
    localStorage.setItem(
      "ai-stylist:manual-context:v1",
      JSON.stringify({
        consent: { granted: true, version: "manual-context-storage/1.0" },
        context: { city: "SYNTHETIC_LEGACY_CONTEXT" },
      }),
    );
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      window.prototypeStorageReads.push(key);
      return getItem.call(this, key);
    };
  });
  await page.route("**/api/staging/**", (route) =>
    route.fulfill({
      json: { authenticated: true, photos: false, items: [] },
    }),
  );
  await page.goto("/");
  await expect(page.locator('[role="status"][data-state]')).toBeVisible();
  await expect(page.locator('[role="status"][data-state]')).not.toHaveAttribute(
    "data-state",
    "loading",
  );
  await expect(page).toHaveTitle("Надеть есть что");
  expect(await page.evaluate(() => window.prototypeStorageReads)).toEqual([]);
  expect(
    requests.filter((path) =>
      /^\/src\/(?:LegacyApp|main|ContextProvider|styles\.|telemetry\/)/.test(
        path,
      ),
    ),
  ).toEqual([]);
  await expect(page.locator("body")).not.toContainText(
    "SYNTHETIC_LEGACY_CONTEXT",
  );
});
