import { test, expect } from "@playwright/test";

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
