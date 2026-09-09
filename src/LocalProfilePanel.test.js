import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localWarmProfileView } from "./localWarmProfile.js";

test("builds a local profile view from saved preferences and learning", () => {
  const view = localWarmProfileView({ style: "Minimal", limits: ["Без каблуков"] }, { revision: 2, signals: { "colors.avoid": { explanation: "Не предлагать яркие цвета" } } });
  assert.deepEqual(view.preferences.map((item) => item.value), ["Minimal", "Без каблуков"]);
  assert.equal(view.signals[0].value, "Не предлагать яркие цвета");
  assert.equal(view.revision, 2);
});
test("panel declares accessible offline fallback and keyboard close", async () => {
  const source = await readFile(new URL("./LocalWarmProfilePanel.jsx", import.meta.url), "utf8");
  assert.match(source, /role="dialog"/); assert.match(source, /aria-modal="true"/);
  assert.match(source, /Данные на этом устройстве/); assert.match(source, /Облачного сохранения здесь нет/);
  assert.match(source, /event\.key === "Escape"/); assert.match(source, /не блокирует работу/);
  assert.match(source, /Не удалось сохранить профиль/); assert.match(source, />Повторить</);
  assert.match(source, /SYNC_PENDING/); assert.match(source, /SYNC_FAILED/);
  assert.match(source, /Выбери аватар/); assert.match(source, /role="radiogroup"/);
  assert.match(source, /Array\.from\(\{ length: 9 \}/); assert.match(source, /onAvatarChange/);
  assert.match(source, /Что влияет на рекомендации/); assert.match(source, /Что запомнил стилист/);
  assert.match(source, /Изменить город и погоду/); assert.match(source, /Экспортировать локальные данные/);
  assert.match(source, /Обратная связь/); assert.match(source, /Коротко о профиле/);
  assert.match(source, /PersistenceStatus/); assert.match(source, /onPreferenceRetry/);
  assert.match(source, /Добавить вещь с фото/); assert.match(source, /без облачной синхронизации/);
});
