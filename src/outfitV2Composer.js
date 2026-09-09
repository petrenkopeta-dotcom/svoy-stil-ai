export const OUTFIT_V2_VERSION = "local-outfit-composer-v2";

const CATEGORIES = ["top", "bottom", "dress", "one_piece", "shoes", "outerwear", "accessory"];
const BASE = new Set(["top", "bottom", "dress", "one_piece", "shoes"]);
const norm = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
const list = (value) => Array.isArray(value) ? value : [];
const compare = (a, b) => String(a).localeCompare(String(b));
const signature = (items) => items.map((item) => String(item.id)).sort(compare).join("|");
const product = (groups) => groups.reduce((sets, group) => sets.flatMap((set) => group.map((item) => [...set, item])), [[]]);

function empty(reasons, limitations = []) {
  return { version: OUTFIT_V2_VERSION, status: "hold", variants: [], noResultReasons: [...new Set(reasons)].sort(), limitations: [...new Set(limitations)].sort() };
}

function confirmedArray(item, field) {
  if (item.confirmedFacts && item.confirmedFacts[field] === true) return list(item[field]).map(norm).filter(Boolean);
  return [];
}

function confirmedBoolean(item, field) {
  return item.confirmedFacts?.[field] === true && typeof item[field] === "boolean" ? item[field] : null;
}

function eligibleWardrobe(request) {
  if (request?.mode !== "personal") return { error: "personal_mode_required" };
  if (!request.ownerScope || !Array.isArray(request.wardrobe)) return { error: "invalid_request" };
  const ids = new Set();
  const items = [];
  for (const source of request.wardrobe) {
    const id = source?.id == null ? "" : String(source.id);
    if (!id || ids.has(id)) return { error: "invalid_wardrobe" };
    ids.add(id);
    if (source.mode !== "personal") return { error: "demo_personal_mix_forbidden" };
    if (source.ownerScope !== request.ownerScope) return { error: "scope_mismatch" };
    if (source.confirmed !== true || norm(source.status) !== "ready" || !CATEGORIES.includes(norm(source.category))) continue;
    items.push({ ...source, id, category: norm(source.category) });
  }
  return { items: items.sort((a, b) => compare(a.id, b.id)) };
}

function respectsHardConstraints(items, constraints, context) {
  const ids = new Set(items.map((item) => item.id));
  if (list(constraints.excludedItemIds).some((id) => ids.has(String(id)))) return false;
  if (list(constraints.requiredItemIds).some((id) => !ids.has(String(id)))) return false;
  const categories = new Set(items.map((item) => item.category));
  if (list(constraints.requiredCategories).some((category) => !categories.has(norm(category)))) return false;
  if (Number.isInteger(constraints.maxAccessories) && items.filter((item) => item.category === "accessory").length > constraints.maxAccessories) return false;
  if (context?.confirmed !== true) return true;
  if (context.outerwearRequired === true && !categories.has("outerwear")) return false;
  if (context.waterproofShoesRequired === true && !items.some((item) => item.category === "shoes" && confirmedBoolean(item, "waterproof") === true)) return false;
  const occasion = norm(context.occasion);
  if (occasion) {
    for (const item of items.filter((entry) => BASE.has(entry.category))) {
      const occasions = confirmedArray(item, "occasions");
      if (occasions.length && !occasions.includes(occasion)) return false;
    }
  }
  return true;
}

function combinations(groups, constraints, context) {
  const bases = groups.top.length && groups.bottom.length && groups.shoes.length ? product([groups.top, groups.bottom, groups.shoes]) : [];
  const onePieces = [...groups.dress, ...groups.one_piece];
  if (onePieces.length && groups.shoes.length) bases.push(...product([onePieces, groups.shoes]));
  const layers = context?.confirmed === true && context.outerwearRequired === true ? groups.outerwear : [null, ...groups.outerwear];
  const accessories = constraints.maxAccessories === 0 ? [null] : [null, ...groups.accessory];
  return bases.flatMap((base) => layers.flatMap((layer) => accessories.map((accessory) => [...base, layer, accessory].filter(Boolean))));
}

function distance(a, b) {
  const left = new Set(a.itemIds);
  return b.itemIds.filter((id) => !left.has(id)).length + a.itemIds.filter((id) => !b.itemIds.includes(id)).length;
}

function selectThree(candidates) {
  const chosen = [];
  const remaining = [...candidates];
  while (chosen.length < 3 && remaining.length) {
    remaining.sort((a, b) => {
      const diversityA = chosen.length ? Math.min(...chosen.map((entry) => distance(entry, a))) : 0;
      const diversityB = chosen.length ? Math.min(...chosen.map((entry) => distance(entry, b))) : 0;
      return diversityB - diversityA || compare(a.signature, b.signature);
    });
    chosen.push(remaining.shift());
  }
  return chosen;
}

function availabilityLimitations(count) {
  if (count === 1) return ["only_one_variant_available"];
  if (count === 2) return ["only_two_variants_available"];
  return [];
}

/** Pure, deterministic, local-only personal wardrobe composer. */
export function composeOutfitV2(request = {}) {
  const scoped = eligibleWardrobe(request);
  if (scoped.error) return empty([scoped.error]);
  const constraints = request.constraints && typeof request.constraints === "object" ? request.constraints : {};
  const context = request.context?.confirmed === true ? request.context : null;
  const limitations = [];
  if (!context) limitations.push("context_not_confirmed");
  const anchorId = request.anchorId == null ? null : String(request.anchorId);
  const rawAnchor = anchorId ? request.wardrobe.find((item) => String(item?.id) === anchorId) : null;
  if (anchorId && !rawAnchor) return empty(["anchor_not_found"], limitations);
  const anchor = anchorId ? scoped.items.find((item) => item.id === anchorId) : null;
  if (anchorId && !anchor) return empty(["anchor_not_ready"], limitations);
  if (list(constraints.excludedItemIds).map(String).includes(anchorId)) return empty(["anchor_excluded"], limitations);
  const groups = Object.fromEntries(CATEGORIES.map((category) => [category, scoped.items.filter((item) => item.category === category)]));
  let candidates = combinations(groups, constraints, context)
    .filter((items) => !anchor || items.some((item) => item.id === anchor.id))
    .filter((items) => respectsHardConstraints(items, constraints, context));
  candidates = [...new Map(candidates.map((items) => [signature(items), { items, itemIds: items.map((item) => item.id).sort(compare), signature: signature(items) }])).values()]
    .sort((a, b) => compare(a.signature, b.signature));
  if (!candidates.length) return empty(["hard_constraints_unsatisfied"], limitations);
  const variants = selectThree(candidates).map((candidate, index) => ({
    variantId: `variant-${index + 1}`,
    itemIds: candidate.itemIds,
    signature: candidate.signature,
    reasonCodes: [anchor ? "anchor_preserved" : "complete_outfit"],
  }));
  return {
    version: OUTFIT_V2_VERSION,
    status: variants.length === 3 ? "ready" : "limited",
    variants,
    noResultReasons: [],
    limitations: [...limitations, ...availabilityLimitations(variants.length)].sort(),
  };
}
