import { test, expect } from "@playwright/test";

test("original photo drafts stay in memory and unverified photo saving is blocked", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createReferenceDraftStore } =
      await import("/src/referenceDraft.js");
    const { createPhotoStorage, PHOTO_POLICY_VERSION } =
      await import("/src/photoStorage.js");
    const original = new Blob(["synthetic-no-user-photo"], {
      type: "image/png",
    });
    const draft = createReferenceDraftStore();
    await draft.save({ dto: { blob: original, networkAllowed: false } });
    const restored = Boolean((await draft.load())?.dto?.blob);
    let code;
    const storage = createPhotoStorage();
    try {
      await storage.save(original, {
        granted: true,
        policyVersion: PHOTO_POLICY_VERSION,
      });
    } catch (error) {
      code = error.code;
    }
    await draft.clear();
    return {
      restored,
      code,
      cleared: (await draft.load()) === null,
      photoCount: (await storage.backend.getAll()).length,
      databases: (await indexedDB.databases()).map((db) => db.name),
    };
  });
  expect(result.restored).toBe(true);
  expect(result.cleared).toBe(true);
  expect(result.code).toBe("unsafe_photo");
  expect(result.databases).not.toContain("ai-stylist-reference-draft");
  expect(result.photoCount).toBe(0);
});

test("three answers reveal the first demo look without a tour blocking it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Начать подбор" }).click();
  await expect(
    page.getByRole("heading", { name: "Куда собираемся?" }),
  ).toBeFocused();
  await page.locator('input[name="onboarding-goal"]').first().check();
  await page.getByRole("button", { name: "Дальше" }).click();
  await expect(
    page.getByRole("heading", { name: "Комфортная посадка", exact: true }),
  ).toBeFocused();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.getByRole("radio", { name: "Тёмно-синий + молочный" }).check();
  await page.getByRole("button", { name: "Показать мой демо-образ" }).click();
  await expect(
    page.getByRole("heading", { name: "Вот образ по твоим ответам" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Добавить первую вещь" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("SPA boots at a real mobile viewport without pre-consent egress", async ({
  page,
  baseURL,
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
    if (url.origin !== new URL(baseURL).origin)
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
