import test from "node:test";
import assert from "node:assert/strict";
import { buildCapsule } from "./capsuleEngine.js";

const item = (id, category, overrides = {}) => ({
  id, category, status: "ready", confirmed: true, mode: "personal", ownerScope: "owner-a",
  occasions: ["work"], colors: [{ name: "black" }], fit: "straight", ...overrides,
});

const wardrobe = [
  item("top-1", "top"), item("top-2", "top"), item("bottom-1", "bottom"), item("bottom-2", "bottom"),
  item("shoes-1", "shoes", { waterproof: true }), item("shoes-2", "shoes", { waterproof: true }),
  item("outer-1", "outerwear"), item("accessory-1", "accessory"), item("dress-1", "dress"),
];

const request = (overrides = {}) => ({
  schemaVersion: "capsule-request/0.1", requestId: "capsule-1", mode: "personal", ownerScope: "owner-a",
  itemTarget: 8, wardrobe, anchors: [{ itemId: "top-1", required: true, minimumOutfitUses: 1 }],
  scenarios: [{ scenarioId: "work", occasion: "work", importance: "core", requiredLooks: 2, weather: {} }],
  ...overrides,
});

test("builds the same ordered capsule for canonical input permutations", () => {
  const first = buildCapsule(request());
  const second = buildCapsule(request({ wardrobe: [...wardrobe].reverse(), scenarios: [...request().scenarios].reverse() }));
  assert.equal(first.result.status, "ready");
  assert.equal(first.result.itemIds.length, 8);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.result.looks.map((look) => look.itemIds.join("|"))).size, first.result.looks.length);
});

test("fails closed before generation for demo/personal or owner mixing", () => {
  const mixed = wardrobe.map((entry) => entry.id === "top-2" ? { ...entry, mode: "demo", ownerScope: "demo-session" } : entry);
  const output = buildCapsule(request({ wardrobe: mixed }));
  assert.equal(output.result.status, "hold");
  assert.deepEqual(output.result.itemIds, []);
  assert.deepEqual(output.result.noResultReasons, ["demo_personal_mix_forbidden", "scope_mismatch"]);
  assert.deepEqual(output.trace.poolSizes, {});
  const crossOwner = wardrobe.map((entry) => entry.id === "top-2" ? { ...entry, ownerScope: "owner-b" } : entry);
  assert.deepEqual(buildCapsule(request({ wardrobe: crossOwner })).result.noResultReasons, ["scope_mismatch"]);
});

test("distinguishes missing, excluded, and unready anchors", () => {
  assert.deepEqual(buildCapsule(request({ anchors: [{ itemId: "absent", required: true, minimumOutfitUses: 1 }] })).result.noResultReasons, ["anchor_not_found"]);
  assert.deepEqual(buildCapsule(request({ constraints: { excludedItemIds: ["top-1"] } })).result.noResultReasons, ["anchor_excluded"]);
  const unready = wardrobe.map((entry) => entry.id === "top-1" ? { ...entry, status: "draft" } : entry);
  assert.deepEqual(buildCapsule(request({ wardrobe: unready })).result.noResultReasons, ["anchor_not_ready"]);
});

test("unknown facts never become positive evidence and stay out of public numeric scoring", () => {
  const unknown = wardrobe.map((entry) => ({ ...entry, occasions: [], colors: [], fit: "unknown" }));
  const output = buildCapsule(request({ wardrobe: unknown }));
  assert.equal(output.result.status, "ready");
  assert.ok(output.result.tradeoffs.includes("occasion_data_insufficient"));
  assert.ok(output.result.tradeoffs.includes("weather_not_evaluated"));
  assert.ok(output.trace.ruleFacts.every((fact) => fact.outcome === "not_evaluated"));
  assert.doesNotMatch(JSON.stringify(output.result), /"(?:score|utility|weight|percent)"\s*:/);
});

test("hard weather requirements produce honest hold and a functional gap", () => {
  const noWaterproof = wardrobe.map((entry) => entry.category === "shoes" ? { ...entry, waterproof: false } : entry);
  const output = buildCapsule(request({
    wardrobe: noWaterproof,
    scenarios: [{ scenarioId: "rain", occasion: "work", importance: "core", requiredLooks: 1, weather: { precipitation: "rain", waterproofShoesRequired: true } }],
  }));
  assert.equal(output.result.status, "hold");
  assert.ok(output.result.noResultReasons.includes("core_scenario_uncovered"));
  assert.deepEqual(output.result.looks, []);
  assert.deepEqual(output.result.missingPieces[0], {
    slot: "shoes", requirement: { precipitation: "rain" },
    unlocks: [{ scenarioId: "rain", additionalLooks: 1 }], reasonCodes: ["missing_shoes"],
  });
});

test("rejects targets outside 8–12 and never pads a small wardrobe", () => {
  assert.deepEqual(buildCapsule(request({ itemTarget: 7 })).result.noResultReasons, ["invalid_item_target"]);
  const small = wardrobe.slice(0, 7);
  const output = buildCapsule(request({ wardrobe: small }));
  assert.equal(output.result.status, "hold");
  assert.deepEqual(output.result.itemIds, []);
  assert.deepEqual(output.result.noResultReasons, ["target_size_insufficient"]);
});
