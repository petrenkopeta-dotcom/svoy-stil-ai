import test from "node:test";
import assert from "node:assert/strict";
import {
  createAlternativeAction, createCandidateOutfit, createGarmentStyleFeatures, createReasoningFact,
  createScoredRecommendation, createStylistRequest, deserializeStylistEntity,
  garmentFeaturesFromLegacyCard, serializeStylistEntity,
} from "./stylistReasoningSchemas.js";

test("all six contracts validate and receive safe versioned defaults", () => {
  const request = createStylistRequest({ request_id: "r1" });
  const garment = createGarmentStyleFeatures({ garment_id: "g1" });
  const candidate = createCandidateOutfit({ candidate_id: "c1", request_id: "r1", garment_ids: ["g1"] });
  const fact = createReasoningFact({ fact_id: "f1", rule_id: "palette.harmony", message_key: "palette_neutral", evidence: ["g1"] });
  const action = createAlternativeAction({ action_id: "a1" });
  const recommendation = createScoredRecommendation({ recommendation_id: "rec1", candidate, facts: [fact], alternatives: [action] });
  for (const entity of [request, garment, candidate, fact, recommendation, action]) assert.equal(entity.schema_version, "1.0");
  assert.deepEqual(garment.seasons, ["all_season"]);
  assert.equal(garment.temperature, "unknown");
  assert.equal(recommendation.score, 0);
});

test("extended editable garment features round-trip without loss", () => {
  const garment = createGarmentStyleFeatures({ garment_id: "g7", revision: 4, category: "outerwear", subcategory: "trench", colors: [{ name: "sand", hex: "#cab58b", share: 0.8, role: "dominant" }, { name: "gold", hex: "#AA9911", share: 0.2, role: "accent" }], lightness: 0.7, saturation: 0.3, temperature: "warm", pattern: "solid", texture: "structured", fit: "relaxed", volume: "regular", length: "midi", formality: 4, seasons: ["spring", "autumn"], warmth: 3, accent: 2, style_tags: ["classic"] });
  assert.deepEqual(deserializeStylistEntity(serializeStylistEntity(garment)), garment);
});

test("legacy taxonomy and old card fields remain compatible", () => {
  const garment = garmentFeaturesFromLegacyCard({ id: 17, type: "Р’РµСЂС…", color: "Р‘РµР»С‹Р№", category: "top", style_tags: ["minimal"], seasons: ["summer"], formality: 2, warmth: 1, pattern: "solid", silhouette: "relaxed", length: "regular" });
  assert.equal(garment.garment_id, "17");
  assert.equal(garment.category, "top");
  assert.equal(garment.fit, "relaxed");
  assert.equal(garment.colors[0].role, "dominant");
});

test("invalid versions, ranges and taxonomy values are rejected", () => {
  assert.throws(() => createStylistRequest({ schema_version: "2.0", request_id: "r" }), /not supported/);
  assert.throws(() => createGarmentStyleFeatures({ garment_id: "g", warmth: 9 }), /between 1 and 5/);
  assert.throws(() => createGarmentStyleFeatures({ garment_id: "g", category: "hat" }), /not supported/);
  assert.throws(() => createCandidateOutfit({ candidate_id: "c", request_id: "r", garment_ids: [] }), /must not be empty/);
});

