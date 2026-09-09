const labels = { goal: "Повод", style: "Стиль", fit: "Посадка", colorComparison: "Цвета", thermalComfort: "Температурный комфорт", mood: "Настроение", limits: "Ограничения", temp: "Погода" };

export function localWarmProfileView(prefs = {}, profile = {}) {
  const preferences = Object.entries(labels).map(([key, label]) => ({ label, value: Array.isArray(prefs[key]) ? prefs[key].join(", ") : prefs[key] })).filter(({ value }) => Boolean(value));
  const signals = Object.entries(profile.signals || {}).map(([key, signal]) => ({ key, value: signal.explanation || signal.level || "Сохранено" }));
  return { preferences, signals, revision: profile.revision || 0, completion: Object.keys(labels).filter((key) => Boolean(prefs[key]?.length || prefs[key])).length };
}
