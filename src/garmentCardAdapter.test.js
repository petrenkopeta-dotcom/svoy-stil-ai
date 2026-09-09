import test from "node:test";
import assert from "node:assert/strict";
import { featuresForGarmentCard, garmentCardView, updateGarmentCardFeatures } from "./garmentCardAdapter.js";

const legacy = { id: 42, name: "Жакет", type: "Верх", color: "Синий", style: "classic", custom: { keep: true } };

test("legacy garment card is adapted without changing its data", () => {
  const features = featuresForGarmentCard(legacy);
  assert.equal(features.garment_id, "42");
  assert.equal(features.colors[0].name, "Синий");
  assert.deepEqual(legacy.custom, { keep: true });
  assert.equal(legacy.stylist_features, undefined);
});

test("feature edits preserve legacy fields and taxonomy round-trip", () => {
  const updated = updateGarmentCardFeatures(legacy, { pattern: "check", fit: "straight", seasons: ["autumn", "winter"] });
  assert.deepEqual(updated.custom, legacy.custom);
  assert.equal(updated.color, legacy.color);
  assert.equal(updated.stylist_features.revision, 2);
  assert.deepEqual(featuresForGarmentCard(JSON.parse(JSON.stringify(updated))), updated.stylist_features);
});

test("card view exposes Russian labels without numeric scores", () => {
  const view = garmentCardView(updateGarmentCardFeatures(legacy, { pattern: "check" }));
  assert.equal(view.suggestions.find(({ key }) => key === "pattern").value, "Клетка");
  assert.equal(JSON.stringify(view).includes("score"), false);
  assert.equal(JSON.stringify(view).includes("confidence"), false);
});

test("stored schema version is validated instead of silently migrated", () => {
  assert.throws(() => featuresForGarmentCard({ ...legacy, stylist_features: { kind: "GarmentStyleFeatures", schema_version: "2.0" } }), /not supported/);
});
