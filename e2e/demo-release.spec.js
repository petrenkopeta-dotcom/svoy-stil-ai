import { test, expect } from "@playwright/test";

test("packaged demo completes its scenario without network, personal storage or input", async ({
  page,
  baseURL,
}) => {
  const requests = [],
    errors = [];
  await page.addInitScript(() => {
    localStorage.setItem(
      "wardrobe",
      JSON.stringify([{ name: "PRIVATE_SENTINEL" }]),
    );
    window.__demoBlocked = [];
    for (const method of ["fetch", "WebSocket", "XMLHttpRequest"])
      window[method] = () => {
        window.__demoBlocked.push(method);
        throw new Error("forbidden demo capability");
      };
  });
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByText("ДЕМО · только примеры · без личных данных"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Начать демо" }).click();
  for (const answer of ["На работу", "Свободная", "Монохром"]) {
    await page.getByRole("radio", { name: answer, exact: true }).click();
    await page
      .getByRole("button", { name: /Дальше|Показать демо-образ/ })
      .click();
  }
  await page.getByRole("button", { name: "Сохранить пример" }).click();
  await expect(page.getByRole("status")).toContainText("только в памяти");
  await page.getByRole("button", { name: "Посмотреть демо-гардероб" }).click();
  await expect(
    page.getByRole("heading", { name: "Демо-гардероб", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("PRIVATE_SENTINEL");
  expect(await page.locator("input,iframe,video").count()).toBe(0);
  expect(await page.evaluate(() => window.__demoBlocked)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    requests.every((url) => new URL(url).origin === new URL(baseURL).origin),
  ).toBe(true);
  expect(requests.some((url) => url.includes("/api/"))).toBe(false);
  expect(errors).toEqual([]);
});
