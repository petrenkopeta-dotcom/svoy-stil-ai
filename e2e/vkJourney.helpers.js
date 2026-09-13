import { expect } from "@playwright/test";

export async function finishVkOnboarding(page) {
  await expect(page.locator('.vk-staging[data-loaded="true"]')).toBeVisible();
  if (await page.locator('.vk-staging[data-screen="onboarding"]').count()) {
    for (let step = 0; step < 3; step++) {
      await page.getByRole("radio").first().check();
      await page
        .getByRole("button", {
          name: step === 2 ? "Перейти к гардеробу" : "Дальше",
          exact: true,
        })
        .click();
    }
  }
}
export async function openVkAdd(page) {
  await finishVkOnboarding(page);
  if (await page.locator('.vk-staging[data-screen="photo"]').count())
    await page
      .getByRole("button", {
        name: "Продолжить без фото или выбрать заново",
        exact: true,
      })
      .click();
  if (await page.locator('.vk-staging[data-screen="wardrobe"]').count())
    await page
      .getByRole("button", { name: /^(Добавить первую вещь|Добавить вещь)$/ })
      .click();
  await expect(page.getByLabel("Категория", { exact: true })).toBeVisible();
}
export async function chooseVkMetadata(page) {
  await openVkAdd(page);
  await page.getByLabel("Категория", { exact: true }).selectOption("shirt");
  await page.getByLabel("Цвет", { exact: true }).selectOption("blue");
}
