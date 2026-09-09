import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createFirstOnboardingResult, createFirstOnboardingResultController, FIRST_RESULT_ACTIONS, FIRST_RESULT_SCREEN, guardFirstResultSave } from "./firstOnboardingResult.js";

const input = {
  preferences: { goal: "Работа", fit: "Свободная", colorComparison: "Спокойное" },
  outfit: { id: "demo-1", items: [{ id: "top", name: "Рубашка", source: "personal" }, { id: "bottom", name: "Брюки" }] },
  explanation: "Посадка и спокойное сочетание поддерживают выбранную ситуацию.",
};

test("three onboarding answers produce a marked demo look instead of a wardrobe grid", () => {
  const result = createFirstOnboardingResult(input);
  assert.equal(result.screen, FIRST_RESULT_SCREEN);
  assert.deepEqual(result.summary.map(({ value }) => value), ["Работа", "Свободная", "Спокойное"]);
  assert.equal(result.outfit.label, "Демо-образ");
  assert.ok(result.outfit.items.every(({ source }) => source === "demo"));
  assert.equal(result.canSaveAsPersonal, false);
  assert.deepEqual(result.actions.map(({ label }) => label), ["Добавить первую вещь", "Сфотографировать в магазине", "Открыть демо-гардероб"]);
});

test("incomplete onboarding cannot create the first result", () => {
  assert.throws(() => createFirstOnboardingResult({ ...input, preferences: { goal: "Работа", fit: "Свободная" } }), /colorComparison/);
});

test("demo result is blocked from personal save", () => {
  assert.deepEqual(guardFirstResultSave(createFirstOnboardingResult(input)), { status: "blocked", reason: "demo_cannot_be_saved_as_personal" });
});

test("controller dispatches only the three explicit actions", () => {
  const calls = [];
  const controller = createFirstOnboardingResultController({ onAction: (action) => calls.push(action) });
  controller.start(input);
  assert.equal(controller.dispatch(FIRST_RESULT_ACTIONS.PHOTO_IN_STORE).status, "dispatched");
  assert.equal(controller.dispatch("save-personal").status, "ignored");
  assert.deepEqual(calls, [FIRST_RESULT_ACTIONS.PHOTO_IN_STORE]);
  assert.equal(controller.requestPersonalSave().status, "blocked");
});

test("component exposes the product copy and no save action", async () => {
  const source = await readFile(new URL("./FirstOnboardingResult.jsx", import.meta.url), "utf8");
  assert.match(source, /Вот образ по твоим ответам/);
  assert.match(source, /Демо-образ/);
  assert.match(source, /Так выглядит выбранная гамма/);
  assert.match(source, /first-result__piece-art/);
  assert.match(source, /не сохраняется в личные образы/);
  assert.doesNotMatch(source, />Сохранить</);
});
