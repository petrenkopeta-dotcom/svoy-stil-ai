import { createCandidateOutfit } from "./stylistReasoningSchemas.js";

/**
 * Deterministic candidate generation and ranking for Stylist Reasoning.
 * No recognition or provider calls are performed here.
 */
export const CANDIDATE_ENGINE_VERSION = "stylist-candidate-engine-v1";
export const DEFAULT_WEIGHT_PROFILE = "balanced-v1";

export const WEIGHT_PROFILES = Object.freeze({
  "balanced-v1": Object.freeze({ color: 20, silhouette: 15, occasion: 20, weather: 20, personal: 15, comfort: 10 }),
  "comfort-first-v1": Object.freeze({ color: 12, silhouette: 12, occasion: 18, weather: 23, personal: 10, comfort: 25 }),
  "occasion-first-v1": Object.freeze({ color: 15, silhouette: 15, occasion: 30, weather: 18, personal: 12, comfort: 10 }),
});

const CATEGORIES = new Set(["top", "bottom", "dress", "one_piece", "outerwear", "shoes", "accessory"]);
const OPTIONAL = new Set(["outerwear", "accessory"]);
const LEGACY_CATEGORY = [
  ["dress", /плать|комбинезон/i], ["outerwear", /верхняя одежда|жакет|пальто|куртк|тренч/i],
  ["shoes", /обув|туфл|лофер|кед|ботин|сапог/i], ["bottom", /низ|брюк|джинс|юбк|шорт/i],
  ["accessory", /аксессуар|сумк|ремень|шарф/i], ["top", /верх|рубаш|свитер|блуз|футбол|топ/i],
];
const NEUTRALS = new Set(["black", "white", "gray", "grey", "beige", "brown", "navy", "cream", "чёрный", "черный", "белый", "серый", "бежевый", "коричневый", "молочный"]);
const WARM = new Set(["red", "orange", "yellow", "coral", "burgundy", "красный", "оранжевый", "жёлтый", "желтый", "бордовый"]);
const COOL = new Set(["blue", "green", "purple", "cyan", "синий", "голубой", "зелёный", "зеленый", "фиолетовый"]);

const arr = (value) => Array.isArray(value) ? value.filter(Boolean) : value == null || value === "" ? [] : [value];
const norm = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
const overlap = (a, b) => a.some((value) => b.includes(value));
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const average = (values, fallback = 0.5) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;

function legacyCategory(item) {
  const text = `${item.type ?? ""} ${item.name ?? item.display_name ?? ""}`;
  return LEGACY_CATEGORY.find(([, pattern]) => pattern.test(text))?.[0] ?? "unknown";
}

/** Temporary stage-1 adapter. Confirmed canonical fields always win over legacy UI fields. */
export function adaptCandidateItem(item) {
  const category = CATEGORIES.has(norm(item.category)) ? norm(item.category) : legacyCategory(item);
  const legacyColors = arr(item.color).map((name) => ({ name }));
  return {
    source: item,
    id: item.garment_id ?? item.id,
    status: norm(item.status || "ready"),
    category,
    colors: arr(item.colors).length ? arr(item.colors) : legacyColors,
    styleTags: arr(item.style_tags ?? item.style).flatMap((value) => String(value).split(/[,/+·]/)).map(norm).filter(Boolean),
    seasons: arr(item.seasons).map(norm), occasions: arr(item.occasions).map(norm),
    formality: Number.isFinite(item.formality) ? item.formality : 3,
    warmth: Number.isFinite(item.warmth) ? item.warmth : 3,
    silhouette: norm(item.fit ?? item.silhouette ?? "unknown"),
    comfortTags: arr(item.comfort_tags).map(norm),
    waterproof: item.waterproof === true,
  };
}

/** Maps the stage-1 StylistRequest contract to the engine's richer local request. */
export function adaptStylistRequest(request = {}) {
  if (request.kind !== "StylistRequest") return request;
  const context = request.context?.confirmed === true ? request.context : {};
  return {
    ...request,
    anchorId: request.anchor_garment_id,
    occasion: context.occasion ?? request.occasion,
    seasons: request.seasons,
    weather: context.temperatureC == null && context.precipitation == null ? undefined : {
      temperatureC: context.temperatureC,
      precipitation: context.precipitation,
    },
    activity: context.activity,
    weightProfile: context.priority === "comfort" ? "comfort-first-v1" : context.priority === "expressiveness" ? "occasion-first-v1" : request.weightProfile,
    excludedItemIds: arr(request.excludedItemIds),
  };
}

function validateRequest(items, request) {
  if (!Array.isArray(items)) return "invalid_wardrobe";
  if (request.anchorId == null) return null;
  return items.some((item) => String(item.id) === String(request.anchorId)) ? null : "anchor_not_found";
}

function eligible(item, request) {
  if (item.id == null || item.category === "unknown" || item.status !== "ready") return false;
  if (arr(request.excludedItemIds).some((id) => String(id) === String(item.id))) return false;
  if (request.weather?.precipitation === "heavy" && item.category === "shoes" && request.weather.requireWaterproofShoes && !item.waterproof) return false;
  return true;
}

const product = (groups) => groups.reduce((sets, group) => sets.flatMap((set) => group.map((item) => [...set, item])), [[]]);
const signature = (items) => items.map((item) => String(item.id)).sort().join("|");

function generateBase(byCategory) {
  const separates = byCategory.top.length && byCategory.bottom.length && byCategory.shoes.length
    ? product([byCategory.top, byCategory.bottom, byCategory.shoes]) : [];
  const onePieces = [...byCategory.dress, ...byCategory.one_piece];
  const dresses = onePieces.length && byCategory.shoes.length ? product([onePieces, byCategory.shoes]) : [];
  return [...separates, ...dresses];
}

function expandOptional(base, byCategory, request) {
  const groups = [null, ...byCategory.outerwear, ...byCategory.accessory];
  const expanded = groups.map((extra) => extra ? [...base, extra] : base);
  if (byCategory.outerwear.length && byCategory.accessory.length) {
    for (const layer of byCategory.outerwear) for (const accessory of byCategory.accessory) expanded.push([...base, layer, accessory]);
  }
  return expanded.filter((items) => !request.weather?.outerwearRequired || items.some((item) => item.category === "outerwear"));
}

function colorFamily(color) {
  const value = norm(typeof color === "string" ? color : color?.name);
  if (NEUTRALS.has(value)) return "neutral";
  if (WARM.has(value)) return "warm";
  if (COOL.has(value)) return "cool";
  return "unknown";
}

function componentScores(items, request) {
  const colors = items.flatMap((item) => item.colors).map(colorFamily).filter((x) => x !== "unknown");
  const chromatic = [...new Set(colors.filter((x) => x !== "neutral"))];
  const color = colors.length ? (chromatic.length <= 1 ? 1 : 0.35) : 0.5;
  const silhouettes = items.filter((item) => !OPTIONAL.has(item.category)).map((item) => item.silhouette).filter((x) => x !== "unknown");
  const silhouette = silhouettes.length < 2 ? 0.6 : new Set(silhouettes).size <= 2 ? 0.9 : 0.55;
  const occasion = request.occasion ? average(items.filter((item) => !OPTIONAL.has(item.category)).map((item) => item.occasions.includes(norm(request.occasion)) ? 1 : item.occasions.length ? 0.2 : 0.5)) : 0.7;
  const targetWarmth = Number(request.weather?.targetWarmth);
  const effectiveWarmth = average(items.filter((item) => item.category !== "accessory").map((item) => item.warmth), 3);
  const weather = Number.isFinite(targetWarmth) ? clamp01(1 - Math.abs(effectiveWarmth - targetWarmth) / 4) : 0.7;
  const preferredStyles = arr(request.preferences?.styleTags).map(norm);
  const avoidedStyles = arr(request.preferences?.avoidedStyleTags).map(norm);
  const personal = preferredStyles.length ? average(items.map((item) => overlap(item.styleTags, preferredStyles) ? 1 : 0.35)) : 0.7;
  const preferredComfort = arr(request.preferences?.comfortTags).map(norm);
  const comfort = preferredComfort.length ? average(items.map((item) => overlap(item.comfortTags, preferredComfort) ? 1 : 0.55)) : 0.7;
  const avoidancePenalty = items.some((item) => overlap(item.styleTags, avoidedStyles)) ? 0.25 : 0;
  return { color, silhouette, occasion, weather, personal: clamp01(personal - avoidancePenalty), comfort };
}

function label(value) { return value >= 0.8 ? "strong" : value >= 0.55 ? "compatible" : "tradeoff"; }
function explanation(scores) {
  const names = { color: "цвета", silhouette: "силуэт", occasion: "ситуацию", weather: "погоду", personal: "личные предпочтения", comfort: "комфорт" };
  const strongest = Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  return `Комплект лучше всего учитывает ${names[strongest]}.`;
}

function rank(candidates, weights) {
  return candidates.map((candidate) => {
    const scores = candidate.scores;
    const total = Object.keys(weights).reduce((sum, key) => sum + weights[key] * scores[key], 0);
    return { ...candidate, total };
  }).sort((a, b) => b.total - a.total || a.signature.localeCompare(b.signature));
}

function prepareLearningAdjustments(context) {
  if (!context?.adjustments?.length) return [];
  return context.adjustments.map((adjustment) => ({
    adjustment,
    itemIds: (adjustment.subject?.itemIds || []).map((value) => String(value).toLowerCase()),
    traits: Object.entries(adjustment.subject || {})
      .filter(([key]) => key !== "itemIds")
      .map(([key, values]) => [key, values.map((value) => String(value).toLowerCase())]),
    replaceItemId: adjustment.replaceItemId ? String(adjustment.replaceItemId).toLowerCase() : null,
  }));
}

function learnedAdjustment(adapted, preparedAdjustments) {
  if (!preparedAdjustments.length) return { delta: 0, reasons: [] };
  const traits = {
    itemIds: new Set(adapted.map((item) => String(item.id).toLowerCase())),
    styleTags: new Set(adapted.flatMap((item) => item.styleTags)),
    colorFamilies: new Set(adapted.flatMap((item) => item.colors.map(colorFamily))),
    categories: new Set(adapted.map((item) => item.category)),
  };
  let delta = 0;
  const reasons = [];
  for (const prepared of preparedAdjustments) {
    const { adjustment } = prepared;
    const exactOutfit = prepared.itemIds.length && prepared.itemIds.every((value) => traits.itemIds.has(value));
    const matchedTrait = prepared.traits.some(([key, values]) => values.some((value) => traits[key]?.has(value)));
    const matched = exactOutfit || matchedTrait;
    const replaced = prepared.replaceItemId && traits.itemIds.has(prepared.replaceItemId);
    if (!matched && !replaced) continue;
    const value = adjustment.permanent && adjustment.weight < 0 ? -1000 : adjustment.weight;
    delta += value;
    reasons.push({ eventId: adjustment.eventId, action: adjustment.action, reason: adjustment.reason, effect: value < 0 ? "lowered" : "raised", source: adjustment.source, ruleVersion: adjustment.ruleVersion });
  }
  return { delta: Math.max(-1000, Math.min(12, delta)), reasons };
}

// Benchmark-only reference for MVP-PERF-19. Production calls never select this
// allocation-heavy pre-optimization path.
function referenceLearnedAdjustment(adapted, context) {
  if (!context?.adjustments?.length) return { delta: 0, reasons: [] };
  return learnedAdjustment(adapted.map((item) => adaptCandidateItem(item.source)), prepareLearningAdjustments(context));
}

function selectDiverse(ranked, limit) {
  const selected = [];
  const remaining = [...ranked];
  // Diversity selection is the hot path for a full (5k) candidate pool. Cache
  // membership once instead of repeatedly scanning both id arrays for every
  // candidate/selected pair. This preserves the score and tie-break ordering.
  const idSets = new Map(remaining.map((candidate) => [candidate, new Set(candidate.ids)]));
  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      let reuse = 0;
      if (selected.length) {
        const candidateIds = idSets.get(candidate);
        for (const chosen of selected) {
          let shared = 0;
          for (const id of chosen.ids) if (candidateIds.has(id)) shared += 1;
          reuse = Math.max(reuse, shared / Math.max(chosen.ids.length, candidate.ids.length));
        }
      }
      const adjusted = candidate.total - reuse * 12;
      if (adjusted > bestValue || (adjusted === bestValue && candidate.signature.localeCompare(remaining[bestIndex].signature) < 0)) {
        bestIndex = index;
        bestValue = adjusted;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected;
}

function missingReasons(items, request) {
  const categories = new Set(items.map((item) => item.category));
  const reasons = [];
  if (!categories.has("shoes")) reasons.push("missing_shoes");
  if (!(categories.has("dress") || categories.has("one_piece")) && !(categories.has("top") && categories.has("bottom"))) reasons.push("missing_outfit_base");
  if (request.weather?.outerwearRequired && !categories.has("outerwear")) reasons.push("missing_required_outerwear");
  if (request.anchorId != null && !items.some((item) => String(item.id) === String(request.anchorId))) reasons.push("anchor_unavailable");
  return reasons;
}

/**
 * Returns user-safe candidates: numeric ranking values are intentionally omitted.
 */
function generateAndRankCandidatesInternal(wardrobe, request = {}, referenceLearningAllocation = false) {
  const performanceTrace = request.performanceTrace && typeof request.performanceTrace === "object" ? request.performanceTrace : null;
  const now = performanceTrace ? () => globalThis.performance.now() : null;
  const addTrace = (name, started) => { if (performanceTrace) performanceTrace[name] = (performanceTrace[name] || 0) + now() - started; };
  const personalizationStarted = performanceTrace ? now() : 0;
  request = adaptStylistRequest(request);
  const adapted = Array.isArray(wardrobe) ? wardrobe.map(adaptCandidateItem) : [];
  const invalidReason = validateRequest(adapted, request);
  if (invalidReason) return { engineVersion: CANDIDATE_ENGINE_VERSION, weightProfile: null, candidates: [], noCandidateReasons: [invalidReason] };
  const profileName = request.weightProfile ?? DEFAULT_WEIGHT_PROFILE;
  const weights = WEIGHT_PROFILES[profileName];
  if (!weights) return { engineVersion: CANDIDATE_ENGINE_VERSION, weightProfile: profileName, candidates: [], noCandidateReasons: ["unknown_weight_profile"] };
  const items = adapted.filter((item) => eligible(item, request));
  const byCategory = Object.fromEntries([...CATEGORIES].map((category) => [category, []]));
  items.forEach((item) => byCategory[item.category].push(item));
  Object.values(byCategory).forEach((group) => group.sort((a, b) => String(a.id).localeCompare(String(b.id))));
  addTrace("onboardingPersonalizationMs", personalizationStarted);
  const anchorId = request.anchorId == null ? null : String(request.anchorId);
  const seen = new Set();
  const generated = [];
  const preparedLearningAdjustments = prepareLearningAdjustments(request.learningContext);
  const poolLimit = Math.max(100, Math.min(Number(request.candidatePoolLimit) || 5000, 10000));
  generation: for (const base of generateBase(byCategory)) {
    for (const set of expandOptional(base, byCategory, request)) {
      if (anchorId != null && !set.some((item) => String(item.id) === anchorId)) continue;
      const key = signature(set);
      if (seen.has(key)) continue;
      seen.add(key);
      const scoringStarted = performanceTrace ? now() : 0;
      const scores = componentScores(set, request);
      addTrace("candidateScoringMs", scoringStarted);
      const learningStarted = performanceTrace ? now() : 0;
      const learning = referenceLearningAllocation
        ? referenceLearnedAdjustment(set, request.learningContext)
        : learnedAdjustment(set, preparedLearningAdjustments);
      addTrace("learningAdjustmentMs", learningStarted);
      generated.push({ items: set.map((item) => item.source), ids: set.map((item) => item.id), signature: key, scores, learning });
      if (generated.length >= poolLimit) break generation;
    }
  }
  const limit = Math.max(1, Math.min(Number(request.limit) || 20, 50));
  const ranked = rank(generated, weights).map((candidate) => ({ ...candidate, total: candidate.total + candidate.learning.delta }));
  const diversityStarted = performanceTrace ? now() : 0;
  const diverse = selectDiverse(ranked, limit);
  addTrace("diversityMs", diversityStarted);
  const explanationStarted = performanceTrace ? now() : 0;
  const candidates = diverse.map(({ items: candidateItems, signature: key, scores, total, learning }) => ({
      signature: key, itemIds: candidateItems.map((item) => item.garment_id ?? item.id), items: candidateItems,
      candidate: createCandidateOutfit({ candidate_id: `${request.request_id ?? "local"}:${key}`, request_id: request.request_id ?? "local", garment_ids: candidateItems.map((item) => String(item.garment_id ?? item.id)), generator_version: CANDIDATE_ENGINE_VERSION }),
      rankingLevel: total >= 80 ? "excellent" : total >= 60 ? "good" : "needs_change",
      scoreBreakdown: Object.fromEntries(Object.entries(scores).map(([name, value]) => [name, label(value)])),
      explanation: explanation(scores), generatorVersion: CANDIDATE_ENGINE_VERSION, weightProfile: profileName,
      preferenceVersion: request.learningContext?.preferenceVersion ?? null, rankingReasons: learning.reasons,
    }));
  addTrace("explanationTraceMs", explanationStarted);
  return { engineVersion: CANDIDATE_ENGINE_VERSION, weightProfile: profileName, candidates, noCandidateReasons: candidates.length ? [] : missingReasons(items, request) };
}

export function generateAndRankCandidates(wardrobe, request = {}) {
  return generateAndRankCandidatesInternal(wardrobe, request, false);
}

/** Benchmark-only allocation-heavy reference used by the MVP-PERF-19 gate. */
export function generateAndRankCandidatesReference(wardrobe, request = {}) {
  return generateAndRankCandidatesInternal(wardrobe, request, true);
}
