import test from "node:test";
import assert from "node:assert/strict";
import { activationProgress, answersComplete } from "../src/activation.js";

test("requires all three activation answers", () => {
  assert.equal(answersComplete({ goal: "Работа", style: "Minimal" }), false);
  assert.equal(answersComplete({ goal: "Работа", style: "Minimal", mood: "Уверенно" }), true);
});

test("requires top or dress, bottom, and shoes", () => {
  assert.equal(activationProgress([{ type: "Платье", name: "Платье" }, { type: "Обувь", name: "Кеды" }]).ready, false);
  const ready = activationProgress([{ type: "Верх", name: "Рубашка" }, { type: "Низ", name: "Брюки" }, { type: "Обувь", name: "Кеды" }]);
  assert.equal(ready.completed, 3);
  assert.equal(ready.ready, true);
});
