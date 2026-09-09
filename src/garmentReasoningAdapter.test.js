import test from "node:test";
import assert from "node:assert/strict";
import { adaptGarmentsToReasoningInput, GARMENT_REASONING_ADAPTER_VERSION } from "./garmentReasoningAdapter.js";
import { completeGarmentsFixture, invalidGarmentsFixture, legacyGarmentsFixture, partialGarmentsFixture } from "./garmentReasoningAdapter.fixtures.js";
import { runStylistReasoningPipeline } from "./stylistReasoningPipeline.js";

test("complete confirmed stylist features feed color, silhouette and context", () => {
  const input = adaptGarmentsToReasoningInput(completeGarmentsFixture);
  assert.equal(input.adapter_version, GARMENT_REASONING_ADAPTER_VERSION);
  assert.deepEqual(input.items.map(({ color }) => color.family), ["navy", "red"]);
  assert.equal(input.silhouette.top.volume, "oversized");
  assert.equal(input.silhouette.bottom.length, "maxi");
  assert.equal(input.context.outfit.formality, 3);
  assert.deepEqual(input.context.outfit.garments[0].seasons, ["autumn", "winter"]);
  assert.equal(input.context.outfit.garments[0].warmth, 4);
  assert.equal(input.context.outfit.garments[0].texture, "structured");
  assert.deepEqual(input.items[0].provenance.colors, { kind: "user_confirmation", referenceId: "top-color" });
  const result = runStylistReasoningPipeline(input);
  assert.deepEqual(result.facts.map(({ code }) => code), ["NEUTRAL_BASE_SINGLE_ACCENT", "SIL_VOLUME_DOUBLE_OVERSIZED", "SIL_OVERLAPPING_LONG_LENGTHS"]);
});

test("partial input drops unconfirmed and unknown fields independently", () => {
  const input = adaptGarmentsToReasoningInput(partialGarmentsFixture);
  assert.equal(input.items.length, 1);
  assert.deepEqual(input.silhouette, {});
  assert.deepEqual(input.context, {});
  assert.deepEqual(input.provenance, []);
});

test("legacy garment without stylist_features is not promoted to confirmed evidence", () => {
  assert.deepEqual(adaptGarmentsToReasoningInput(legacyGarmentsFixture), { adapter_version: GARMENT_REASONING_ADAPTER_VERSION, items: [], silhouette: {}, context: {}, provenance: [] });
});

test("invalid confirmed values are discarded without throwing or leaking provenance", () => {
  assert.deepEqual(adaptGarmentsToReasoningInput(invalidGarmentsFixture), { adapter_version: GARMENT_REASONING_ADAPTER_VERSION, items: [], silhouette: {}, context: {}, provenance: [] });
});

test("flat fields require explicit per-field confirmation and preserve its provenance", () => {
  const input = adaptGarmentsToReasoningInput([{ id: "flat", category: "top", stylist_features: { colors: [{ name: "blue" }], volume: "oversized", confirmed_fields: ["colors", "volume"], provenance: { colors: { kind: "manual", referenceId: "c1" }, volume: { kind: "manual", referenceId: "v1" } } } }]);
  assert.equal(input.items[0].provenance.colors.referenceId, "c1");
  assert.equal(input.silhouette.top.provenance.volume.referenceId, "v1");
});
