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
    page
      .locator('input[type="file"]')
      .setInputFiles({
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
