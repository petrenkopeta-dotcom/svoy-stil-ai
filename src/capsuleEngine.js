import {
  CAPSULE_ENGINE_VERSION, canonicalSignature, emptyCapsuleResult, garmentCategory,
  garmentId, garmentScope, validateCapsuleRequest,
} from "./capsuleDomain.js";

const POOL_LIMIT = 500;
const BASE_CATEGORIES = new Set(["top", "bottom", "dress", "one_piece", "shoes"]);
const norm = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
const array = (value) => Array.isArray(value) ? value : [];
const unique = (values) => [...new Set(values)];
const compare = (a, b) => String(a).localeCompare(String(b));
const product = (groups) => groups.reduce((sets, group) => sets.flatMap((set) => group.map((item) => [...set, item])), [[]]);

function publicItem(item) {
  return { ...item, id: garmentId(item), category: garmentCategory(item) };
}

function combinations(groups, constraints, scenario) {
  const bases = groups.top.length && groups.bottom.length && groups.shoes.length
    ? product([groups.top, groups.bottom, groups.shoes]) : [];
  const onePieces = [...groups.dress, ...groups.one_piece];
  if (onePieces.length && groups.shoes.length) bases.push(...product([onePieces, groups.shoes]));
  const outerwear = scenario.weather?.outerwearRequired ? groups.outerwear : [null, ...groups.outerwear];
  const accessories = constraints?.maxAccessories === 0 ? [null] : [null, ...groups.accessory];
  if (constraints?.maxOuterwear === 0 && !scenario.weather?.outerwearRequired) outerwear.splice(1);
  return bases.flatMap((base) => outerwear.flatMap((layer) => accessories.map((accessory) =>
    [...base, layer, accessory].filter(Boolean))));
}

function evaluateOutfit(items, scenario) {
  const reasons = [];
  const occasion = norm(scenario.occasion);
  let occasionKnown = false;
  for (const item of items.filter((entry) => BASE_CATEGORIES.has(entry.category))) {
    const occasions = array(item.occasions).map(norm).filter((value) => value && value !== "unknown");
    if (!occasions.length) continue;
    occasionKnown = true;
    if (occasion && !occasions.includes(occasion)) return null;
  }
  if (!occasion || !occasionKnown) reasons.push("occasion_data_insufficient");
  const weather = scenario.weather ?? {};
  if (!Object.keys(weather).length) reasons.push("weather_not_evaluated");
  if (weather.waterproofShoesRequired && !items.some((item) => item.category === "shoes" && item.waterproof === true)) return null;
  const colorKnown = items.some((item) => array(item.colors).some((color) => norm(color?.name ?? color) !== "unknown"));
  const silhouetteKnown = items.filter((item) => BASE_CATEGORIES.has(item.category)).some((item) => !["", "unknown"].includes(norm(item.fit ?? item.silhouette)));
  if (!colorKnown) reasons.push("color_data_insufficient");
  if (!silhouetteKnown) reasons.push("silhouette_data_insufficient");
  const ids = items.map((item) => item.id).sort(compare);
  return { itemIds: ids, signature: canonicalSignature(ids), reasonCodes: unique(reasons).sort() };
}

function missingPieces(items, scenarios) {
  const categories = new Set(items.map((item) => item.category));
  const suggestions = [];
  const add = (slot, reason, predicate) => {
    const unlocks = scenarios.filter(predicate).map((scenario) => ({ scenarioId: scenario.scenarioId, additionalLooks: 1 }));
    if (unlocks.length) suggestions.push({ slot, requirement: {}, unlocks, reasonCodes: [reason] });
  };
  if (!categories.has("shoes")) add("shoes", "missing_shoes", () => true);
  else if (!items.some((item) => item.category === "shoes" && item.waterproof === true)) {
    const unlocks = scenarios.filter((scenario) => scenario.weather?.waterproofShoesRequired === true)
      .map((scenario) => ({ scenarioId: scenario.scenarioId, additionalLooks: 1 }));
    if (unlocks.length) suggestions.push({ slot: "shoes", requirement: { precipitation: "rain" }, unlocks, reasonCodes: ["missing_shoes"] });
  }
  if (!(categories.has("dress") || categories.has("one_piece")) && !(categories.has("top") && categories.has("bottom"))) add(categories.has("top") ? "bottom" : "top", "missing_outfit_base", () => true);
  if (!categories.has("outerwear")) add("outerwear", "missing_required_outerwear", (scenario) => scenario.weather?.outerwearRequired === true);
  return suggestions.slice(0, 3);
}

function selectItems(items, anchors, pools, target) {
  const selected = new Set(anchors.map((anchor) => anchor.itemId));
  // Reserve the smallest stable structural candidates that can exercise every
  // anchor. This prevents optional items with many combinatorial appearances
  // from crowding the required outfit base out of a bounded capsule.
  for (const anchor of anchors) {
    const reservable = pools.flatMap((pool) => pool.candidates).filter((candidate) => candidate.itemIds.includes(anchor.itemId))
      .map((candidate) => ({ candidate, additions: candidate.itemIds.filter((id) => !selected.has(id)) }))
      .filter(({ additions }) => selected.size + additions.length <= target)
      .sort((a, b) => a.additions.length - b.additions.length || compare(a.candidate.signature, b.candidate.signature));
    if (reservable.length) for (const id of reservable[0].candidate.itemIds) selected.add(id);
  }
  while (selected.size < target) {
    const choices = items.filter((item) => !selected.has(item.id)).map((item) => {
      const relevant = pools.flatMap((pool) => pool.candidates).filter((candidate) => candidate.itemIds.includes(item.id));
      const coverage = relevant.reduce((gain, candidate) => {
        const alreadySelected = candidate.itemIds.filter((id) => selected.has(id)).length;
        return gain + alreadySelected + 1 === candidate.itemIds.length ? 1000 : alreadySelected;
      }, 0);
      const baseDiversity = BASE_CATEGORIES.has(item.category) ? 1 : 0;
      return { item, vector: [coverage, baseDiversity] };
    }).sort((a, b) => b.vector[0] - a.vector[0] || b.vector[1] - a.vector[1] || compare(a.item.id, b.item.id));
    if (!choices.length) break;
    selected.add(choices[0].item.id);
  }
  return [...selected].sort(compare);
}

function chooseLooks(pool, selected, requiredLooks, anchors, recent, published, anchorUse) {
  const candidates = pool.candidates.filter((candidate) => candidate.itemIds.every((id) => selected.has(id)) && !published.has(candidate.signature));
  const chosen = [];
  while (chosen.length < requiredLooks && candidates.length) {
    candidates.sort((a, b) => {
      const anchorGain = anchors.filter((anchor) => anchorUse[anchor.itemId] < anchor.minimumOutfitUses && a.itemIds.includes(anchor.itemId)).length;
      const otherGain = anchors.filter((anchor) => anchorUse[anchor.itemId] < anchor.minimumOutfitUses && b.itemIds.includes(anchor.itemId)).length;
      const aBase = new Set(a.itemIds.filter((id) => pool.categoryById.get(id) && BASE_CATEGORIES.has(pool.categoryById.get(id))));
      const bBase = new Set(b.itemIds.filter((id) => pool.categoryById.get(id) && BASE_CATEGORIES.has(pool.categoryById.get(id))));
      const diversity = (candidateBase) => chosen.length ? Math.min(...chosen.map((look) => [...candidateBase].filter((id) => !look.baseIds.has(id)).length)) : candidateBase.size;
      return otherGain - anchorGain || Number(recent.has(a.signature)) - Number(recent.has(b.signature)) || diversity(bBase) - diversity(aBase) || compare(a.signature, b.signature);
    });
    const next = candidates.shift();
    const baseIds = new Set(next.itemIds.filter((id) => BASE_CATEGORIES.has(pool.categoryById.get(id))));
    chosen.push({ ...next, baseIds });
    published.add(next.signature);
    for (const anchor of anchors) if (next.itemIds.includes(anchor.itemId)) anchorUse[anchor.itemId] += 1;
  }
  return chosen;
}

export function buildCapsule(request) {
  const validation = validateCapsuleRequest(request);
  const baseTrace = { engineVersion: CAPSULE_ENGINE_VERSION, poolLimit: POOL_LIMIT, poolTruncated: false, poolSizes: {}, selectedSignatures: [], ruleFacts: [] };
  if (validation.length) return { result: emptyCapsuleResult(request, validation), trace: baseTrace };
  const excluded = new Set(array(request.constraints?.excludedItemIds).map(String));
  const anchors = [...request.anchors].sort((a, b) => compare(a.itemId, b.itemId));
  const seenIds = new Set();
  const scoped = [];
  let scopeMismatch = false;
  let modeMismatch = false;
  for (const source of request.wardrobe) {
    const id = garmentId(source);
    const scope = garmentScope(source);
    if (!id || seenIds.has(id)) return { result: emptyCapsuleResult(request, ["invalid_request"]), trace: baseTrace };
    seenIds.add(id);
    if (scope.mode !== request.mode || scope.ownerScope !== request.ownerScope) {
      scopeMismatch = true;
      if (scope.mode !== request.mode) modeMismatch = true;
      continue;
    }
    if (source.confirmed !== true || norm(source.status) !== "ready" || excluded.has(id)) continue;
    const item = publicItem(source);
    if (item.category !== "unknown") scoped.push(item);
  }
  if (scopeMismatch) return { result: emptyCapsuleResult(request, modeMismatch ? ["scope_mismatch", "demo_personal_mix_forbidden"] : ["scope_mismatch"]), trace: baseTrace };
  scoped.sort((a, b) => compare(a.id, b.id));
  const byId = new Map(scoped.map((item) => [item.id, item]));
  for (const anchor of anchors) {
    const raw = request.wardrobe.find((item) => garmentId(item) === anchor.itemId);
    if (!raw) return { result: emptyCapsuleResult(request, ["anchor_not_found"]), trace: baseTrace };
    if (excluded.has(anchor.itemId)) return { result: emptyCapsuleResult(request, ["anchor_excluded"]), trace: baseTrace };
    if (!byId.has(anchor.itemId)) return { result: emptyCapsuleResult(request, ["anchor_not_ready"]), trace: baseTrace };
  }
  if (scoped.length < request.itemTarget) return { result: { ...emptyCapsuleResult(request, ["target_size_insufficient"]), missingPieces: missingPieces(scoped, request.scenarios) }, trace: baseTrace };
  const groups = Object.fromEntries(["top", "bottom", "dress", "one_piece", "outerwear", "shoes", "accessory"].map((category) => [category, scoped.filter((item) => item.category === category)]));
  const categoryById = new Map(scoped.map((item) => [item.id, item.category]));
  const pools = [...request.scenarios].sort((a, b) => compare(a.scenarioId, b.scenarioId)).map((scenario) => {
    const all = combinations(groups, request.constraints, scenario).map((items) => evaluateOutfit(items, scenario)).filter(Boolean);
    const deduped = [...new Map(all.map((candidate) => [candidate.signature, candidate])).values()].sort((a, b) => compare(a.signature, b.signature));
    if (deduped.length > POOL_LIMIT) baseTrace.poolTruncated = true;
    const candidates = deduped.slice(0, POOL_LIMIT);
    baseTrace.poolSizes[scenario.scenarioId] = candidates.length;
    return { scenario, candidates, categoryById };
  });
  const itemIds = selectItems(scoped, anchors, pools, request.itemTarget);
  const selected = new Set(itemIds);
  const recent = new Set(array(request.constraints?.recentOutfitSignatures));
  const looks = [];
  const coverage = [];
  const published = new Set();
  const anchorUse = Object.fromEntries(anchors.map((anchor) => [anchor.itemId, 0]));
  for (const pool of pools) {
    const chosen = chooseLooks(pool, selected, pool.scenario.requiredLooks, anchors, recent, published, anchorUse);
    looks.push(...chosen.map((look) => ({ scenarioId: pool.scenario.scenarioId, itemIds: look.itemIds, rankingLevel: look.reasonCodes.length ? "good" : "excellent", reasonCodes: look.reasonCodes })));
    const availableLooks = chosen.length;
    coverage.push({ scenarioId: pool.scenario.scenarioId, requiredLooks: pool.scenario.requiredLooks, availableLooks, state: availableLooks >= pool.scenario.requiredLooks ? "covered" : availableLooks ? "partial" : "uncovered" });
  }
  const anchorCoverage = anchors.map((anchor) => {
    const actualUses = looks.filter((look) => look.itemIds.includes(anchor.itemId)).length;
    return { itemId: anchor.itemId, requiredUses: anchor.minimumOutfitUses, actualUses, state: actualUses >= anchor.minimumOutfitUses ? "covered" : actualUses ? "partial" : "uncovered" };
  });
  const coreCovered = pools.every((pool, index) => pool.scenario.importance !== "core" || coverage[index].state === "covered");
  const anchorsCovered = anchorCoverage.every((entry) => entry.state === "covered");
  const supportCovered = pools.every((pool, index) => pool.scenario.importance !== "support" || coverage[index].state === "covered");
  const status = coreCovered && anchorsCovered ? (supportCovered ? "ready" : "partial") : "hold";
  const reasons = [];
  if (!coreCovered) reasons.push("core_scenario_uncovered");
  if (!anchorsCovered) reasons.push("anchor_coverage_impossible");
  if (!supportCovered) reasons.push("support_scenario_partial");
  if (baseTrace.poolTruncated) reasons.push("candidate_pool_truncated");
  const unknownReasons = unique(looks.flatMap((look) => look.reasonCodes));
  baseTrace.selectedSignatures = looks.map((look) => canonicalSignature(look.itemIds));
  baseTrace.ruleFacts = unknownReasons.map((code) => ({ code, outcome: "not_evaluated" }));
  const result = {
    ...emptyCapsuleResult(request, reasons), status,
    itemIds: status === "hold" ? [] : itemIds,
    looks: status === "hold" ? [] : looks,
    coverage, anchorCoverage,
    strengths: status === "ready" ? ["capsule_core_coverage_complete"] : [],
    tradeoffs: unique([...unknownReasons, ...(supportCovered ? [] : ["support_scenario_partial"])]).sort(),
    missingPieces: status === "ready" ? [] : missingPieces(scoped, request.scenarios),
  };
  return { result, trace: baseTrace };
}
