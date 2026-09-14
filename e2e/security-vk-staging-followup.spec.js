import { openVkAdd } from "./vkJourney.helpers.js";
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1kAAAAASUVORK5CYII=",
  "base64",
);
const saved = {
  id: "00000000-0000-0000-0000-000000000001",
  sha256: createHash("sha256").update(png).digest("hex"),
};

test("security followup: synchronous double confirm preserves one successful result", async ({
  page,
}) => {
  let confirms = 0,
    finish;
  const held = new Promise((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/staging/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("capabilities"))
      return route.fulfill({ json: { photos: true } });
    if (path.endsWith("analyze"))
      return route.fulfill({
        json: {
          candidates: [
            {
              id: "candidate",
              label: "shirt",
              preview: `data:image/png;base64,${png.toString("base64")}`,
            },
          ],
        },
      });
    if (path.endsWith("confirm")) {
      confirms++;
      if (confirms > 1)
        return route.fulfill({
          status: 404,
          json: { code: "candidate_not_found" },
        });
      await held;
      return route.fulfill({ json: saved });
    }
    if (path.endsWith(saved.id))
      return route.fulfill({ contentType: "image/png", body: png });
    return route.fulfill({
      json: { items: [], authenticated: true, userId: "vk:123:2" },
    });
  });
  try {
    await page.goto("/");
    await openVkAdd(page);
    await openVkAdd(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: png,
    });
    const button = page.getByRole("button", {
      name: "Подтвердить сохранение",
      exact: true,
    });
    await expect(button).toBeEnabled();
    await button.evaluate((element) => {
      element.click();
      element.click();
    });
    await expect.poll(() => confirms).toBe(1);
    finish();
    await expect(page.getByRole("status")).toContainText("повторно прочитана");
    await expect(page.getByAltText("Сохранённая проверенная вещь")).toHaveCount(
      1,
    );
    expect(confirms).toBe(1);
  } finally {
    finish();
  }
});

test("security followup: budget retry preserves exact launch without browser persistence", async ({
  page,
}) => {
  const launch = "vk_app_id=123&vk_ts=1800000000&sign=synthetic-security-retry";
  const launches = [];
  await page.addInitScript(() => {
    window.securityStorageWrites = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.securityStorageWrites.push([key, value]);
      return setItem.call(this, key, value);
    };
  });
  await page.route("**/api/staging/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("vk-session")) {
      launches.push(route.request().postData());
      if (launches.length === 1)
        return route.fulfill({
          status: 503,
          json: { code: "staging_budget_blocked" },
        });
    }
    return route.fulfill({
      json: {
        photos: false,
        items: [],
        authenticated: true,
        userId: "vk:123:2",
      },
    });
  });
  await page.goto(`/?${launch}`);
  await page
    .getByRole("button", { name: "Повторить вход", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveAttribute("data-state", "empty");
  expect(launches).toEqual([launch, launch]);
  expect(new URL(page.url()).search).toBe("");
  expect(
    await page.evaluate(() => ({
      writes: window.securityStorageWrites,
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ writes: [], local: 0, session: 0 });
});

test("SEC-02: synchronous double logout must preserve a confirmed signed-out state", async ({
  page,
}) => {
  let logouts = 0;
  await page.route("**/api/staging/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("logout")) {
      logouts++;
      return logouts === 1
        ? route.fulfill({ json: { signedOut: true } })
        : route.fulfill({ status: 401, json: { code: "session_required" } });
    }
    return route.fulfill({
      json: {
        photos: false,
        items: [],
        authenticated: true,
        userId: "vk:123:2",
      },
    });
  });
  await page.goto("/");
  const button = page.getByRole("button", { name: "Выйти", exact: true });
  await expect(button).toBeEnabled();
  await button.evaluate((element) => {
    element.click();
    element.click();
  });
  await expect(page.getByRole("status")).toHaveAttribute(
    "data-state",
    "signedOut",
  );
  expect(logouts).toBe(1);
});
