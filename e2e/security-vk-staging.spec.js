import { test, expect } from "@playwright/test";

test("security: VK launch and wardrobe do not enter browser persistence or console", async ({
  page,
}) => {
  const marker = "synthetic_private_launch_marker";
  const logs = [];
  const requests = [];
  page.on("console", (entry) => logs.push(entry.text()));
  page.on("request", (request) =>
    requests.push({ url: request.url(), body: request.postData() }),
  );
  await page.addInitScript(() => {
    window.securityWrites = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.securityWrites.push({ sink: "storage", key, value });
      return setItem.call(this, key, value);
    };
    for (const name of ["add", "put"]) {
      const original = IDBObjectStore.prototype[name];
      IDBObjectStore.prototype[name] = function (...args) {
        window.securityWrites.push({ sink: "indexeddb", name });
        return original.apply(this, args);
      };
    }
  });
  let items = [];
  await page.route("**/api/staging/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("wardrobe") && request.method() === "PUT")
      items = JSON.parse(request.postData());
    await route.fulfill({
      json: path.endsWith("wardrobe") ? { items } : { authenticated: true },
    });
  });
  await page.goto(`/?vk_app_id=123&sign=${marker}`);
  await page.getByRole("button", { name: "Сохранить вещь без фото" }).click();
  await expect(page.getByRole("status")).toContainText("повторно прочитана");
  expect(new URL(page.url()).search).toBe("");
  expect(
    await page.evaluate(() => ({
      writes: window.securityWrites,
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ writes: [], local: 0, session: 0 });
  expect(logs.join("\n")).not.toContain(marker);
  expect(
    requests
      .filter((r) => r.body?.includes(marker))
      .map((r) => new URL(r.url).pathname),
  ).toEqual(["/api/staging/vk-session"]);
  expect(
    requests.every((r) => new URL(r.url).origin === new URL(page.url()).origin),
  ).toBe(true);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Личный гардероб скрыт");
  await expect(page.getByRole("list", { name: "Личный гардероб" })).toHaveCount(
    0,
  );
});

test("security: failed save and logout never claim server confirmation", async ({
  page,
}) => {
  await page.route("**/api/staging/**", (route) => {
    const request = route.request();
    return route.fulfill(
      request.method() === "GET"
        ? {
            json: new URL(request.url()).pathname.endsWith("wardrobe")
              ? { items: [] }
              : { authenticated: true },
          }
        : { status: 503, json: { code: "staging_budget_blocked" } },
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Сохранить вещь без фото" }).click();
  await expect(page.getByRole("status")).toContainText(
    /не подтверждено|недоступна/,
  );
  await expect(page.getByRole("list", { name: "Личный гардероб" })).toBeEmpty();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    /не подтверждён|недоступна/,
  );
  await expect(page.getByRole("status")).not.toContainText("Вы вышли");
});

test("security: client safety flags cannot write original bytes to IndexedDB", async ({
  page,
}) => {
  await page.route("**/api/staging/**", (route) =>
    route.fulfill({ json: { authenticated: true, items: [] } }),
  );
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createPhotoStorage, PHOTO_POLICY_VERSION } =
      await import("/src/photoStorage.js");
    let writes = 0;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      writes++;
      return original.apply(this, args);
    };
    const codes = [];
    try {
      for (const validateCutout of [
        undefined,
        async () => false,
        async () => {
          throw new Error("synthetic detector error");
        },
      ]) {
        const storage = createPhotoStorage({ validateCutout });
        try {
          await storage.save(
            new Blob(["synthetic-original-never-persist"], {
              type: "image/png",
            }),
            { granted: true, policyVersion: PHOTO_POLICY_VERSION },
            {
              safety: {
                checked: true,
                garmentOnly: true,
                personPresent: false,
                facePresent: false,
              },
            },
          );
          codes.push("unexpected_save");
        } catch (error) {
          codes.push(error.code);
        }
      }
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    return { writes, codes };
  });
  expect(result).toEqual({
    writes: 0,
    codes: ["unsafe_photo", "unsafe_photo", "unsafe_photo"],
  });
});

test("security: revoked photo capability blocks transmission of selected original", async ({
  page,
}) => {
  let capabilities = 0,
    analyzes = 0;
  await page.route("**/api/staging/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("capabilities")) {
      capabilities++;
      return route.fulfill({ json: { photos: capabilities === 1 } });
    }
    if (path.endsWith("analyze")) analyzes++;
    return route.fulfill({ json: { authenticated: true, items: [] } });
  });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from("synthetic-original"),
  });
  await expect(page.getByRole("status")).toContainText("недоступна");
  expect(capabilities).toBe(2);
  expect(analyzes).toBe(0);
  expect(await page.locator('input[type="file"]').inputValue()).toBe("");
});
