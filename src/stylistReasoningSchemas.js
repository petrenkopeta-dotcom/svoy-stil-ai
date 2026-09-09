export const STYLIST_REASONING_SCHEMA_VERSION = "1.0";
export const STYLIST_REASONING_RULESET_VERSION = "stylist-rules/1.0";

export const TAXONOMY = Object.freeze({
  categories: ["top", "bottom", "dress", "outerwear", "shoes", "accessory", "one_piece", "unknown"],
  styles: ["smart_casual", "casual", "feminine", "minimal", "old_money", "sporty", "romantic", "business", "evening", "streetwear", "classic", "unknown"],
  seasons: ["spring", "summer", "autumn", "winter", "all_season"],
  patterns: ["solid", "stripe", "check", "floral", "animal", "geometric", "logo", "abstract", "other", "unknown"],
  fits: ["fitted", "straight", "relaxed", "oversized", "a_line", "bodycon", "wide", "tapered", "other", "unknown"],
  lengths: ["cropped", "mini", "short", "regular", "midi", "maxi", "ankle", "full", "not_applicable", "unknown"],
});

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const copy = value => JSON.parse(JSON.stringify(value));
const object = (value, path) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  return value;
};
const text = (value, path, { optional = false, max = 240 } = {}) => {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > max) throw new TypeError(`${path} must be a non-empty string up to ${max} chars`);
  return value;
};
const number = (value, path, min, max, fallback) => {
  const result = value ?? fallback;
  if (typeof result !== "number" || !Number.isFinite(result) || result < min || result > max) throw new RangeError(`${path} must be between ${min} and ${max}`);
  return result;
};
const integer = (value, path, min, max, fallback) => {
  const result = number(value, path, min, max, fallback);
  if (!Number.isInteger(result)) throw new TypeError(`${path} must be an integer`);
  return result;
};
const enumValue = (value, path, allowed, fallback) => {
  const result = value ?? fallback;
  if (!allowed.includes(result)) throw new RangeError(`${path} is not supported`);
  return result;
};
const strings = (value, path, { fallback = [], allowed, max = 20 } = {}) => {
  const result = value ?? fallback;
  if (!Array.isArray(result) || result.length > max || result.some(x => typeof x !== "string" || !x)) throw new TypeError(`${path} must be a string array`);
  const unique = [...new Set(result)];
  if (allowed && unique.some(x => !allowed.includes(x))) throw new RangeError(`${path} contains an unsupported value`);
  return unique;
};
const versioned = (input, kind) => {
  object(input, kind);
  if ((input.schema_version ?? STYLIST_REASONING_SCHEMA_VERSION) !== STYLIST_REASONING_SCHEMA_VERSION) throw new RangeError(`${kind}.schema_version is not supported`);
  return { schema_version: STYLIST_REASONING_SCHEMA_VERSION, kind };
};
const id = (value, path) => text(String(value ?? ""), path, { max: 120 });
const hex = (value, path) => {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new TypeError(`${path} must be #RRGGBB`);
  return value.toUpperCase();
};

export function createGarmentStyleFeatures(input = {}) {
  const base = versioned(input, "GarmentStyleFeatures");
  const colors = input.colors ?? [];
  if (!Array.isArray(colors) || colors.length > 5) throw new TypeError("GarmentStyleFeatures.colors must be an array of at most 5 colors");
  const normalizedColors = colors.map((color, index) => {
    object(color, `colors[${index}]`);
    return {
      name: text(color.name, `colors[${index}].name`, { max: 40 }),
      hex: hex(color.hex, `colors[${index}].hex`),
      share: number(color.share, `colors[${index}].share`, 0, 1, 0),
      role: enumValue(color.role, `colors[${index}].role`, ["dominant", "supporting", "accent"], index === 0 ? "dominant" : "supporting"),
    };
  });
  const share = normalizedColors.reduce((sum, color) => sum + color.share, 0);
  if (share > 1.000001) throw new RangeError("GarmentStyleFeatures color shares must not exceed 1");
  return {
    ...base,
    garment_id: id(input.garment_id, "GarmentStyleFeatures.garment_id"),
    revision: integer(input.revision, "GarmentStyleFeatures.revision", 1, Number.MAX_SAFE_INTEGER, 1),
    category: enumValue(input.category, "GarmentStyleFeatures.category", TAXONOMY.categories, "unknown"),
    subcategory: text(input.subcategory ?? "unknown", "GarmentStyleFeatures.subcategory", { max: 80 }),
    colors: normalizedColors,
    lightness: number(input.lightness, "GarmentStyleFeatures.lightness", 0, 1, 0.5),
    saturation: number(input.saturation, "GarmentStyleFeatures.saturation", 0, 1, 0.5),
    temperature: enumValue(input.temperature, "GarmentStyleFeatures.temperature", ["cool", "neutral", "warm", "unknown"], "unknown"),
    pattern: enumValue(input.pattern, "GarmentStyleFeatures.pattern", TAXONOMY.patterns, "unknown"),
    texture: enumValue(input.texture, "GarmentStyleFeatures.texture", ["smooth", "soft", "ribbed", "chunky", "fuzzy", "sheer", "structured", "glossy", "matte", "other", "unknown"], "unknown"),
    fit: enumValue(input.fit ?? input.silhouette, "GarmentStyleFeatures.fit", TAXONOMY.fits, "unknown"),
    volume: enumValue(input.volume, "GarmentStyleFeatures.volume", ["close", "regular", "relaxed", "voluminous", "unknown"], "unknown"),
    length: enumValue(input.length, "GarmentStyleFeatures.length", TAXONOMY.lengths, "unknown"),
    formality: integer(input.formality, "GarmentStyleFeatures.formality", 1, 5, 3),
    seasons: strings(input.seasons, "GarmentStyleFeatures.seasons", { fallback: ["all_season"], allowed: TAXONOMY.seasons, max: 5 }),
    warmth: integer(input.warmth, "GarmentStyleFeatures.warmth", 1, 5, 3),
    accent: integer(input.accent, "GarmentStyleFeatures.accent", 1, 5, 3),
    style_tags: strings(input.style_tags, "GarmentStyleFeatures.style_tags", { allowed: TAXONOMY.styles, max: 7 }),
  };
}

export function garmentFeaturesFromLegacyCard(card) {
  object(card, "legacyCard");
  const sourceColors = Array.isArray(card.colors) ? card.colors : card.color ? [{ name: card.color, hex: "#808080", share: 1 }] : [];
  return createGarmentStyleFeatures({
    garment_id: card.id,
    category: TAXONOMY.categories.includes(card.category) ? card.category : "unknown",
    subcategory: card.subcategory || card.type || "unknown",
    colors: sourceColors.map((color, index) => ({ ...color, hex: color.hex || "#808080", share: color.share ?? (index ? 0 : 1), role: color.role })),
    style_tags: Array.isArray(card.style_tags) ? card.style_tags : [],
    seasons: card.seasons,
    formality: card.formality,
    warmth: card.warmth,
    pattern: card.pattern,
    fit: card.silhouette,
    length: card.length,
  });
}

export function createStylistRequest(input = {}) {
  const base = versioned(input, "StylistRequest");
  let context = null;
  if (input.context != null) {
    const source = object(input.context, "StylistRequest.context");
    if (source.mapping_version !== "context-to-stylist-request/1.0") throw new RangeError("StylistRequest.context.mapping_version is not supported");
    context = { mapping_version: source.mapping_version, confirmed: source.confirmed === true, source: enumValue(source.source, "StylistRequest.context.source", ["manual"], "manual") };
    if (source.city != null) context.city = text(source.city, "StylistRequest.context.city", { max: 80 });
    if (source.occasion != null) context.occasion = text(source.occasion, "StylistRequest.context.occasion", { max: 80 });
    if (source.temperatureC != null) context.temperatureC = number(source.temperatureC, "StylistRequest.context.temperatureC", -60, 60);
    if (source.precipitation != null) context.precipitation = enumValue(source.precipitation, "StylistRequest.context.precipitation", ["none", "rain", "snow", "mixed"]);
    if (source.wind != null) context.wind = enumValue(source.wind, "StylistRequest.context.wind", ["calm", "breezy", "strong"]);
    if (source.feelsLike != null) context.feelsLike = enumValue(source.feelsLike, "StylistRequest.context.feelsLike", ["colder", "as_expected", "warmer"]);
    if (source.standingMinutes != null) context.standingMinutes = integer(source.standingMinutes, "StylistRequest.context.standingMinutes", 0, 720);
    if (source.activity != null) context.activity = enumValue(source.activity, "StylistRequest.context.activity", ["low", "moderate", "active"]);
    if (source.priority != null) context.priority = enumValue(source.priority, "StylistRequest.context.priority", ["balanced", "comfort", "expressiveness"]);
  }
  return { ...base, request_id: id(input.request_id, "StylistRequest.request_id"), garment_ids: strings(input.garment_ids, "StylistRequest.garment_ids", { max: 100 }), occasion: text(input.occasion, "StylistRequest.occasion", { optional: true, max: 80 }), seasons: strings(input.seasons, "StylistRequest.seasons", { allowed: TAXONOMY.seasons, max: 5 }), constraints: strings(input.constraints, "StylistRequest.constraints", { max: 20 }), anchor_garment_id: input.anchor_garment_id == null ? null : id(input.anchor_garment_id, "StylistRequest.anchor_garment_id"), context };
}

export function createCandidateOutfit(input = {}) {
  const base = versioned(input, "CandidateOutfit");
  const garmentIds = strings(input.garment_ids, "CandidateOutfit.garment_ids", { max: 20 });
  if (!garmentIds.length) throw new RangeError("CandidateOutfit.garment_ids must not be empty");
  return { ...base, candidate_id: id(input.candidate_id, "CandidateOutfit.candidate_id"), request_id: id(input.request_id, "CandidateOutfit.request_id"), garment_ids: garmentIds, generator_version: text(input.generator_version ?? STYLIST_REASONING_RULESET_VERSION, "CandidateOutfit.generator_version", { max: 80 }) };
}

export function createReasoningFact(input = {}) {
  const base = versioned(input, "ReasoningFact");
  return { ...base, fact_id: id(input.fact_id, "ReasoningFact.fact_id"), rule_id: text(input.rule_id, "ReasoningFact.rule_id", { max: 100 }), rule_version: text(input.rule_version ?? STYLIST_REASONING_RULESET_VERSION, "ReasoningFact.rule_version", { max: 80 }), outcome: enumValue(input.outcome, "ReasoningFact.outcome", ["pass", "fail", "neutral"], "neutral"), weight: number(input.weight, "ReasoningFact.weight", -1, 1, 0), message_key: text(input.message_key, "ReasoningFact.message_key", { max: 120 }), evidence: strings(input.evidence, "ReasoningFact.evidence", { max: 20 }) };
}

export function createAlternativeAction(input = {}) {
  const base = versioned(input, "AlternativeAction");
  return { ...base, action_id: id(input.action_id, "AlternativeAction.action_id"), type: enumValue(input.type, "AlternativeAction.type", ["replace", "remove", "add", "adjust_request"], "replace"), target_garment_id: input.target_garment_id == null ? null : id(input.target_garment_id, "AlternativeAction.target_garment_id"), replacement_garment_id: input.replacement_garment_id == null ? null : id(input.replacement_garment_id, "AlternativeAction.replacement_garment_id"), reason_fact_ids: strings(input.reason_fact_ids, "AlternativeAction.reason_fact_ids", { max: 20 }) };
}

export function createScoredRecommendation(input = {}) {
  const base = versioned(input, "ScoredRecommendation");
  return { ...base, recommendation_id: id(input.recommendation_id, "ScoredRecommendation.recommendation_id"), candidate: createCandidateOutfit(input.candidate), score: number(input.score, "ScoredRecommendation.score", 0, 100, 0), level: enumValue(input.level, "ScoredRecommendation.level", ["excellent", "good", "needs_change"], "needs_change"), facts: (input.facts ?? []).map(createReasoningFact), alternatives: (input.alternatives ?? []).map(createAlternativeAction), ruleset_version: text(input.ruleset_version ?? STYLIST_REASONING_RULESET_VERSION, "ScoredRecommendation.ruleset_version", { max: 80 }) };
}

const creators = { StylistRequest: createStylistRequest, GarmentStyleFeatures: createGarmentStyleFeatures, CandidateOutfit: createCandidateOutfit, ReasoningFact: createReasoningFact, ScoredRecommendation: createScoredRecommendation, AlternativeAction: createAlternativeAction };
export function parseStylistEntity(value) {
  object(value, "entity");
  const creator = creators[value.kind];
  if (!creator) throw new RangeError("entity.kind is not supported");
  return creator(copy(value));
}
export const serializeStylistEntity = value => JSON.stringify(parseStylistEntity(value));
export const deserializeStylistEntity = json => parseStylistEntity(JSON.parse(json));
