const text = (value) => String(value ?? "").trim();
const norm = (value) => text(value).toLowerCase().replace(/ё/g, "е");
const tokens = (value) => norm(value).split(/\s*[·,/+]\s*/).filter(Boolean);

export const ONBOARDING_FIRST_LOOK_ENGINE_VERSION = "onboarding-first-look-v1";

const OCCASION_STYLES = Object.freeze({
  "каждый день": ["casual", "sporty", "minimal"],
  "прогулка": ["casual", "sporty", "minimal"],
  "учеба": ["casual", "smart casual", "minimal"],
  "деловой / офисный": ["smart casual", "minimal", "old money"],
  "работа": ["smart casual", "minimal", "old money"],
  "встреча / выходной": ["feminine", "romantic", "smart casual", "casual"],
  "встреча": ["feminine", "romantic", "smart casual"],
  "свидание": ["feminine", "romantic", "smart casual"],
  "формальный / вечерний": ["old money", "feminine", "minimal"],
  "мероприятие": ["old money", "feminine", "minimal"],
});

const COLOR_PAIRS = Object.freeze({
  "темно-синий + молочный": ["темно-синий", "синий", "молочный", "белый"],
  "оливковый + песочный": ["оливковый", "зеленый", "песочный", "бежевый"],
  "бордовый + серый": ["бордовый", "красный", "серый"],
  "черный + белый": ["черный", "белый"],
});

const category = (item) => {
  const value = norm(`${item.category ?? item.type ?? ""} ${item.name ?? ""}`);
  if (/обув|лофер|кед|бот|туф|сапог/.test(value)) return "shoes";
  if (/низ|брюк|джинс|юбк|шорт/.test(value)) return "bottom";
  if (/верхний слой|верхняя одежда|тренч|пальто|куртк|жакет/.test(value)) return "outerwear";
  if (/аксессуар|сумк|ремень|шарф/.test(value)) return "accessory";
  if (/плать|комбинезон/.test(value)) return "dress";
  if (/верх|рубаш|свитер|блуз|топ|футбол/.test(value)) return "top";
  return "unknown";
};

const id = (item) => text(item?.id ?? item?.garment_id);
const signature = (items) => items.map(id).sort().join("|");
const hasMetadata = (items, keys) => items.some((item) => keys.some((key) => text(item?.[key])));
const overlaps = (left, right) => left.some((value) => right.some((candidate) => value.includes(candidate) || candidate.includes(value)));

function mapPreferences(preferences, items) {
  const occasion = norm(preferences?.occasion || preferences?.goal);
  const colorChoice = norm(preferences?.colorComparison || preferences?.color);
  const fit = norm(preferences?.fit);
  const mood = norm(preferences?.mood);
  const weather = preferences?.weather ?? preferences?.temp;
  const occasionStyles = OCCASION_STYLES[occasion] ?? tokens(preferences?.dressCode || preferences?.style);
  const colorTargets = colorChoice.includes("не знаю") ? [] : (COLOR_PAIRS[colorChoice] ?? []);
  const support = {
    occasion: occasionStyles.length > 0 && hasMetadata(items, ["style", "style_tags", "occasions"]),
    color: colorTargets.length > 0 && hasMetadata(items, ["color", "colors"]),
    fit: Boolean(fit) && hasMetadata(items, ["fit", "silhouette"]),
    mood: Boolean(mood) && hasMetadata(items, ["mood_tags"]),
    weather: Boolean(weather) && hasMetadata(items, ["seasons", "warmth", "weather_tags"]),
  };
  const limitations = [];
  if (fit && !support.fit) limitations.push("В демо-вещах нет данных о посадке — ответ не использован для ранжирования.");
  if (mood && !support.mood) limitations.push("В демо-вещах нет тегов настроения — ответ не использован для ранжирования.");
  if (weather && !support.weather) limitations.push("В демо-вещах нет погодных тегов — погода не использована для ранжирования.");
  if (colorChoice.includes("не знаю")) limitations.push("Цветовое предпочтение не задано — цвет не использован для ранжирования.");
  return { occasion, colorChoice, fit, mood, weather, occasionStyles, colorTargets, support, limitations };
}

function generate(items) {
  const groups = { top: [], bottom: [], dress: [], shoes: [], outerwear: [], accessory: [] };
  for (const item of items) if (groups[category(item)]) groups[category(item)].push(item);
  Object.values(groups).forEach((group) => group.sort((a, b) => id(a).localeCompare(id(b))));
  const bases = [];
  for (const top of groups.top) for (const bottom of groups.bottom) for (const shoes of groups.shoes) bases.push([top, bottom, shoes]);
  for (const dress of groups.dress) for (const shoes of groups.shoes) bases.push([dress, shoes]);
  const candidates = [];
  for (const base of bases) {
    candidates.push(base);
    for (const layer of groups.outerwear) candidates.push([...base, layer]);
    for (const accessory of groups.accessory) candidates.push([...base, accessory]);
    for (const layer of groups.outerwear) for (const accessory of groups.accessory) candidates.push([...base, layer, accessory]);
  }
  return candidates;
}

function scoreItem(item, mapping) {
  const styles = tokens(item.style_tags ?? item.style);
  const colors = [item.color, ...(Array.isArray(item.colors) ? item.colors.map((entry) => entry?.name ?? entry) : [])].map(norm).filter(Boolean);
  const silhouette = norm(item.fit ?? item.silhouette);
  const moodTags = tokens(item.mood_tags);
  const occasion = mapping.support.occasion && overlaps(styles, mapping.occasionStyles) ? 30 : 0;
  const color = mapping.support.color && overlaps(colors, mapping.colorTargets) ? 22 : 0;
  const fit = mapping.support.fit && silhouette.includes(mapping.fit) ? 16 : 0;
  const mood = mapping.support.mood && overlaps(moodTags, [mapping.mood]) ? 8 : 0;
  return occasion + color + fit + mood;
}

function rankCandidates(candidates, mapping, limit) {
  const ranked = candidates.map((items) => ({
    items,
    signature: signature(items),
    score: items.reduce((sum, item) => sum + scoreItem(item, mapping), 0),
  })).sort((a, b) => b.score - a.score || a.signature.localeCompare(b.signature));
  const selected = [];
  const remaining = [...ranked];
  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const ids = new Set(candidate.items.map(id));
      const maxReuse = selected.reduce((max, prior) => Math.max(max, prior.items.filter((item) => ids.has(id(item))).length / Math.max(prior.items.length, candidate.items.length)), 0);
      const value = candidate.score - maxReuse * 12;
      if (value > bestValue || (value === bestValue && candidate.signature.localeCompare(remaining[bestIndex].signature) < 0)) {
        bestIndex = index;
        bestValue = value;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected;
}

function decisionLinks(mapping, winner) {
  const links = [];
  if (mapping.support.occasion) {
    const matched = winner.items.filter((item) => overlaps(tokens(item.style_tags ?? item.style), mapping.occasionStyles)).map((item) => text(item.name));
    if (matched.length) links.push({ answer: text(mapping.occasion), decision: `выше поставлены ${matched.slice(0, 2).join(" и ")} из-за подходящих style-тегов` });
  }
  if (mapping.support.color) {
    const matched = winner.items.filter((item) => overlaps([norm(item.color)], mapping.colorTargets)).map((item) => text(item.name));
    links.push({
      answer: text(mapping.colorChoice),
      decision: matched.length
        ? `выбраны ${matched.slice(0, 2).join(" и ")} по доступным цветовым данным`
        : "точного совпадения в этом комплекте нет, поэтому цвет не выдан за основание выбора",
    });
  }
  return links.slice(0, 3);
}

/** Integration hook: maps onboarding answers to supported metadata, then returns a deterministic diverse candidate order. */
export function rankDemoLooksFromOnboarding(items, preferences = {}, { limit = 12 } = {}) {
  const safeItems = Array.isArray(items) ? items.filter((item) => id(item)) : [];
  const mapping = mapPreferences(preferences, safeItems);
  const candidates = rankCandidates(generate(safeItems), mapping, Math.max(1, Math.min(Number(limit) || 12, 50)));
  const winner = candidates[0] ?? null;
  const links = winner ? decisionLinks(mapping, winner) : [];
  return {
    engineVersion: ONBOARDING_FIRST_LOOK_ENGINE_VERSION,
    applied: Object.entries(mapping.support).filter(([, value]) => value).map(([key]) => key),
    limitations: mapping.limitations,
    decisionLinks: links,
    candidates: candidates.map(({ items: candidateItems, signature: candidateSignature }) => ({ signature: candidateSignature, items: candidateItems })),
    explanation: links.length
      ? `${links.map((link) => `«${link.answer}» → ${link.decision}`).join(". ")}.`
      : "Демо-каталог не содержит достаточно подтверждённых данных для персонального ранжирования; показан детерминированный базовый комплект.",
  };
}
