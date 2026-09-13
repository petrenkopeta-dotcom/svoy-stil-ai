import { test, expect } from "@playwright/test";

async function privacy(page) {
  const requests = [],
    errors = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("wardrobe", "PRIVATE_SENTINEL");
    window.demoViolations = [];
    const deny =
      (name) =>
      (...args) => {
        window.demoViolations.push(name);
        throw new Error(`Forbidden demo capability: ${name}`);
      };
    for (const method of ["fetch", "WebSocket", "XMLHttpRequest"])
      window[method] = deny(method);
    for (const method of ["getItem", "setItem", "removeItem", "clear"])
      Storage.prototype[method] = deny(method);
    for (const method of ["open", "deleteDatabase"])
      indexedDB[method] = deny(method);
    navigator.sendBeacon = deny("beacon");
  });
  return async (baseURL) => {
    expect(await page.evaluate(() => window.demoViolations)).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      requests.every((url) => new URL(url).origin === new URL(baseURL).origin),
    ).toBe(true);
    expect(requests.some((url) => url.includes("/api/"))).toBe(false);
    await expect(page.locator("body")).not.toContainText("PRIVATE_SENTINEL");
    expect(
      await page
        .locator('input[type="file"],iframe,video,img,a[href^="http"]')
        .count(),
    ).toBe(0);
  };
}
async function fit(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const button of await page.locator("button:visible").all()) {
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
}
async function onboard(page) {
  await page
    .getByRole("button", { name: "Перейти к вопросам", exact: true })
    .click();
  for (const [index, answer] of [
    "На каждый день",
    "Свободная",
    "Оливковый + песочный",
  ].entries()) {
    await expect(
      page.getByText(`Вопрос ${index + 1} из 3`, { exact: true }),
    ).toBeVisible();
    const next = page.getByRole("button", {
      name: index === 2 ? "Перейти к гардеробу" : "Дальше",
      exact: true,
    });
    await expect(next).toBeDisabled();
    await page.getByRole("radio", { name: answer, exact: true }).check();
    await next.click();
  }
}
for (const width of [320, 390, 1280]) {
  test(`B1.3 demo journey, privacy and layout at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const assertPrivacy = await privacy(page);
    await page.goto("/");
    await expect(page).toHaveTitle("Надеть есть что · Демо");
    await expect(
      page.getByText("Демо · без личных вещей и фотографий", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Это открытое демо:", { exact: false }),
    ).toBeVisible();
    await fit(page);
    const firstAction = await page
      .getByRole("button", {
        name: "Перейти к вопросам",
        exact: true,
      })
      .boundingBox();
    expect(firstAction.y + firstAction.height).toBeLessThanOrEqual(844);
    await page.screenshot({
      path: testInfo.outputPath(`entry-${width}.png`),
      fullPage: true,
    });
    await onboard(page);
    await expect(
      page.getByRole("heading", { name: "Собственных вещей — 0" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Готовые примеры" }).getByRole("button"),
    ).toHaveCount(4);
    await fit(page);
    await page.screenshot({
      path: testInfo.outputPath(`wardrobe-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Посмотреть: Прямые джинсы", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Прямые джинсы", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Условная иллюстрация", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Использовать эту вещь", exact: true })
      .click();
    await expect(
      page.getByText("Это фиксированная демонстрация", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "В демо-избранное", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("только в памяти");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Избранное", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Открыть пример: Прямые джинсы" })
      .click();
    await expect(
      page.getByRole("button", { name: "Убрать из демо-избранного" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Убрать из демо-избранного" })
      .click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Избранное", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Отметок пока нет" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Посмотреть примеры", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Попробовать добавить вещь" })
      .click();
    const save = page.getByRole("button", {
      name: "Добавить пробную запись",
      exact: true,
    });
    await expect(save).toBeDisabled();
    await page.getByLabel("Категория", { exact: true }).selectOption("shirt");
    await expect(save).toBeDisabled();
    await page.getByRole("button", { name: "Почему без фото" }).click();
    await page
      .getByText("Что нужно проверить до включения фото", { exact: true })
      .click();
    await expect(
      page.getByText("В демо эти проверки не выполняются.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Продолжить без фото" }).click();
    await expect(page.getByLabel("Категория", { exact: true })).toHaveValue(
      "shirt",
    );
    await page.getByLabel("Цвет", { exact: true }).selectOption("white");
    await fit(page);
    await page.screenshot({
      path: testInfo.outputPath(`add-${width}.png`),
      fullPage: true,
    });
    await save.click();
    await expect(page.getByRole("status")).toContainText(
      "На сервер ничего не сохранено",
    );
    await page
      .getByRole("button", { name: "Назад в гардероб", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Пробные записи" }).getByRole("button"),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Собственных вещей — 0" }),
    ).toBeVisible();
    await fit(page);
    await assertPrivacy(baseURL);
    await page
      .getByRole("button", { name: "Начать заново", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Перейти к вопросам", exact: true }),
    ).toBeVisible();
    await onboard(page);
    await expect(
      page.getByRole("region", { name: "Пробные записи" }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Перейти к вопросам", exact: true }),
    ).toBeVisible();
    await assertPrivacy(baseURL);
  });
}

test("keyboard radio navigation, back preserves answers, focus and enlarged text", async ({
  page,
  baseURL,
}) => {
  const assertPrivacy = await privacy(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Перейти к вопросам", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("radio", { name: "На каждый день", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("radio", { name: "Деловой / офисный", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Дальше", exact: true }),
  ).toBeFocused();
  expect(
    await page
      .getByRole("button", { name: "Дальше", exact: true })
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe("solid");
  await page.keyboard.press("Enter");
  await page
    .getByRole("radio", { name: "По фигуре, но не тесно", exact: true })
    .check();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Деловой / офисный", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "По фигуре, но не тесно", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await page.evaluate(() => (document.documentElement.style.fontSize = "32px"));
  await fit(page);
  await page
    .getByRole("radio", { name: "Не знаю / нет предпочтения", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Перейти к гардеробу", exact: true })
    .click();
  await fit(page);
  await assertPrivacy(baseURL);
});
