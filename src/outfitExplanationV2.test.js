import test from "node:test";
import assert from "node:assert/strict";
import { explainPersonalOutfitV2, OUTFIT_EXPLANATION_V2_VERSION } from "./outfitExplanationV2.js";

const base = {
  source: "personal",
  outfitId: "look-12",
  outfitItemIds: ["top-1", "bottom-1", "shoes-1"],
  personalWardrobeItemIds: ["top-1", "bottom-1", "shoes-1", "coat-1"],
  facts: [
    { code: "NEUTRAL_BASE_SINGLE_ACCENT", confirmed: true, item_ids: ["top-1", "bottom-1"] },
    { code: "SIL_VOLUME_DOUBLE_OVERSIZED", confirmed: true, item_ids: ["top-1", "bottom-1"] },
    { code: "CONTEXT_FORMALITY_MATCH", confirmed: true, item_ids: ["top-1", "bottom-1", "shoes-1"] },
  ],
};

test("builds four grounded sections and an explicit tradeoff without public scores", () => {
  const result = explainPersonalOutfitV2(base);
  assert.equal(result.version, OUTFIT_EXPLANATION_V2_VERSION);
  assert.equal(result.status, "ready");
  assert.deepEqual(Object.keys(result.dimensions), ["color", "silhouette", "context", "practical_advice"]);
  assert.equal(result.dimensions.color.status, "supported");
  assert.equal(result.dimensions.silhouette.status, "tradeoff");
  assert.deepEqual(result.tradeoffs, ["SIL_VOLUME_DOUBLE_OVERSIZED"]);
  assert.match(result.dimensions.practical_advice.text, /замените одну объёмную вещь/i);
  assert.doesNotMatch(JSON.stringify(result), /"(?:score|rating|percent|confidence)"\s*:/i);
});

test("unconfirmed, unknown, or out-of-outfit facts stay unknown", () => {
  const result = explainPersonalOutfitV2({
    ...base,
    facts: [
      { code: "RELATED_SHADES_PRESENT", confirmed: false, item_ids: ["top-1", "bottom-1"] },
      { code: "MADE_UP", confirmed: true, item_ids: ["top-1"] },
      { code: "CTX_TOO_COLD_FOR_OUTFIT", confirmed: true, item_ids: ["coat-1"] },
    ],
  });
  assert.equal(result.status, "hold");
  assert.deepEqual(result.unknowns, ["color", "silhouette", "context", "practical_advice"]);
  assert.deepEqual(result.tradeoffs, []);
  assert.doesNotMatch(JSON.stringify(result), /RELATED_SHADES_PRESENT|MADE_UP|CTX_TOO_COLD/);
});

test("demo and mixed-provenance outfits fail closed at the personal wardrobe boundary", () => {
  const demo = explainPersonalOutfitV2({ ...base, source: "demo" });
  const mixed = explainPersonalOutfitV2({ ...base, outfitItemIds: [...base.outfitItemIds, "demo-1"] });
  assert.equal(demo.status, "hold");
  assert.equal(demo.source, "unsupported");
  assert.deepEqual(demo.item_ids, []);
  assert.equal(mixed.status, "hold");
  assert.deepEqual(mixed.item_ids, []);
  assert.equal(Object.values(mixed.dimensions).every(({ status }) => status === "unknown"), true);
});

test("renderer never accepts free text or emits claims about a person's body", () => {
  const result = explainPersonalOutfitV2({
    ...base,
    facts: [{ code: "NEUTRAL_BASE_SINGLE_ACCENT", confirmed: true, item_ids: ["top-1"], text: "Стройнит фигуру и скрывает тело" }],
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.status, "ready");
  assert.doesNotMatch(serialized, /стройн|фигур|скрывает тело|талия|бедр|рост|вес/i);
});
