import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
// Fixed synthetic pixel; never load a user's filesystem image or enable a server gate.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1kAAAAASUVORK5CYII=",
  "base64",
);
const saved = {
  id: "00000000-0000-0000-0000-000000000001",
  sha256: createHash("sha256").update(png).digest("hex"),
};
test("synthetic photo UI distinguishes empty, timeout, confirmation, read-back, restore and logout", async ({
  page,
}) => {
  let mode = "empty",
    persisted = false,
    signedOut = false;
  await page.route("**/api/staging/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("logout")) {
      signedOut = true;
      return route.fulfill({ json: { signedOut: true } });
    }
    if (signedOut)
      return route.fulfill({ status: 401, json: { code: "session_required" } });
    if (path.endsWith("capabilities"))
      return route.fulfill({ json: { photos: true } });
    if (path.endsWith("wardrobe"))
      return route.fulfill({ json: { items: [] } });
    if (path.endsWith("analyze")) {
      expect(route.request().postDataBuffer()).toEqual(png);
      if (mode === "timeout")
        return route.fulfill({
          status: 504,
          json: { code: "cv_deadline_exceeded" },
        });
      return route.fulfill({
        json: {
          candidates:
            mode === "empty"
              ? []
              : [
                  {
                    id: "candidate",
                    label: "shirt",
                    preview: `data:image/png;base64,${png.toString("base64")}`,
                  },
                ],
        },
      });
    }
    if (path.endsWith("confirm")) {
      persisted = true;
      return route.fulfill({ json: saved });
    }
    if (path.endsWith(saved.id))
      return route.fulfill({ contentType: "image/png", body: png });
    if (path.endsWith("photos"))
      return route.fulfill({ json: { items: persisted ? [saved] : [] } });
    return route.fulfill({ json: { authenticated: true } });
  });
  await page.goto("/?vk_app_id=123&sign=synthetic");
  const status = page.getByRole("status");
  await expect(status).toHaveAttribute("data-state", "empty");
  expect(new URL(page.url()).search).toBe("");
  const upload = () =>
    page.locator('input[type="file"]').setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: png,
    });
  await upload();
  await expect(status).toContainText("не найдена");
  mode = "timeout";
  await upload();
  await expect(status).toHaveAttribute("data-state", "timeout");
  mode = "candidate";
  await upload();
  await expect(status).toHaveAttribute("data-state", "confirmation");
  expect(persisted).toBe(false);
  await page.getByRole("button", { name: "Подтвердить сохранение" }).click();
  await expect(status).toContainText("повторно прочитана");
  await expect(page.getByAltText("Сохранённая проверенная вещь")).toBeVisible();
  await page.reload();
  await expect(page.getByAltText("Сохранённая проверенная вещь")).toBeVisible();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(status).toHaveAttribute("data-state", "signedOut");
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});
test("denied capability has no upload control", async ({ page }) => {
  await page.route("**/api/staging/**", (route) =>
    route.fulfill({ json: { photos: false, items: [] } }),
  );
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveAttribute("data-state", "empty");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test("budget recovery offers retry after initial denied VK login", async ({
  page,
}) => {
  let allowed = false;
  const launches = [];
  await page.route("**/api/staging/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("vk-session")) launches.push(route.request().postData());
    if (!allowed)
      return route.fulfill({
        status: 503,
        json: { code: "staging_budget_blocked" },
      });
    if (path.endsWith("session") && !path.endsWith("vk-session"))
      return route.fulfill({ status: 401, json: { code: "session_required" } });
    return route.fulfill({
      json: { items: [], photos: false, authenticated: true },
    });
  });
  await page.goto("/?vk_app_id=123&sign=synthetic");
  await expect(page.getByRole("status")).toHaveAttribute(
    "data-state",
    "unavailable",
  );
  allowed = true;
  await page
    .getByRole("button", { name: "Повторить вход", exact: true })
    .click({ timeout: 3000 });
  await expect(page.getByRole("status")).toHaveAttribute("data-state", "empty");
  expect(launches).toEqual([
    "vk_app_id=123&sign=synthetic",
    "vk_app_id=123&sign=synthetic",
  ]);
});

test("bounded inventory tells the user older photos are not displayed", async ({
  page,
}) => {
  const items = Array.from({ length: 100 }, (_, index) => ({
    ...saved,
    id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
  }));
  await page.route("**/api/staging/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("capabilities"))
      return route.fulfill({ json: { photos: true } });
    if (path.endsWith("wardrobe"))
      return route.fulfill({ json: { items: [] } });
    if (path.endsWith("photos")) return route.fulfill({ json: { items } });
    if (/\/photos\//.test(path))
      return route.fulfill({ contentType: "image/png", body: png });
    return route.fulfill({ json: { authenticated: true } });
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveAttribute("data-state", "ready");
  await expect(page.getByText(/не более 100 последних/)).toBeVisible();
});

test("double confirmation sends one request; a lost response recovers by refresh", async ({
  page,
}) => {
  let confirms = 0,
    persisted = false,
    completeConfirm;
  const hold = new Promise((resolve) => {
    completeConfirm = resolve;
  });
  await page.route("**/api/staging/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("capabilities"))
      return route.fulfill({ json: { photos: true } });
    if (path.endsWith("wardrobe"))
      return route.fulfill({ json: { items: [] } });
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
      if (persisted)
        return route.fulfill({
          status: 404,
          json: { code: "candidate_not_found" },
        });
      persisted = true;
      await hold;
      return route.abort("failed");
    }
    if (path.endsWith("photos"))
      return route.fulfill({ json: { items: persisted ? [saved] : [] } });
    if (path.endsWith(saved.id))
      return route.fulfill({ contentType: "image/png", body: png });
    return route.fulfill({ json: { authenticated: true } });
  });
  try {
    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: png,
    });
    const button = page.getByRole("button", { name: "Подтвердить сохранение" });
    await expect(button).toBeEnabled();
    await button.evaluate((element) => {
      element.click();
      element.click();
    });
    await expect.poll(() => confirms).toBe(1);
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-state",
      "confirming",
    );
    completeConfirm();
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-state",
      "error",
    );
    await page.getByRole("button", { name: "Обновить гардероб" }).click();
    await expect(page.getByAltText("Сохранённая проверенная вещь")).toHaveCount(
      1,
    );
    expect(confirms).toBe(1);
  } finally {
    completeConfirm();
  }
});

for (const exit of ["logout", "leave"])
  test(`late analysis does not restore UI after ${exit}`, async ({ page }) => {
    let completeAnalysis,
      loggedOut = false;
    const hold = new Promise((resolve) => {
      completeAnalysis = resolve;
    });
    await page.route("**/api/staging/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("analyze")) {
        await hold;
        return route
          .fulfill({
            json: {
              candidates: [
                {
                  id: "late",
                  label: "shirt",
                  preview: `data:image/png;base64,${png.toString("base64")}`,
                },
              ],
            },
          })
          .catch(() => {});
      }
      if (path.endsWith("logout")) {
        loggedOut = true;
        return route.fulfill({ json: { signedOut: true } });
      }
      if (loggedOut)
        return route.fulfill({
          status: 401,
          json: { code: "session_required" },
        });
      return route.fulfill({
        json: { authenticated: true, photos: true, items: [] },
      });
    });
    try {
      await page.goto("/");
      const started = page.waitForRequest("**/photos/analyze");
      await page.locator('input[type="file"]').setInputFiles({
        name: "synthetic.png",
        mimeType: "image/png",
        buffer: png,
      });
      await started;
      await expect(page.getByRole("status")).toHaveAttribute(
        "data-state",
        "analyzing",
      );
      if (exit === "logout") {
        await page.getByRole("button", { name: "Выйти", exact: true }).click();
        await expect(page.getByRole("status")).toHaveAttribute(
          "data-state",
          "signedOut",
        );
      } else await page.goto("about:blank");
      completeAnalysis();
      await expect(page.locator("img")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Подтвердить сохранение" }),
      ).toHaveCount(0);
      if (exit === "logout")
        await expect(page.getByRole("status")).toHaveAttribute(
          "data-state",
          "signedOut",
        );
    } finally {
      completeAnalysis();
    }
  });

for (const failFirst of [false, true])
  test(`logout sync double click is single-flight and retryable: failFirst=${failFirst}`, async ({
    page,
  }) => {
    let logouts = 0;
    await page.route("**/api/staging/**", (route) => {
      if (route.request().url().endsWith("logout")) {
        logouts++;
        if (failFirst && logouts === 1)
          return route.fulfill({
            status: 503,
            json: { code: "synthetic_logout_failed" },
          });
        if (logouts > (failFirst ? 2 : 1))
          return route.fulfill({
            status: 401,
            json: { code: "session_required" },
          });
        return route.fulfill({ json: { signedOut: true } });
      }
      return route.fulfill({
        json: { authenticated: true, photos: false, items: [] },
      });
    });
    await page.goto("/");
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-state",
      "empty",
    );
    const doubleClick = () =>
      page
        .getByRole("button", { name: "Выйти", exact: true })
        .evaluate((button) => {
          button.click();
          button.click();
        });
    await doubleClick();
    if (failFirst) {
      await expect(page.getByRole("status")).toHaveAttribute(
        "data-state",
        "unavailable",
      );
      expect(logouts).toBe(1);
      await doubleClick();
    }
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-state",
      "signedOut",
    );
    expect(logouts).toBe(failFirst ? 2 : 1);
    await expect(
      page.getByRole("button", { name: "Выйти", exact: true }),
    ).toHaveCount(0);
  });

test("logout interrupts confirmation and ignores its late saved response", async ({
  page,
}) => {
  let releaseConfirm,
    finishReply,
    logouts = 0;
  const hold = new Promise((resolve) => {
    releaseConfirm = resolve;
  });
  const replied = new Promise((resolve) => {
    finishReply = resolve;
  });
  await page.route("**/api/staging/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
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
      await hold;
      try {
        await route.fulfill({ json: saved });
      } catch {
      } finally {
        finishReply();
      }
      return;
    }
    if (path.endsWith("logout")) {
      logouts++;
      return route.fulfill({ json: { signedOut: true } });
    }
    return route.fulfill({
      json: { authenticated: true, photos: true, items: [] },
    });
  });
  try {
    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: png,
    });
    const started = page.waitForRequest("**/photos/confirm");
    await page.getByRole("button", { name: "Подтвердить сохранение" }).click();
    await started;
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-state",
      "confirming",
    );
    await page
      .getByRole("button", { name: "Выйти", exact: true })
      .evaluate((button) => {
        button.click();
        button.click();
      });
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-state",
      "signedOut",
    );
    releaseConfirm();
    await replied;
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(logouts).toBe(1);
    await expect(page.getByRole("status")).toHaveAttribute(
      "data-state",
      "signedOut",
    );
    await expect(page.locator("img")).toHaveCount(0);
  } finally {
    releaseConfirm();
  }
});
