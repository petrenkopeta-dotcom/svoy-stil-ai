import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("approved goal screen exposes four photographic native radios", async () => {
  const source = await read("./onboarding/OccasionDressCodeStep.jsx");
  const css = await read("./styles.css");
  for (const label of ["На каждый день", "Деловой / офисный", "Встреча / выходной", "Формальный / вечерний"]) assert.ok(source.includes(label));
  assert.match(source, /type="radio"/);
  assert.match(source, /aria-checked=\{selected\}/);
  assert.match(source, /Можно изменить позже/);
  assert.match(css, /mvp-goal-cards-still-life-v2\.png/);
  assert.match(css, /aspect-ratio:1\.28\/1/);
});

test("goal cards retain existing domain values and legacy selection compatibility", async () => {
  const source = await read("./onboarding/OccasionDressCodeStep.jsx");
  for (const value of ["Прогулка", "Работа", "Встреча", "Мероприятие"]) assert.match(source, new RegExp(`value: "${value}"`));
  for (const legacy of ["Каждый день", "Учёба", "Деловой / офисный", "Встреча / выходной", "Свидание", "Формальный / вечерний"]) assert.ok(source.includes(legacy));
  assert.match(source, /card\.aliases\.includes\(value\)/);
});
