import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { rankDemoLooksFromOnboarding } from "./onboardingFirstLookEngine.js";

const catalog = [
  { id: "t-office", name: "Офисная рубашка", type: "Верх", color: "Белый", style: "smart casual · minimal" },
  { id: "t-casual", name: "Свободный свитер", type: "Верх", color: "Бежевый", style: "casual · sporty" },
  { id: "t-evening", name: "Вечерний топ", type: "Верх", color: "Бордовый", style: "feminine · old money" },
  { id: "b-office", name: "Строгие брюки", type: "Низ", color: "Чёрный", style: "smart casual · minimal" },
  { id: "b-casual", name: "Голубые джинсы", type: "Низ", color: "Голубой", style: "casual" },
  { id: "b-evening", name: "Серая юбка", type: "Низ", color: "Серый", style: "feminine · old money" },
  { id: "s-office", name: "Лоферы", type: "Обувь", color: "Чёрный", style: "smart casual · old money" },
  { id: "s-casual", name: "Кеды", type: "Обувь", color: "Белый", style: "casual · sporty" },
  { id: "s-evening", name: "Туфли", type: "Обувь", color: "Бордовый", style: "feminine · old money" },
  { id: "l-sand", name: "Тренч", type: "Верхний слой", color: "Бежевый", style: "minimal · old money" },
  { id: "a-black", name: "Сумка", type: "Аксессуар", color: "Чёрный", style: "smart casual · old money" },
];

const occasions = ["Каждый день", "Деловой / офисный", "Встреча / выходной", "Формальный / вечерний"];
const colors = ["Чёрный + белый", "Бордовый + серый", "Оливковый + песочный"];
const cases = occasions.flatMap((occasion) => colors.map((colorComparison) => ({ occasion, fit: "Свободная", colorComparison })));

test("12 golden answer combinations are deterministic and observably personalized", () => {
  const signatures = cases.map((preferences) => {
    const first = rankDemoLooksFromOnboarding(catalog, preferences);
    const replay = rankDemoLooksFromOnboarding(catalog, preferences);
    assert.deepEqual(replay.candidates.map((item) => item.signature), first.candidates.map((item) => item.signature));
    assert.ok(first.decisionLinks.length >= 2);
    return first.candidates.slice(0, 6).map((candidate) => candidate.signature).join(">");
  });
  assert.ok(new Set(signatures).size >= 8, `expected at least 8 distinct ordered results, got ${new Set(signatures).size}`);
  assert.notEqual(signatures[0], signatures[3]);
  assert.notEqual(signatures[1], signatures[2]);
});

test("unsupported fit, mood and weather are honest limitations, not fake weights", () => {
  const result = rankDemoLooksFromOnboarding(catalog, { occasion: "Каждый день", fit: "Собранная", colorComparison: "Не знаю / нет предпочтения", mood: "Ярко", weather: "дождь" });
  assert.deepEqual(result.applied, ["occasion"]);
  assert.match(result.limitations.join(" "), /нет данных о посадке/);
  assert.match(result.limitations.join(" "), /нет тегов настроения/);
  assert.match(result.limitations.join(" "), /нет погодных тегов/);
  assert.doesNotMatch(JSON.stringify(result), /90%|подходит по фигуре/i);
});

test("diverse ordering avoids returning only near-duplicates", () => {
  const result = rankDemoLooksFromOnboarding(catalog, cases[0], { limit: 6 });
  const winners = result.candidates.slice(0, 3).map((candidate) => new Set(candidate.items.map((item) => item.id)));
  const shared = [...winners[0]].filter((item) => winners[1].has(item)).length;
  assert.ok(shared < winners[0].size);
});

test("local candidate ranking stays well below the 1500ms p95 budget", () => {
  const samples = [];
  for (let index = 0; index < 40; index += 1) {
    const started = performance.now();
    rankDemoLooksFromOnboarding(catalog, cases[index % cases.length], { limit: 12 });
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  assert.ok(samples[Math.floor(samples.length * 0.95)] < 1500);
});
