export const OUTFIT_EXPLANATION_V2_VERSION = "outfit-explanation/2.0.0";

const SECTION_ORDER = Object.freeze(["color", "silhouette", "context", "practical_advice"]);
const UNKNOWN = Object.freeze({
  color: "Недостаточно подтверждённых данных о цветах вещей.",
  silhouette: "Недостаточно подтверждённых данных об объёме, посадке или длине вещей.",
  context: "Недостаточно подтверждённых данных о ситуации и условиях.",
  practical_advice: "Без подтверждённого факта конкретный совет не предлагается.",
});

const TEMPLATES = Object.freeze({
  NEUTRAL_BASE_SINGLE_ACCENT: { section: "color", kind: "support", text: "Нейтральная основа поддерживает один подтверждённый цветовой акцент." },
  COLOR_FAMILY_REPEATED: { section: "color", kind: "support", text: "Повтор подтверждённого цвета связывает вещи в комплекте." },
  RELATED_SHADES_PRESENT: { section: "color", kind: "support", text: "Подтверждённые близкие оттенки создают спокойный цветовой переход." },
  MULTIPLE_ACCENTS_CONFLICT: { section: "color", kind: "tradeoff", text: "Несколько подтверждённых цветовых акцентов могут конкурировать за внимание.", advice: "Чтобы сделать комплект спокойнее, оставьте один акцент." },
  SATURATION_LOAD_HIGH: { section: "color", kind: "tradeoff", text: "Несколько подтверждённых насыщенных цветов делают комплект визуально активнее.", advice: "Для более спокойного варианта замените один насыщенный элемент вещью нейтрального цвета из гардероба." },
  SILHOUETTE_VOLUME_BALANCED: { section: "silhouette", kind: "support", text: "Подтверждённые объёмы вещей распределены между верхом и низом." },
  STRUCTURED_RELAXED_BALANCE: { section: "silhouette", kind: "support", text: "Подтверждённая собранная форма одной вещи уравновешивает более свободную форму другой." },
  SIL_VOLUME_DOUBLE_OVERSIZED: { section: "silhouette", kind: "tradeoff", text: "Верх и низ подтверждены как объёмные, поэтому форма комплекта может быть менее собранной.", advice: "Если нужна более собранная форма, замените одну объёмную вещь на вещь с подтверждённой прямой или обычной посадкой." },
  SIL_OUTER_SHORTER_THAN_TOP: { section: "silhouette", kind: "tradeoff", text: "Подтверждённый верхний слой короче вещи под ним, поэтому граница слоёв будет видна.", advice: "Проверьте границу слоёв в полный рост и в движении." },
  CONTEXT_FORMALITY_MATCH: { section: "context", kind: "support", text: "Подтверждённая формальность комплекта соответствует указанной ситуации." },
  CTX_FORMALITY_BELOW_MINIMUM: { section: "context", kind: "tradeoff", text: "Подтверждённая формальность комплекта ниже указанного минимума для ситуации.", advice: "Замените один повседневный элемент на более структурированную вещь из гардероба." },
  CTX_TOO_COLD_FOR_OUTFIT: { section: "context", kind: "tradeoff", text: "Указанная температура ниже подтверждённого диапазона комплекта.", advice: "Добавьте вещь с подтверждённым тёплым слоем из гардероба." },
  CTX_TOO_WARM_FOR_OUTFIT: { section: "context", kind: "tradeoff", text: "Указанная температура выше подтверждённого диапазона комплекта.", advice: "Уберите один слой или выберите подтверждённую более лёгкую вещь из гардероба." },
  CTX_LONG_WALK_LOW_SHOE_COMFORT: { section: "context", kind: "tradeoff", text: "Для указанной долгой прогулки комфорт этой пары обуви подтверждён как низкий.", advice: "Сохраните комплект и выберите из гардероба обувь с подтверждённым комфортом для ходьбы." },
});

const cleanIds = (value) => [...new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))];

function groundedFacts(input, outfitIds) {
  const wardrobeIds = new Set(cleanIds(input.personalWardrobeItemIds));
  if (!outfitIds.length || outfitIds.some((id) => !wardrobeIds.has(id))) return [];
  const seen = new Set();
  return (Array.isArray(input.facts) ? input.facts : []).filter((fact) => {
    const itemIds = cleanIds(fact?.item_ids ?? fact?.itemIds);
    if (!fact || fact.confirmed !== true || !TEMPLATES[fact.code] || seen.has(fact.code)) return false;
    if (!itemIds.length || itemIds.some((id) => !outfitIds.includes(id))) return false;
    seen.add(fact.code);
    return true;
  });
}

function section(name, facts) {
  const matches = facts.filter((fact) => TEMPLATES[fact.code].section === name);
  if (!matches.length) return { status: "unknown", fact_codes: [], text: UNKNOWN[name] };
  const templates = matches.map((fact) => TEMPLATES[fact.code]);
  return {
    status: templates.some(({ kind }) => kind === "tradeoff") ? "tradeoff" : "supported",
    fact_codes: matches.map(({ code }) => code),
    text: templates.map(({ text }) => text).join(" "),
  };
}

export function explainPersonalOutfitV2(input = {}) {
  const outfitItemIds = cleanIds(input.outfitItemIds);
  const personal = input.source === "personal";
  const wardrobeIds = new Set(cleanIds(input.personalWardrobeItemIds));
  const wardrobeBound = personal && outfitItemIds.length > 0 && outfitItemIds.every((id) => wardrobeIds.has(id));
  const facts = wardrobeBound ? groundedFacts(input, outfitItemIds) : [];
  const dimensions = Object.fromEntries(SECTION_ORDER.slice(0, 3).map((name) => [name, section(name, facts)]));
  const tradeoffs = facts.filter((fact) => TEMPLATES[fact.code].kind === "tradeoff").map(({ code }) => code);
  const adviceFact = facts.find((fact) => TEMPLATES[fact.code].advice);
  dimensions.practical_advice = adviceFact
    ? { status: "supported", fact_codes: [adviceFact.code], text: TEMPLATES[adviceFact.code].advice }
    : { status: "unknown", fact_codes: [], text: UNKNOWN.practical_advice };
  const knownSections = Object.values(dimensions).filter(({ status }) => status !== "unknown").length;

  return {
    version: OUTFIT_EXPLANATION_V2_VERSION,
    source: personal ? "personal" : "unsupported",
    status: wardrobeBound && knownSections ? "ready" : "hold",
    outfit_id: typeof input.outfitId === "string" && input.outfitId.trim() ? input.outfitId.trim() : null,
    item_ids: wardrobeBound ? outfitItemIds : [],
    dimensions,
    tradeoffs,
    unknowns: SECTION_ORDER.filter((name) => dimensions[name].status === "unknown"),
    limitation: "Вывод относится только к подтверждённым данным о вещах и контексте; посадка и комфорт без примерки не подтверждены.",
  };
}
