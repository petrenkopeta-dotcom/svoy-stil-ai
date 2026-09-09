import test from "node:test";
import assert from "node:assert/strict";
import { composeOutfitV2, OUTFIT_V2_VERSION } from "./outfitV2Composer.js";

const item = (id, category, overrides = {}) => ({
  id, category, mode: "personal", ownerScope: "owner-a", status: "ready", confirmed: true,
  occasions: ["work"], waterproof: category === "shoes",
  confirmedFacts: { occasions: true, waterproof: category === "shoes" }, ...overrides,
});
const wardrobe = [
  item("top-1", "top"), item("top-2", "top"), item("bottom-1", "bottom"), item("bottom-2", "bottom"), item("bottom-3", "bottom"),
  item("shoes-1", "shoes"), item("shoes-2", "shoes"), item("outer-1", "outerwear"), item("bag-1", "accessory"),
];
const request = (overrides = {}) => ({ mode: "personal", ownerScope: "owner-a", wardrobe, anchorId: "top-1", context: { confirmed: true, occasion: "work" }, constraints: {}, ...overrides });

test("returns exactly three deterministic diverse variants and preserves the anchor", () => {
  const first = composeOutfitV2(request());
  const second = composeOutfitV2(request({ wardrobe: [...wardrobe].reverse() }));
  assert.equal(first.version, OUTFIT_V2_VERSION);
  assert.equal(first.status, "ready");
  assert.equal(first.variants.length, 3);
  assert.deepEqual(first, second);
  assert.ok(first.variants.every((variant) => variant.itemIds.includes("top-1")));
  assert.equal(new Set(first.variants.map((variant) => variant.signature)).size, 3);
});

test("enforces exclusions, required categories and confirmed weather constraints before selection", () => {
  const output = composeOutfitV2(request({
    context: { confirmed: true, occasion: "work", outerwearRequired: true, waterproofShoesRequired: true },
    constraints: { excludedItemIds: ["shoes-2"], requiredCategories: ["outerwear"], maxAccessories: 0 },
  }));
  assert.equal(output.status, "ready");
  assert.ok(output.variants.every((variant) => variant.itemIds.includes("outer-1") && variant.itemIds.includes("shoes-1") && !variant.itemIds.includes("shoes-2") && !variant.itemIds.includes("bag-1")));
});

test("fails closed for demo/personal and owner mixing", () => {
  const demo = wardrobe.map((entry) => entry.id === "top-2" ? { ...entry, mode: "demo" } : entry);
  assert.deepEqual(composeOutfitV2(request({ wardrobe: demo })).noResultReasons, ["demo_personal_mix_forbidden"]);
  const foreign = wardrobe.map((entry) => entry.id === "top-2" ? { ...entry, ownerScope: "owner-b" } : entry);
  assert.deepEqual(composeOutfitV2(request({ wardrobe: foreign })).noResultReasons, ["scope_mismatch"]);
  assert.deepEqual(composeOutfitV2(request({ mode: "demo" })).noResultReasons, ["personal_mode_required"]);
});

test("unconfirmed or unavailable wardrobe facts cannot satisfy anchors or hard constraints", () => {
  const draftAnchor = wardrobe.map((entry) => entry.id === "top-1" ? { ...entry, confirmed: false } : entry);
  assert.deepEqual(composeOutfitV2(request({ wardrobe: draftAnchor })).noResultReasons, ["anchor_not_ready"]);
  const unknownWaterproof = wardrobe.map((entry) => entry.category === "shoes" ? { ...entry, waterproof: true, confirmedFacts: { occasions: true } } : entry);
  const output = composeOutfitV2(request({ wardrobe: unknownWaterproof, context: { confirmed: true, waterproofShoesRequired: true } }));
  assert.deepEqual(output.noResultReasons, ["hard_constraints_unsatisfied"]);
});

test("unconfirmed context is ignored and reported without inventing claims or scores", () => {
  const output = composeOutfitV2(request({ context: { confirmed: false, occasion: "gala", outerwearRequired: true } }));
  assert.equal(output.status, "ready");
  assert.deepEqual(output.limitations, ["context_not_confirmed"]);
  assert.doesNotMatch(JSON.stringify(output), /"(?:score|weight|percent|confidence)"\s*:/i);
});

const goldenVariantCases = [
  {
    name: "one valid variant",
    wardrobe: [item("top-1", "top"), item("bottom-1", "bottom"), item("shoes-1", "shoes")],
    expectedStatus: "limited", expectedCount: 1, expectedReasons: [], expectedLimitations: ["only_one_variant_available"],
  },
  {
    name: "two valid variants",
    wardrobe: [item("top-1", "top"), item("bottom-1", "bottom"), item("bottom-2", "bottom"), item("shoes-1", "shoes")],
    expectedStatus: "limited", expectedCount: 2, expectedReasons: [], expectedLimitations: ["only_two_variants_available"],
  },
  {
    name: "three valid variants",
    wardrobe: [item("top-1", "top"), item("bottom-1", "bottom"), item("bottom-2", "bottom"), item("bottom-3", "bottom"), item("shoes-1", "shoes")],
    expectedStatus: "ready", expectedCount: 3, expectedReasons: [], expectedLimitations: [],
  },
  {
    name: "zero valid variants",
    wardrobe: [item("top-1", "top"), item("bottom-1", "bottom")],
    expectedStatus: "hold", expectedCount: 0, expectedReasons: ["hard_constraints_unsatisfied"], expectedLimitations: [],
  },
];

for (const golden of goldenVariantCases) test(`golden: ${golden.name}`, () => {
  const output = composeOutfitV2(request({ wardrobe: golden.wardrobe }));
  assert.equal(output.status, golden.expectedStatus);
  assert.equal(output.variants.length, golden.expectedCount);
  assert.deepEqual(output.noResultReasons, golden.expectedReasons);
  assert.deepEqual(output.limitations, golden.expectedLimitations);
  assert.equal(new Set(output.variants.map((variant) => variant.signature)).size, golden.expectedCount);
  assert.ok(output.variants.every((variant) => variant.itemIds.includes("top-1")));
});
