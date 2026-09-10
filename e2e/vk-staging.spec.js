import { test, expect } from "@playwright/test";

test("VK entry clears launch query, saves metadata and restores server wardrobe", async ({
  page,
}) => {
  let items = [],
    launchBody;
  await page.route("**/api/staging/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("vk-session")) launchBody = request.postData();
    if (path.endsWith("wardrobe") && request.method() === "PUT")
      items = JSON.parse(request.postData());
    await route.fulfill({
      json: path.endsWith("wardrobe") ? { items } : { authenticated: true },
    });
  });
  await page.goto("/?vk_app_id=123&sign=synthetic");
  await expect(
    page.getByRole("heading", { name: "Мой гардероб · закрытый тест VK" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Сохранить вещь без фото" }),
  ).toBeEnabled();
  expect(new URL(page.url()).search).toBe("");
  expect(launchBody).toBe("vk_app_id=123&sign=synthetic");
  await page.getByRole("button", { name: "Сохранить вещь без фото" }).click();
  await expect(page.getByRole("status")).toContainText("повторно прочитана");
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Личный гардероб" }),
  ).toContainText("shirt · blue");
  expect(await page.locator('input[type="file"]').count()).toBe(0);
});

test("server gate failure does not claim authenticated or saved state", async ({
  page,
}) => {
  await page.route("**/api/staging/**", (route) =>
    route.fulfill({ status: 503, json: { code: "staging_budget_blocked" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Гардероб не загружен");
  await expect(
    page.getByRole("button", { name: "Сохранить вещь без фото" }),
  ).toHaveCount(0);
});
