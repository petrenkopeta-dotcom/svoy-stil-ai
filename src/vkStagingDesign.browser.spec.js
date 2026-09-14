import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { openVkAdd, chooseVkMetadata } from "../e2e/vkJourney.helpers.js";

async function cityFixture(page, behavior = "success") {
  const external = [],
    writes = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).host.startsWith("127.0.0.1:"))
      external.push(request.url());
    if (["PUT", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.url());
  });
  await server(page, {
    initial: [{ id: "1", category: "shirt", color: "blue" }],
  });
  await page.route("**/city-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `
    <meta charset="utf-8"><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const { VkStagingApp } = await import('/src/VkStagingApp.jsx');
      window.cityCalls = [];
      const bridge = {
        supportsAsync: async (method) => { window.cityCalls.push(method); return ${JSON.stringify(behavior)} !== 'unsupported'; },
        send: async (method) => {
          window.cityCalls.push(method);
          if (${JSON.stringify(behavior)} === 'reject') throw new Error('synthetic-private');
          if (${JSON.stringify(behavior)} === 'absent') return {};
          if (${JSON.stringify(behavior)} === 'late') return new Promise(resolve => { window.finishCity = () => resolve({city:{title:'Москва'}}); });
          return { id:456, first_name:'Synthetic', city:{id:1,title:'Москва'} };
        }
      };
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(VkStagingApp, {cityBridge:bridge}));
    </script>`,
    }),
  );
  await page.goto("/city-fixture");
  await expect(
    page.getByRole("region", { name: "Город и погода" }),
  ).toBeVisible();
  return { external, writes };
}

test("city manual form is optional, validated, memory-only and keeps wardrobe available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const observed = await cityFixture(page);
  const panel = page.getByRole("region", { name: "Город и погода" });
  await panel.getByRole("button", { name: "Указать город вручную" }).click();
  await expect(panel.getByLabel("Город", { exact: true })).toBeFocused();
  await panel.getByLabel("Город", { exact: true }).fill("https://evil.test");
  await panel
    .getByRole("button", { name: "Выбрать город", exact: true })
    .click();
  await expect(panel.getByText(/Укажите город и регион:/)).toBeVisible();
  await panel.getByLabel("Город", { exact: true }).fill("Астрахань");
  await panel.getByLabel("Регион или страна").fill("Астраханская область");
  await panel
    .getByRole("button", { name: "Выбрать город", exact: true })
    .click();
  await expect(
    panel.getByText("Астрахань, Астраханская область", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("Прогноз ещё не подключён")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Личный гардероб" }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.cityCalls)).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  expect(observed.external).toEqual([]);
  expect(observed.writes).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir(path.resolve("artifacts/vk-city"), { recursive: true });
  await panel.screenshot({
    path: path.resolve("artifacts/vk-city/manual-320.png"),
  });
  await page.reload();
  await expect(
    panel.getByText("Город не выбран", { exact: true }),
  ).toBeVisible();
});

test("profile city needs explicit region/confirmation and manual remains available", async ({
  page,
}) => {
  await cityFixture(page);
  const panel = page.getByRole("region", { name: "Город и погода" });
  await panel.getByRole("button", { name: "Предложить город из VK" }).click();
  await expect(
    panel.getByText("Город не выбран", { exact: true }),
  ).toBeVisible();
  await panel.getByLabel("Регион или страна").fill("Москва");
  await panel.getByRole("button", { name: "Подтвердить город VK" }).click();
  await expect(panel.getByText("Город VK подтверждён вами")).toBeVisible();
  await panel.getByRole("button", { name: "Указать город вручную" }).click();
  await panel.getByLabel("Город", { exact: true }).fill("Мирный");
  await panel.getByLabel("Регион или страна").fill("Якутия");
  await panel
    .getByRole("button", { name: "Выбрать город", exact: true })
    .click();
  await expect(
    panel.getByText("Мирный, Якутия", { exact: true }),
  ).toBeVisible();
});

for (const behavior of ["unsupported", "reject", "absent", "late"])
  test(`city ${behavior} falls back without blocking wardrobe`, async ({
    page,
  }) => {
    await cityFixture(page, behavior);
    const panel = page.getByRole("region", { name: "Город и погода" });
    await panel.getByRole("button", { name: "Предложить город из VK" }).click();
    await expect(panel.getByText(/Укажите город вручную\./)).toBeVisible({
      timeout: 7000,
    });
    await expect(
      panel.getByRole("button", { name: "Указать город вручную" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("list", { name: "Личный гардероб" }),
    ).toBeVisible();
  });

test("late profile result cannot overwrite manual city or restore city after logout", async ({
  page,
}) => {
  await cityFixture(page, "late");
  const panel = page.getByRole("region", { name: "Город и погода" });
  await panel.getByRole("button", { name: "Предложить город из VK" }).click();
  await expect
    .poll(() => page.evaluate(() => typeof window.finishCity))
    .toBe("function");
  await panel.getByRole("button", { name: "Указать город вручную" }).click();
  await panel.getByLabel("Город", { exact: true }).fill("Мирный");
  await panel.getByLabel("Регион или страна").fill("Якутия");
  await panel
    .getByRole("button", { name: "Выбрать город", exact: true })
    .click();
  await page.evaluate(() => window.finishCity());
  await expect(
    panel.getByText("Мирный, Якутия", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Убрать город" }).click();
  await page.evaluate(() => {
    window.finishCity = null;
  });
  await panel.getByRole("button", { name: "Предложить город из VK" }).click();
  await expect
    .poll(() => page.evaluate(() => typeof window.finishCity))
    .toBe("function");
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await page.evaluate(() => window.finishCity());
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Вы вышли");
});

test("storage unavailable copy reaches load and save UI and recovery remains required", async ({
  page,
}) => {
  const backend = await server(page, {
    initial: [{ id: "1", category: "shirt", color: "blue" }],
  });
  let failLoad = true;
  await page.route("**/api/staging/wardrobe", (route) =>
    failLoad || route.request().method() === "PUT"
      ? route.fulfill({ status: 503, json: { code: "storage_unavailable" } })
      : route.fallback(),
  );
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(
    "Хранилище гардероба временно недоступно",
  );
  failLoad = false;
  await page
    .getByRole("button", { name: "Обновить гардероб", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Добавить вещь", exact: true })
    .click();
  await chooseVkMetadata(page);
  await page
    .getByRole("button", { name: "Сохранить без фото", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Хранилище гардероба временно недоступно",
  );
  await expect(
    page.getByRole("button", { name: "Сохранить без фото", exact: true }),
  ).toBeDisabled();
  expect(backend.writes).toBe(0);
});

async function server(page, { initial = [], failRead = false } = {}) {
  let items = initial,
    writes = 0,
    readFailure = failRead;
  await page.route("**/api/staging/**", (route) => {
    const request = route.request(),
      pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("wardrobe")) {
      if (request.method() === "PUT") {
        writes++;
        items = JSON.parse(request.postData());
        return route.fulfill({ json: { saved: true } });
      }
      return readFailure
        ? route.fulfill({
            status: 503,
            json: { code: "staging_budget_blocked" },
          })
        : route.fulfill({ json: { items } });
    }
    return route.fulfill({
      json: { authenticated: true, photos: false, signedOut: true },
    });
  });
  return {
    get items() {
      return items;
    },
    get writes() {
      return writes;
    },
    failRead(value) {
      readFailure = value;
    },
  };
}

for (const width of [320, 390, 1100])
  test(`approved VK journey at ${width}: keyboard, required choices, back, real read-back and selection`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const backend = await server(page);
    await page.goto("/?vk_app_id=123&sign=synthetic");
    await expect(
      page.getByText("Вопрос 1 из 3", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Дальше", exact: true }),
    ).toBeDisabled();
    const office = page.getByRole("radio", {
      name: "Деловой / офисный",
      exact: true,
    });
    await office.focus();
    await page.keyboard.press("Space");
    await expect(office).toBeChecked();
    await page.getByRole("button", { name: "Дальше", exact: true }).click();
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    await page
      .getByRole("radio", { name: "По фигуре, но не тесно", exact: true })
      .check();
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(office).toBeChecked();
    await page.getByRole("button", { name: "Дальше", exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "По фигуре, но не тесно", exact: true }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Дальше", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Перейти к гардеробу", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("radio", { name: "Не знаю / нет предпочтения", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Перейти к гардеробу", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Место для ваших вещей" }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Личный гардероб" }),
    ).toHaveCount(0);
    await mkdir("artifacts/vk-design", { recursive: true });
    await page.screenshot({
      path: path.resolve(`artifacts/vk-design/empty-${width}.png`),
      fullPage: true,
    });
    await openVkAdd(page);
    await expect(page.getByLabel("Категория", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Цвет", { exact: true })).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Сохранить без фото", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Категория", { exact: true }).selectOption("shirt");
    await expect(
      page.getByRole("button", { name: "Сохранить без фото", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Цвет", { exact: true }).selectOption("blue");
    await expect(
      page.getByRole("button", { name: "Фото сейчас недоступны", exact: true }),
    ).toBeDisabled();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await page.screenshot({
      path: path.resolve(`artifacts/vk-design/add-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Сохранить без фото", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("повторно прочитана");
    expect(backend.writes).toBe(1);
    expect(backend.items).toEqual([
      { id: expect.any(String), category: "shirt", color: "blue" },
    ]);
    await page
      .getByRole("list", { name: "Личный гардероб" })
      .getByRole("button")
      .first()
      .click();
    await expect(
      page.getByText("Добавлена без фото. Посадка и сезонность не указаны."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Использовать эту вещь", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "готовый образ не создан",
    );
    await page.screenshot({
      path: path.resolve(`artifacts/vk-design/selection-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".vk-staging button:visible")
        .evaluateAll((buttons) =>
          buttons.every(
            (button) => button.getBoundingClientRect().height >= 48,
          ),
        ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "То, что уже ваше" }),
    ).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
      })),
    ).toEqual({ local: 0, session: 0 });
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-state",
      "signedOut",
    );
    await expect(
      page.getByRole("list", { name: "Личный гардероб" }),
    ).toHaveCount(0);
  });

test("wardrobe read failure is not empty; saved-but-lost read-back cannot be retried blindly", async ({
  page,
}) => {
  const backend = await server(page, { failRead: true });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Гардероб не загружен");
  await expect(
    page.getByText("В гардеробе пока нет вещей", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  backend.failRead(false);
  await page
    .getByRole("button", { name: "Обновить гардероб", exact: true })
    .click();
  await chooseVkMetadata(page);
  backend.failRead(true);
  await page
    .getByRole("button", { name: "Сохранить без фото", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Сохранение не подтверждено",
  );
  await expect(
    page.getByRole("button", { name: "Сохранить без фото", exact: true }),
  ).toBeDisabled();
  expect(backend.writes).toBe(1);
  backend.failRead(false);
  await page
    .getByRole("button", { name: "Обновить гардероб", exact: true })
    .click();
  await expect(
    page.getByRole("list", { name: "Личный гардероб" }).getByRole("listitem"),
  ).toHaveCount(1);
  expect(backend.writes).toBe(1);
});

test("invalid VK launch requires reopening, with no retry loop or empty wardrobe", async ({
  page,
}) => {
  await page.route("**/api/staging/**", (route) =>
    route.fulfill({ status: 400, json: { code: "request_rejected" } }),
  );
  await page.goto("/?sign=synthetic-invalid");
  await expect(page.getByRole("status")).toContainText("заново из VK");
  await expect(
    page.getByRole("button", { name: "Повторить вход", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Место для ваших вещей" }),
  ).toHaveCount(0);
});

test("four server-owned items form the approved grid and text remains usable at 200 percent", async ({
  page,
}) => {
  await server(page, {
    initial: Array.from({ length: 4 }, (_, index) => ({
      id: `server-${index}`,
      category: ["shirt", "pants", "coat", "shirt"][index],
      color: ["blue", "black", "white", "white"][index],
    })),
  });
  for (const width of [320, 390, 1100]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("list", { name: "Личный гардероб" }).getByRole("listitem"),
    ).toHaveCount(4);
    const columns = await page
      .locator("ul.vk-grid")
      .evaluate(
        (grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      );
    expect(columns).toBe(width <= 360 ? 1 : 2);
    await mkdir("artifacts/vk-design", { recursive: true });
    await page.screenshot({
      path: path.resolve(`artifacts/vk-design/filled-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".vk-staging").evaluate((root) => {
    root.style.fontSize = "32px";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("cancel photo waiting ignores a late result and preserves a recoverable session", async ({
  page,
}) => {
  let finish, replied;
  const held = new Promise((resolve) => {
    finish = resolve;
  });
  const completed = new Promise((resolve) => {
    replied = resolve;
  });
  await page.route("**/api/staging/**", async (route) => {
    if (route.request().url().endsWith("analyze")) {
      await held;
      try {
        await route.fulfill({
          json: {
            candidates: [
              {
                id: "late",
                label: "shirt",
                preview: "data:image/png;base64,AAAA",
              },
            ],
          },
        });
      } catch {
      } finally {
        replied();
      }
      return;
    }
    return route.fulfill({
      json: { authenticated: true, photos: true, items: [] },
    });
  });
  try {
    await page.goto("/");
    await openVkAdd(page);
    const started = page.waitForRequest("**/photos/analyze");
    await page.locator('input[type="file"]').setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from("synthetic"),
    });
    await started;
    await page
      .getByRole("button", { name: "Отменить ожидание", exact: true })
      .click();
    finish();
    await completed;
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-state",
      "cancelled",
    );
    await expect(page.getByRole("status")).toContainText(
      "не подтверждает остановку обработки",
    );
    await expect(
      page.getByRole("button", { name: "Подтвердить сохранение", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Назад в гардероб", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Обновить гардероб", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Место для ваших вещей" }),
    ).toBeVisible();
  } finally {
    finish();
  }
});
