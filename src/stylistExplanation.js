export const STYLIST_EXPLANATION_VERSION = "stylist-explanation/1.1.0";

const FACT_TEXT = Object.freeze({
  NEUTRAL_BASE_SINGLE_ACCENT: { section: "colors", text: "Нейтральная основа поддерживает один цветовой акцент, поэтому палитра выглядит собранно.", short: "Нейтральная основа поддерживает один цветовой акцент." },
  COLOR_FAMILY_REPEATED: { section: "colors", text: "Один цветовой тон повторяется в нескольких вещах и связывает их между собой.", short: "Повтор цвета связывает вещи между собой." },
  RELATED_SHADES_PRESENT: { section: "colors", text: "Близкие оттенки продолжают друг друга и создают спокойное сочетание.", short: "Близкие оттенки создают спокойное сочетание." },
  MODERATE_LIGHTNESS_CONTRAST: { section: "colors", text: "Разница между светлыми и тёмными вещами заметна, но не дробит образ.", short: "Умеренный контраст делает сочетание выразительным." },
  LIGHT_DARK_BALANCED: { section: "colors", text: "Светлые и тёмные элементы распределены равномерно, поэтому палитра воспринимается устойчиво.", short: "Светлые и тёмные элементы уравновешены." },
  SATURATION_SINGLE_FOCUS: { section: "colors", text: "Один насыщенный элемент остаётся главным, а более спокойные цвета не спорят с ним.", short: "Один насыщенный элемент задаёт фокус." },
  SATURATION_LOAD_HIGH: { section: "colors", text: "В образе одновременно несколько насыщенных цветов, поэтому он может восприниматься активным.", short: "Несколько насыщенных цветов делают образ активным.", warning: true },
  MULTIPLE_ACCENTS_CONFLICT: { section: "colors", text: "Несколько разных цветовых акцентов конкурируют за внимание.", short: "Цветовые акценты конкурируют за внимание.", warning: true },
  COLOR_DATA_INSUFFICIENT: { section: "colors", text: "Подтверждённых данных о цветах пока недостаточно, поэтому оценка сочетания цветов не сформирована.", short: "Для оценки цветов пока недостаточно данных.", warning: true },
  SILHOUETTE_VOLUME_BALANCED: { section: "silhouette", text: "Объём распределён между частями комплекта так, чтобы силуэт не выглядел перегруженным.", short: "Объём в комплекте распределён сбалансированно." },
  STRUCTURED_RELAXED_BALANCE: { section: "silhouette", text: "Более собранная вещь уравновешивает свободную, сохраняя ясную форму образа.", short: "Собранная и свободная формы уравновешивают друг друга." },
  SIL_VOLUME_DOUBLE_OVERSIZED: { section: "silhouette", text: "Верх и низ подтверждены как объёмные, поэтому сочетание может выглядеть перегруженным.", short: "Объёмные верх и низ могут перегружать сочетание." },
  SIL_VOLUME_DOUBLE_FITTED: { section: "silhouette", text: "Верх и низ подтверждены как облегающие; более свободный элемент может добавить разнообразия форме комплекта.", short: "Верх и низ подтверждены как облегающие." },
  SIL_OUTER_SHORTER_THAN_TOP: { section: "silhouette", text: "Подтверждённый верхний слой короче вещи под ним, поэтому её край останется видимым.", short: "Верхний слой короче вещи под ним." },
  SIL_OVERLAPPING_LONG_LENGTHS: { section: "silhouette", text: "Верх и низ имеют подтверждённую длину миди или больше, поэтому длинные линии накладываются друг на друга.", short: "Длинные линии верха и низа накладываются." },
  SIL_WAISTLINE_PREFERENCE_MISMATCH: { section: "silhouette", text: "Подтверждённая посадка низа не совпадает с явно указанным предпочтением по линии талии.", short: "Посадка низа не совпадает с указанным предпочтением." },
  CONTEXT_FORMALITY_MATCH: { section: "context", text: "Уровень формальности вещей соответствует указанному контексту.", short: "Формальность комплекта соответствует контексту." },
  CONTEXT_CASUAL_MATCH: { section: "context", text: "Непринуждённый характер вещей соответствует повседневному контексту.", short: "Комплект подходит для повседневного контекста." },
  WEATHER_LAYERING_SUPPORTED: { section: "context", text: "Слои позволяют адаптировать комплект к указанным погодным условиям.", short: "Слои помогают адаптироваться к погоде." },
  CTX_FORMALITY_BELOW_MINIMUM: { section: "context", text: "Подтверждённая формальность комплекта ниже явно указанного минимума для этого контекста.", short: "Формальность комплекта ниже указанного минимума." },
  CTX_OCCASION_EXPLICITLY_EXCLUDED: { section: "context", text: "Указанный повод явно исключён в подтверждённых данных этого комплекта.", short: "Указанный повод исключён для комплекта." },
  CTX_TOO_COLD_FOR_OUTFIT: { section: "context", text: "Указанная температура ниже подтверждённой минимальной температуры для комплекта.", short: "Для указанной температуры комплект недостаточно тёплый." },
  CTX_TOO_WARM_FOR_OUTFIT: { section: "context", text: "Указанная температура выше подтверждённой максимальной температуры для комплекта.", short: "Для указанной температуры комплект слишком тёплый." },
  CTX_LONG_WALK_LOW_SHOE_COMFORT: { section: "context", text: "Запланирована долгая прогулка, а комфорт обуви для ходьбы подтверждён как низкий.", short: "Обувь с низким комфортом не подходит для долгой прогулки." },
  CTX_ACTIVE_EVENT_RESTRICTED_MOBILITY: { section: "context", text: "Для активного события подтверждённая свобода движения комплекта ограничена.", short: "Комплект ограничивает движение для активного события." },
  CTX_LONG_STANDING_MEDIUM_SHOE_COMFORT: { section: "context", text: "Предстоит долго стоять, а комфорт обуви для этого подтверждён только как средний.", short: "Для долгого стояния комфорт обуви подтверждён как средний." },
  PROFILE_COMFORT_NO_HEELS: { section: "profile", text: "Учтено подтверждённое предпочтение обходиться без каблуков.", short: "Учтено предпочтение без каблуков." },
  PROFILE_COLOR_PREFERENCE_MATCH: { section: "profile", text: "Палитра соответствует подтверждённому цветовому предпочтению из профиля.", short: "Учтено цветовое предпочтение из профиля." },
  PROFILE_STYLE_PREFERENCE_MATCH: { section: "profile", text: "Характер комплекта соответствует подтверждённому стилевому предпочтению из профиля.", short: "Учтено стилевое предпочтение из профиля." },
});

const SECTION_META = Object.freeze({
  colors: { title: "Цвета", fallback: "О сочетании цветов нет подтверждённых данных." },
  silhouette: { title: "Силуэт", fallback: "О балансе силуэта нет подтверждённых данных." },
  context: { title: "Контекст", fallback: "Подходящий контекст пока не подтверждён." },
  profile: { title: "Профиль", fallback: "Подтверждённые предпочтения профиля не использованы." },
});

export const STYLIST_ACTIONS = Object.freeze([
  { code: "calmer", label: "Сделать спокойнее", instruction: "Уменьшить число акцентов и оставить более сдержанные элементы.", aria_label: "Изменить образ: сделать его спокойнее" },
  { code: "brighter", label: "Сделать ярче", instruction: "Добавить один заметный цветовой акцент, не меняя весь комплект.", aria_label: "Изменить образ: сделать его ярче" },
  { code: "more_formal", label: "Сделать официальнее", instruction: "Заменить один повседневный элемент на более структурированный.", aria_label: "Изменить образ: сделать его официальнее" },
  { code: "more_comfortable", label: "Сделать комфортнее", instruction: "Выбрать более свободную или мягкую альтернативу с тем же назначением.", aria_label: "Изменить образ: сделать его комфортнее" },
  { code: "replace_shoes_only", label: "Заменить только обувь", instruction: "Сохранить остальные вещи и подобрать другую пару обуви.", aria_label: "Изменить образ: заменить только обувь" },
]);

const uniqueFacts = (facts) => {
  const seen = new Set();
  return (Array.isArray(facts) ? facts : []).filter((fact) => {
    if (!fact || typeof fact.code !== "string" || fact.confirmed === false || seen.has(fact.code)) return false;
    seen.add(fact.code);
    return true;
  });
};

function practicalAdvice(known) {
  if (known.some(({ code }) => code === "MULTIPLE_ACCENTS_CONFLICT" || code === "SATURATION_LOAD_HIGH")) return "Практический совет: оставьте один главный цветовой акцент, если хотите сделать комплект спокойнее.";
  if (known.some(({ code }) => code === "CTX_TOO_COLD_FOR_OUTFIT")) return "Практический совет: добавьте подтверждённо тёплый слой или выберите более тёплую альтернативу.";
  if (known.some(({ code }) => code === "CTX_TOO_WARM_FOR_OUTFIT")) return "Практический совет: уберите один слой или замените его на более лёгкую подтверждённую альтернативу.";
  if (known.some(({ code }) => code === "CTX_LONG_WALK_LOW_SHOE_COMFORT" || code === "CTX_LONG_STANDING_MEDIUM_SHOE_COMFORT")) return "Практический совет: сохраните комплект, но замените обувь на пару с подтверждённым комфортом для ходьбы.";
  if (known.some(({ code }) => code === "CTX_ACTIVE_EVENT_RESTRICTED_MOBILITY")) return "Практический совет: замените самый сковывающий элемент на вещь с подтверждённой свободой движения.";
  if (known.some(({ code }) => code === "SIL_VOLUME_DOUBLE_OVERSIZED")) return "Практический совет: сохраните одну объёмную вещь, а вторую замените на более собранную по форме.";
  if (known.some(({ code }) => code === "SIL_OVERLAPPING_LONG_LENGTHS" || code === "SIL_OUTER_SHORTER_THAN_TOP")) return "Практический совет: проверьте образ в полный рост и при движении — важна видимая граница слоёв.";
  if (known.some(({ code }) => code === "CTX_FORMALITY_BELOW_MINIMUM")) return "Практический совет: замените один повседневный элемент на более структурированный, сохранив остальной комплект.";
  if (known.some(({ code }) => code === "COLOR_DATA_INSUFFICIENT")) return "Практический совет: подтвердите цвета хотя бы двух вещей, чтобы получить объяснение палитры.";
  if (known.length) return "Практический совет: меняйте по одному элементу, чтобы было понятно, как он влияет на образ.";
  return "Практический совет: подтвердите характеристики вещей, чтобы получить объяснение без догадок.";
}

export function renderStylistExplanation(facts, options = {}) {
  const length = options.length === "short" ? "short" : "long";
  const input = uniqueFacts(facts);
  const known = input.filter(({ code }) => FACT_TEXT[code]);
  const unknown_codes = input.filter(({ code }) => !FACT_TEXT[code]).map(({ code }) => code);
  const sections = Object.entries(SECTION_META).map(([id, meta]) => {
    const matches = known.filter(({ code }) => FACT_TEXT[code].section === id);
    const lines = matches.map(({ code }) => FACT_TEXT[code][length === "short" ? "short" : "text"]);
    return { id, title: meta.title, text: lines.length ? (length === "short" ? lines[0] : lines.join(" ")) : meta.fallback, supported: lines.length > 0 };
  });
  const advice = practicalAdvice(known);
  const summary = known.length ? "Объяснение составлено по подтверждённым фактам об образе." : "Пока недостаточно подтверждённых фактов для объяснения образа.";
  const actions = STYLIST_ACTIONS.map((action) => ({ ...action }));
  const plain_text = [summary, ...sections.map((section) => `${section.title}. ${section.text}`), advice].join("\n");
  return { renderer_version: STYLIST_EXPLANATION_VERSION, locale: "ru-RU", length, summary, sections, advice, actions, plain_text, accessibility_label: plain_text, unknown_codes };
}
